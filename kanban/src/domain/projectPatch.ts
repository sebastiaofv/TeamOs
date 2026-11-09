// One change mechanism for board-level history events: forward-only operations
// computed in v1 shape and replayed onto the in-memory model.

import type { BoardData, BoardExtensions, LooseBoardData, RoadmapExtension, Task, Workflow } from './types';
import { getProjectData } from './projectData';
import { ROADMAP_VERSION, DAY_PLANNER_VERSION } from './constants';
import type { ProjectCheckpoint, ProjectFileV1 } from './projectFormat';
import { controlFromFile, KNOWN_PROJECT_EXTENSIONS, memberIndexFor, projectBlockFromFile, relationsFromFile, resolveInheritedPlanning, workflowBlockFromFile, workitemFromFile } from './projectFormat';
import { isRecord } from './util';

type Rec = Record<string, unknown>;
export type { ProjectPatchOp } from './projectPatchSchema';
import { projectCollectionIdentity, PROJECT_COLLECTION_PATHS, type ProjectBlockPath, type ProjectCollectionPath, type ProjectPatchOp } from './projectPatchSchema';
type ReplayState = { board?: { tasks?: Task[]; columns?: unknown[]; settings?: Rec }; extensions?: BoardExtensions } & Rec;

// Project and workflow come first: replaying a workitem needs the members of that moment.
const BLOCKS_BEFORE = ['project', 'workflow'] as const;
const BLOCKS_AFTER = ['relations', 'dayPlanner', 'views', 'extensions'] as const;

function read(file: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), file);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffProjectState(before: ProjectCheckpoint, after: ProjectCheckpoint): ProjectPatchOp[] {
    const ops: ProjectPatchOp[] = [];
    const block = (at: ProjectBlockPath) => { if (!same(read(before, at), read(after, at))) ops.push({ op: 'set', at, value: read(after, at) ?? null }); };
    BLOCKS_BEFORE.forEach(block);
    for (const at of PROJECT_COLLECTION_PATHS) {
        const key = (row: Rec) => projectCollectionIdentity(at, row);
        const previous = (read(before, at) || []) as Rec[], next = (read(after, at) || []) as Rec[];
        const previousByKey = new Map(previous.map((item) => [key(item), item]));
        const nextKeys = next.map(key), nextSet = new Set(nextKeys);
        const kept = previous.map(key).filter((id) => nextSet.has(id));
        for (const id of previousByKey.keys()) if (!nextSet.has(id)) ops.push({ op: 'remove', at, key: id });
        next.forEach((item, index) => { if (!same(previousByKey.get(nextKeys[index]), item)) ops.push({ op: 'upsert', at, key: nextKeys[index], value: item }); });
        const replayed = [...kept, ...nextKeys.filter((id) => !previousByKey.has(id))];
        if (!same(replayed, nextKeys)) ops.push({ op: 'order', at, keys: nextKeys });
    }
    BLOCKS_AFTER.forEach(block);
    return ops;
}

function collection(state: ReplayState, at: string): Rec[] {
    const extensions = (state.extensions || {}) as BoardExtensions;
    switch (at) {
        case 'workitems': return (state.board?.tasks || []) as unknown as Rec[];
        case 'projectControl.records': return (extensions.projectControl?.records || []) as unknown as Rec[];
        case 'roadmap.sprintResults.credits': return (extensions.sprintResults?.credits || []) as unknown as Rec[];
        case 'roadmap.sprintResults.closures': return (extensions.sprintResults?.closures || []) as unknown as Rec[];
        case 'roadmap.sprintParticipation': return (extensions.sprintParticipation?.entries || []) as unknown as Rec[];
        default: return (extensions.roadmap?.[at.split('.')[1] as 'milestones'] || []) as unknown as Rec[];
    }
}

function writeCollection(state: ReplayState, at: string, items: Rec[]): void {
    const extensions = state.extensions as BoardExtensions;
    if (at === 'workitems') { state.board = { ...state.board, tasks: items as unknown as Task[] }; return; }
    if (at === 'projectControl.records') {
        const records = items as unknown as NonNullable<BoardExtensions['projectControl']>['records'];
        const lastNumber = records.reduce((highest, record) => Math.max(highest, Number(record.id.match(/(\d+)$/)?.[1] || 0)), extensions.projectControl?.lastNumber || 0);
        extensions.projectControl = { version: 3, lastNumber, records };
        return;
    }
    if (at.startsWith('roadmap.sprintResults.')) {
        const current = extensions.sprintResults || { version: 1 as const, credits: [], closures: [] };
        extensions.sprintResults = { ...current, [at.split('.')[2]]: items };
        if (!extensions.sprintResults.credits.length && !extensions.sprintResults.closures.length) delete extensions.sprintResults;
        return;
    }
    if (at === 'roadmap.sprintParticipation') {
        if (items.length) extensions.sprintParticipation = { version: 1, entries: items as unknown as NonNullable<BoardExtensions['sprintParticipation']>['entries'] };
        else delete extensions.sprintParticipation;
        return;
    }
    const current: RoadmapExtension = extensions.roadmap || { version: ROADMAP_VERSION, milestones: [], phases: [], sprints: [] };
    extensions.roadmap = { ...current, [at.split('.')[1]]: items };
}

