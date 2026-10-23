import type { BoardData, LooseBoardData, ProjectData, ProjectMember, Task, TaskInput } from './types';
import { normalizeAssignees } from './taskAssignments';

export const PROJECT_STATUSES = ['planned', 'active', 'paused', 'completed', 'archived'] as const;
export const DEFAULT_PROJECT_TAGS = ['bug', 'feature', 'improvement', 'documentation'];
export const projectNameKey = (name: string): string => name.trim().toLowerCase();

export function createProjectIdentity(prefix = 'project'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function createProjectData(): ProjectData {
    return { version: 1, id: createProjectIdentity(), description: '', status: 'planned', members: [], tags: [...DEFAULT_PROJECT_TAGS] };
}

export type ProjectDataErrorCode = 'name' | 'duplicateMember' | 'memberInUse' | 'duplicateTag' | 'tagInUse' | 'tag' | 'unknownMember' | 'unknownTag' | 'invalid' | 'stale';
export class ProjectDataError extends Error {
    constructor(public readonly code: ProjectDataErrorCode) { super(`Invalid project data: ${code}`); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Strict extension boundary: never silently discard a malformed curated list. */
export function parseProjectData(value: unknown): ProjectData | undefined {
    if (value === undefined) return undefined;
    if (!isRecord(value) || value.version !== 1 || typeof value.id !== 'string' || !value.id.trim()
        || typeof value.description !== 'string' || (value.status !== null && !PROJECT_STATUSES.some((status) => status === value.status))
        || !Array.isArray(value.members) || !Array.isArray(value.tags)) throw new ProjectDataError('invalid');
    const ids = new Set<string>();
    const names = new Set<string>();
    const members: ProjectMember[] = value.members.map((member: unknown) => {
        if (!isRecord(member) || typeof member.id !== 'string' || !member.id.trim() || ids.has(member.id)
            || typeof member.name !== 'string' || !member.name.trim()) throw new ProjectDataError('name');
        if (names.has(projectNameKey(member.name))) throw new ProjectDataError('duplicateMember');
        ids.add(member.id);
        names.add(projectNameKey(member.name));
        return { id: member.id, name: member.name.trim() };
    });
    const tags = new Set<string>();
    for (const tag of value.tags) {
        if (typeof tag !== 'string' || !tag.trim() || tag.trim().length > 30) throw new ProjectDataError('tag');
        if (tags.has(projectNameKey(tag))) throw new ProjectDataError('duplicateTag');
        tags.add(projectNameKey(tag));
    }
    return { version: 1, id: value.id, description: value.description, status: value.status as ProjectData['status'], members, tags: [...tags] };
}

/** Missing extension → v1. Legacy names become local identities without inventing a lifecycle state. */
export function migrateProjectData(input: LooseBoardData): LooseBoardData {
    if (input.extensions?.project !== undefined) {
        parseProjectData(input.extensions.project);
        return input;
    }
    const members: ProjectMember[] = [];
    const tags = new Set<string>();
    const tasks: TaskInput[] = Array.isArray(input.board?.tasks) ? input.board.tasks : [];
    tasks.forEach((task) => {
        normalizeAssignees(task.assignees ?? task.assignee).forEach((name) => {
            if (!members.some((member) => projectNameKey(member.name) === projectNameKey(name))) {
                members.push({ id: `legacy-member_${encodeURIComponent(projectNameKey(name))}`, name });
            }
        });
        if (Array.isArray(task.tags)) task.tags.forEach((tag: unknown) => {
            if (typeof tag === 'string' && tag.trim() && tag.trim().length <= 30) tags.add(projectNameKey(tag));
        });
    });
    return { ...input, extensions: { ...input.extensions, project: {
        version: 1, id: createProjectIdentity(), description: '', status: null, members, tags: [...tags]
    } satisfies ProjectData } };
}

export function getProjectData(data: LooseBoardData): ProjectData {
    return parseProjectData(migrateProjectData(data).extensions?.project)!;
}

/** All write paths use this gate, not just the task editor. */
export function syncProjectAssignments(data: BoardData): void {
    const project = data.extensions.project;
    if (!project) return;
    for (const task of data.board.tasks) {
        const members = task.assignees.map((name) => project.members.find((member) => projectNameKey(member.name) === projectNameKey(name)));
        if (members.some((member) => !member)) throw new ProjectDataError('unknownMember');
        task.assigneeIds = members.map((member) => member!.id);
        task.assignees = members.map((member) => member!.name);
        const responsible = task.responsible ? project.members.find((member) => projectNameKey(member.name) === projectNameKey(task.responsible)) : undefined;
        if (task.responsible && (!responsible || !task.assigneeIds.includes(responsible.id))) throw new ProjectDataError('unknownMember');
        task.responsibleId = responsible?.id || '';
        task.responsible = responsible?.name || '';
        task.tags = task.tags.map((tag) => {
            const known = project.tags.find((entry) => projectNameKey(entry) === projectNameKey(tag));
            if (!known) throw new ProjectDataError('unknownTag');
            return known;
        });
    }
}

export function validateProjectReferences(project: ProjectData, tasks: readonly Task[]): void {
    tasks.forEach((task) => {
        if (!Array.isArray(task.assigneeIds) || task.assigneeIds.length !== task.assignees.length
            || task.assigneeIds.some((id, index) => !project.members.some((member) => member.id === id && member.name === task.assignees[index]))
            || typeof task.responsibleId !== 'string'
            || (task.responsibleId ? !project.members.some((member) => member.id === task.responsibleId && member.name === task.responsible && task.assigneeIds?.includes(member.id)) : Boolean(task.responsible))) {
            throw new ProjectDataError('unknownMember');
        }
        if (task.tags.some((tag) => !project.tags.includes(tag))) throw new ProjectDataError('unknownTag');
    });
}

export type ProjectSettingsDraft = { name: string; project: ProjectData };

/** Rename by identity, then refresh readable projections. Archived tasks count as uses. */
export function applyProjectSettings(data: BoardData, draft: ProjectSettingsDraft): void {
    if (!draft.name.trim()) throw new ProjectDataError('name');
    const before = data.extensions.project!;
    const after = parseProjectData(draft.project)!;
    if (before.id !== after.id) throw new ProjectDataError('invalid');
    for (const task of data.board.tasks) {
        for (const id of task.assigneeIds || []) {
            if (!after.members.some((member) => member.id === id)) throw new ProjectDataError('memberInUse');
        }
        if (task.tags.some((tag) => !after.tags.includes(tag))) throw new ProjectDataError('tagInUse');
        task.assignees = (task.assigneeIds || []).map((id) => after.members.find((member) => member.id === id)!.name);
        task.responsible = after.members.find((member) => member.id === task.responsibleId)?.name || '';
    }
    data.board.settings.title = draft.name.trim();
    data.extensions.project = after;
    syncProjectAssignments(data);
}