function applyBlock(state: ReplayState, at: string, value: unknown): void {
    const extensions = state.extensions as BoardExtensions;
    if (at === 'project') {
        const previous = getProjectData(state as LooseBoardData);
        const { project, title } = projectBlockFromFile(value as Rec);
        const names = new Map(project.members.map((member) => [member.id, member.name]));
        const oldIds = new Map(previous.members.map((member) => [member.name, member.id]));
        const rename = (name: string) => names.get(oldIds.get(name) || '') || name;
        state.board = { ...state.board, tasks: state.board?.tasks?.map((task) => ({
            ...task,
            assignees: task.assignees.map((name, index) => names.get(task.assigneeIds?.[index] || '') || rename(name)),
            responsible: names.get(task.responsibleId || '') || rename(task.responsible)
        })) };
        if (extensions.projectControl) extensions.projectControl = { ...extensions.projectControl, records: extensions.projectControl.records.map((record) => ({ ...record, owner: rename(record.owner), assignees: record.assignees.map(rename) })) };
        extensions.project = project;
        state.board = { ...state.board, settings: { ...state.board?.settings, title } };
    } else if (at === 'workflow') {
        for (const key of ['hierarchyAutomations', 'workitemAutomation', 'workflowTypes'] as const) delete extensions[key];
        const workflow = workflowBlockFromFile(value as Rec);
        Object.assign(extensions, workflow);
        state.board = { ...state.board, columns: (workflow.workflow as Workflow).states.map((item) => ({ status: item.id, title: item.name })) };
    } else if (at === 'relations') {
        delete extensions.taskRelations; delete extensions.permanentRelations;
        const project = getProjectData(state as LooseBoardData);
        Object.assign(extensions, relationsFromFile(value as ProjectFileV1['relations'], state.board?.tasks || [], { id: project.id, title: String(state.board?.settings?.title ?? '') }));
    } else if (at === 'dayPlanner') {
        const blocks = (value as { blocks?: unknown[] } | null)?.blocks || [];
        if (blocks.length) extensions.dayPlanner = { version: DAY_PLANNER_VERSION, blocks } as BoardExtensions['dayPlanner'];
        else delete extensions.dayPlanner;
    } else if (at === 'views') {
        const hidden = (value as { board?: { hiddenStateIds?: { technical?: string[]; functional?: string[] } } } | null)?.board?.hiddenStateIds;
        if (hidden) extensions.boardView = { version: 1, hiddenStateIds: hidden.technical || [], ...(hidden.functional ? { functionalHiddenStateIds: hidden.functional } : {}) };
        else delete extensions.boardView;
    } else if (at === 'extensions') {
        for (const key of Object.keys(extensions)) if (!KNOWN_PROJECT_EXTENSIONS.has(key)) delete extensions[key];
        Object.assign(extensions, value || {});
    }
}

/** Replay never mutates its input: earlier states stay valid observations. */
export function applyProjectPatch<T extends object>(input: T, ops: readonly ProjectPatchOp[]): T {
    const state = { ...input, board: { ...(input as ReplayState).board }, extensions: { ...(input as ReplayState).extensions } } as unknown as ReplayState;
    // An identity map per changed collection makes a bulk patch linear in its
    // input rows + operations. Flush before a block that can depend on those rows.
    const pending = new Map<ProjectCollectionPath, Map<string, Rec>>();
    let members: ReturnType<typeof memberIndexFor> | undefined;
    const flush = () => {
        for (const [at, rows] of pending) writeCollection(state, at, [...rows.values()]);
        pending.clear();
    };
    for (const op of ops) {
        if (op.op === 'set') { flush(); applyBlock(state, op.at, op.value); if (op.at === 'project') members = undefined; continue; }
        let rows = pending.get(op.at);
        if (!rows) { rows = new Map(collection(state, op.at).map((row) => [projectCollectionIdentity(op.at, row), row])); pending.set(op.at, rows); }
        if (op.op === 'remove') rows.delete(op.key);
        else if (op.op === 'order') {
            if (op.keys.length !== rows.size || op.keys.some((id) => !rows.has(id))) throw new Error('Invalid project patch collection order.');
            pending.set(op.at, new Map(op.keys.map((id) => [id, rows!.get(id)!])));
        } else {
            let value = op.value;
            if (op.at === 'workitems' || op.at === 'projectControl.records') {
                members ||= memberIndexFor(getProjectData(state as LooseBoardData));
                value = op.at === 'workitems' ? workitemFromFile(value, members) as unknown as Rec : controlFromFile(value, members) as unknown as Rec;
            }
            rows.set(op.key, value);
        }
    }
    flush();
    if (state.board?.tasks && ops.some((op) => op.at === 'workitems')) state.board.tasks = resolveInheritedPlanning(state.board.tasks);
    return state as unknown as T;
}

export const isProjectSnapshot = (value: unknown): value is BoardData => isRecord(value) && isRecord(value.board);
