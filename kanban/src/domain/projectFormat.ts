// Persisted project format v1 (see PROJECT_FORMAT.md).
//
// The only translation between project.json and the in-memory BoardData model.
// Every function here is pure; file access stays in infrastructure/persistence.

import type { Attachment, BoardData, BoardExtensions, ProjectData, ProjectMember, RoadmapExtension, SprintResults, Task, TaskRelation, Workflow, WorkflowTypes } from './types';
import type { CONTROL_KINDS, ControlComment, ControlKind, ControlRecord } from './projectControl';
import type { PermanentRelation, WorkitemReference } from './permanentRelations';
import type { WorkitemComment } from './comments';
import type { HierarchyAutomations } from './hierarchyAutomations';
import { BOARD_APP_ID, BOARD_SCHEMA_VERSION, DAY_PLANNER_VERSION, ROADMAP_VERSION } from './constants';
import { parseAttachmentReference } from './attachmentReferences';
import { getWorkflow } from './workflow';
import { WORKITEM_FIELDS, workitemFieldNames, workitemType } from './workitems';
import { projectNameKey } from './projectData';
import { isRecord } from './util';

export const PROJECT_FILE_SCHEMA_VERSION = 1;
type Rec = Record<string, unknown>;
type MemberIndex = { members: ProjectMember[]; byKey: Map<string, string>; names: Map<string, string> };

export type ProjectStorageMetadata = { version: 1; baselineEventId: string; historyTransactionId?: string; legacyFileName?: string; convertedFromHash?: string; checkpointBytes?: number; patchBytes?: number };
export type ProjectFileV1 = {
    meta: Rec; project: Rec; workflow: Rec; workitems: Rec[]; relations: { edges: Rec[]; external: Record<string, Rec> };
    roadmap: Rec; dayPlanner: { blocks: unknown[] }; projectControl: { records: Rec[] }; comments: Rec[];
    views?: Rec; system?: Rec; extensions?: Rec;
};
/** A project.json without comments, sequences, transfers or storage metadata. */
export type ProjectCheckpoint = Omit<ProjectFileV1, 'comments' | 'system'> & { comments?: Rec[]; system?: Rec };

// Fields that exist only on one Project Control kind. dueDate is shared by all kinds.
const CONTROL_FIELDS: Record<typeof CONTROL_KINDS[number], readonly string[]> = {
    risks: ['probability', 'impact', 'mitigationPlan', 'contingencyPlan', 'materializedDate', 'actualImpact'],
    decisions: ['decisionMaker', 'decisionDate', 'rationale'],
    deliverables: ['validator', 'deliveredDate', 'acceptedDate']
};
const ALL_CONTROL_FIELDS = Object.values(CONTROL_FIELDS).flat();
const CONTROL_DATES = new Set(['decisionDate', 'dueDate', 'deliveredDate', 'acceptedDate', 'materializedDate']);
const EPIC_EXCLUDED = ['parentId', 'effort', 'sprintId', 'pullRequests'];

export const isProjectFileV1 = (raw: unknown): raw is ProjectFileV1 => isRecord(raw) && isRecord(raw.meta) && raw.meta.schemaVersion === PROJECT_FILE_SCHEMA_VERSION && Array.isArray(raw.workitems) && !('board' in raw);
export const isLegacyProjectFile = (raw: unknown): boolean => isRecord(raw) && 'board' in raw && !('workitems' in raw);

function memberIndex(members: readonly ProjectMember[]): MemberIndex {
    return { members: [...members], byKey: new Map(members.map((member) => [projectNameKey(member.name), member.id])), names: new Map(members.map((member) => [member.id, member.name])) };
}
/** Free-text legacy names become deterministic members, so no reference is lost. */
function memberId(index: MemberIndex, name: string): string {
    const key = projectNameKey(name);
    const known = index.byKey.get(key);
    if (known) return known;
    const id = `legacy-member_${encodeURIComponent(key)}`;
    index.members.push({ id, name: name.trim() });
    index.byKey.set(key, id); index.names.set(id, name.trim());
    return id;
}
const memberName = (index: MemberIndex, id: unknown) => index.names.get(String(id)) || '';
const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value);

export function workitemToFile(task: Task, index: MemberIndex): Rec {
    const type = workitemType(task);
    const epic = type === 'epic';
    const fields = workitemFieldNames(type);
    const names = Array.isArray(task.assignees) ? task.assignees.filter((name) => name?.trim()) : [];
    return {
        id: task.id,
        ...(task.permanentId ? { permanentId: task.permanentId } : {}),
        ...(task.displayId ? { displayId: task.displayId } : {}),
        type, title: task.title, description: task.description || '', status: task.status,
        ...(epic ? {} : { parentId: task.parentId ?? null }),
        assigneeIds: names.map((name) => memberId(index, name)),
        responsibleId: task.responsible?.trim() ? memberId(index, task.responsible) : null,
        tags: task.tags || [],
        priority: task.priority ?? null,
        ...(epic ? {} : { effort: task.effort ?? null }),
        ...(task.storyPoints !== undefined ? { storyPoints: task.storyPoints } : {}),
        dueDate: emptyToNull(task.dueDate),
        ...(epic ? {} : { sprintId: emptyToNull(task.sprintId) }),
        phaseMode: task.phaseMode || (task.phaseId ? 'explicit' : 'none'),
        ...(task.phaseMode === 'explicit' || (!task.phaseMode && task.phaseId) ? { phaseId: task.phaseId } : {}),
        milestoneMode: task.milestoneMode || (task.milestoneId ? 'explicit' : 'none'),
        ...(task.milestoneMode === 'explicit' || (!task.milestoneMode && task.milestoneId) ? { milestoneId: task.milestoneId } : {}),
        blocked: Boolean(task.blocked),
        ...(task.blocked ? { blockerReason: task.blockerReason || '' } : {}),
        archived: Boolean(task.archived),
        checklist: task.checklist || [],
        ...(epic ? {} : { pullRequests: task.pullRequests || [] }),
        attachments: task.attachments || [],
        ...Object.fromEntries(fields.map((field) => [field, task[field] ?? ''])),
        ...(task.severity ? { severity: task.severity } : {}),
        ...(task.acceptance ? { acceptance: task.acceptance } : {}),
        ...(task.sprintHistory?.length ? { sprintHistory: task.sprintHistory } : {}),
        createdAt: task.createdAt, updatedAt: task.updatedAt
    };
}

function assertWorkitemFile(value: Rec): void {
    const type = String(value.type) as Task['type'] & string;
    const allowed = new Set<string>(workitemFieldNames(workitemType({ type })));
    const fail = (field: string) => { throw new Error(`Invalid project.json: workitem ${String(value.id)} has field ${field}, which does not apply to ${type}.`); };
    for (const field of WORKITEM_FIELDS) if (field in value && !allowed.has(field)) fail(field);
    if (type === 'epic') for (const field of EPIC_EXCLUDED) if (field in value) fail(field);
    if ('phaseId' in value && value.phaseMode !== 'explicit') fail('phaseId');
    if ('milestoneId' in value && value.milestoneMode !== 'explicit') fail('milestoneId');
    if ('blockerReason' in value && value.blocked !== true) fail('blockerReason');
}

export function workitemFromFile(value: Rec, index: MemberIndex): Task {
    assertWorkitemFile(value);
    const assigneeIds = (value.assigneeIds as string[] | undefined) || [];
    const fields = Object.fromEntries(WORKITEM_FIELDS.filter((field) => typeof value[field] === 'string' && value[field]).map((field) => [field, value[field]]));
    return {
        type: value.type as Task['type'], parentId: (value.parentId ?? null) as number | null,
        phaseMode: value.phaseMode as Task['phaseMode'], milestoneMode: value.milestoneMode as Task['milestoneMode'],
        ...fields,
        ...(value.severity ? { severity: value.severity as string } : {}),
        ...(value.acceptance ? { acceptance: value.acceptance as Task['acceptance'] } : {}),
        ...(value.sprintHistory ? { sprintHistory: value.sprintHistory as Task['sprintHistory'] } : {}),
        pullRequests: (value.pullRequests || []) as string[],
        ...(value.displayId ? { displayId: value.displayId as string } : {}),
        ...(value.permanentId ? { permanentId: value.permanentId as string } : {}),
        id: value.id as number, title: value.title as string, description: (value.description || '') as string,
        assignees: assigneeIds.map((id) => memberName(index, id)).filter(Boolean),
        responsible: memberName(index, value.responsibleId),
        assigneeIds: [...assigneeIds], responsibleId: (value.responsibleId ?? '') as string,
        tags: (value.tags || []) as string[], blocked: Boolean(value.blocked), blockerReason: (value.blockerReason || '') as string,
        checklist: (value.checklist || []) as Task['checklist'], attachments: (value.attachments || []) as Attachment[], archived: Boolean(value.archived),
        createdAt: value.createdAt as string, updatedAt: value.updatedAt as string, dueDate: (value.dueDate ?? '') as string,
        priority: (value.priority ?? null) as Task['priority'], effort: (value.effort ?? null) as Task['effort'],
        ...(value.storyPoints !== undefined ? { storyPoints: value.storyPoints as number | null } : {}),
        phaseId: (value.phaseId ?? '') as string, milestoneId: (value.milestoneId ?? '') as string, sprintId: (value.sprintId ?? '') as string,
        status: value.status as string
    };
}

/** v1 stores planning only where explicit; runtime rows keep the effective value. */
export function resolveInheritedPlanning(tasks: Task[]): Task[] {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const effective = (task: Task, field: 'phaseId' | 'milestoneId'): string => {
        const seen = new Set<number>(); let current: Task | undefined = task;
        while (current && !seen.has(current.id)) {
            seen.add(current.id);
            const mode = field === 'phaseId' ? current.phaseMode : current.milestoneMode;
            if (mode !== 'inherit') return mode === 'none' ? '' : current[field] || '';
            current = current.parentId == null ? undefined : byId.get(current.parentId);
        }
        return '';
    };
    return tasks.map((task) => {
        if (task.phaseMode !== 'inherit' && task.milestoneMode !== 'inherit') return task;
        const phaseId = effective(task, 'phaseId'), milestoneId = effective(task, 'milestoneId');
        return phaseId === task.phaseId && milestoneId === task.milestoneId ? task : { ...task, phaseId, milestoneId };
    });
}

export function controlToFile(record: ControlRecord, index: MemberIndex): Rec {
    const specific = CONTROL_FIELDS[record.kind];
    const value = record as unknown as Rec;
    return {
        id: record.id, kind: record.kind, title: record.title, description: record.description, status: record.status,
        ownerId: record.owner?.trim() ? memberId(index, record.owner) : null,
        assigneeIds: (record.assignees || []).map((name) => memberId(index, name)),
        tags: record.tags || [], related: record.related, dueDate: emptyToNull(record.dueDate),
        ...Object.fromEntries(specific.map((field) => [field, CONTROL_DATES.has(field) ? emptyToNull(value[field]) : value[field]])),
        ...(record.legacyWorkitemIds ? { legacyWorkitemIds: record.legacyWorkitemIds } : {}),
        createdAt: record.createdAt, updatedAt: record.updatedAt
    };
}

export function controlFromFile(value: Rec, index: MemberIndex, comments: ControlComment[] = []): ControlRecord {
    const kind = value.kind as ControlKind;
    const allowed = new Set(CONTROL_FIELDS[kind]);
    for (const field of ALL_CONTROL_FIELDS) if (field in value && !allowed.has(field)) throw new Error(`Invalid project.json: record ${String(value.id)} has field ${field}, which does not apply to ${kind}.`);
    const owner = memberName(index, value.ownerId);
    const assignees = ((value.assigneeIds || []) as string[]).map((id) => memberName(index, id)).filter(Boolean);
    const specific = Object.fromEntries(CONTROL_FIELDS[kind].map((field) => [field, value[field] ?? '']));
    return {
        id: value.id, kind, title: value.title, description: value.description, status: value.status, owner, assignees, tags: value.tags || [],
        probability: 'medium', impact: 'medium', mitigationPlan: '', contingencyPlan: '', decisionMaker: '', decisionDate: '', rationale: '', validator: '',
        deliveredDate: '', acceptedDate: '', materializedDate: '', actualImpact: '', ...specific, dueDate: value.dueDate ?? '',
        related: value.related, createdAt: value.createdAt, updatedAt: value.updatedAt, comments, history: [],
        ...(value.legacyWorkitemIds ? { legacyWorkitemIds: value.legacyWorkitemIds } : {})
    } as unknown as ControlRecord;
}

function relationsToFile(data: BoardData, tasks: readonly Task[]): ProjectFileV1['relations'] {
    const permanent = (task: Task) => task.permanentId || `local:${task.id}`;
    const byId = new Map(tasks.map((task) => [task.id, permanent(task)]));
    const local = new Set(byId.values());
    const edges = new Map<string, Rec>();
    const external: Record<string, Rec> = {};
    const add = (source: string, target: string, kind: string) => edges.set([source, target].sort().join('\u0000'), { source, target, kind });
    for (const relation of (data.extensions.taskRelations?.relations || []) as TaskRelation[]) {
        const source = byId.get(relation.sourceId), target = byId.get(relation.targetId);
        if (source && target) add(source, target, relation.kind);
    }
    for (const relation of data.extensions.permanentRelations?.relations || []) {
        add(relation.source.permanentId, relation.target.permanentId, relation.kind);
        for (const side of [relation.source, relation.target]) {
            if (local.has(side.permanentId)) continue;
            external[side.permanentId] = { projectId: side.projectId, projectTitle: side.projectTitle, taskId: side.taskId, ...(side.displayId ? { displayId: side.displayId } : {}), title: side.title };
        }
    }
    return { edges: [...edges.values()], external };
}

export function relationsFromFile(relations: ProjectFileV1['relations'] | undefined, tasks: readonly Task[], project: { id: string; title: string }): Pick<BoardExtensions, 'taskRelations' | 'permanentRelations'> {
    const byPermanent = new Map(tasks.map((task) => [task.permanentId || `local:${task.id}`, task]));
    const reference = (id: string): WorkitemReference | null => {
        const task = byPermanent.get(id);
        if (task) return { permanentId: id, projectId: project.id, projectTitle: project.title, fileName: '', taskId: task.id, title: task.title, ...(task.displayId ? { displayId: task.displayId } : {}) };
        const external = relations?.external[id];
        return external ? { permanentId: id, projectId: external.projectId as string, projectTitle: external.projectTitle as string, fileName: '', taskId: external.taskId as number, title: external.title as string, ...(external.displayId ? { displayId: external.displayId as string } : {}) } : null;
    };
    const taskRelations: TaskRelation[] = []; const permanentRelations: PermanentRelation[] = [];
    for (const edge of relations?.edges || []) {
        const sourceId = edge.source as string, targetId = edge.target as string, kind = edge.kind as TaskRelation['kind'];
        const sourceTask = byPermanent.get(sourceId), targetTask = byPermanent.get(targetId);
        if (sourceTask && targetTask) { taskRelations.push({ sourceId: sourceTask.id, targetId: targetTask.id, kind }); continue; }
        const source = reference(sourceId), target = reference(targetId);
        if (!source || !target) throw new Error('Invalid project.json: relation endpoint is not resolvable.');
        permanentRelations.push({ source, target, kind });
    }
    return {
        ...(taskRelations.length ? { taskRelations: { version: 1 as const, relations: taskRelations } } : {}),
        ...(permanentRelations.length ? { permanentRelations: { version: 1 as const, relations: permanentRelations } } : {})
    };
}

function roadmapToFile(extensions: BoardExtensions): Rec {
    const roadmap = extensions.roadmap;
    const results = extensions.sprintResults;
    const closed = new Set(results?.closures.map((closure) => closure.sprintId));
    return {
        milestones: roadmap?.milestones || [], phases: roadmap?.phases || [], sprints: roadmap?.sprints || [],
        sprintResults: { credits: results?.credits || [], closures: results?.closures || [] },
        sprintParticipation: (extensions.sprintParticipation?.entries || []).filter((entry) => !closed.has(entry.sprintId))
    };
}

export function roadmapBlocksFromFile(roadmap: Rec): Pick<BoardExtensions, 'roadmap' | 'sprintResults' | 'sprintParticipation'> {
    const lists = { milestones: (roadmap.milestones || []) as RoadmapExtension['milestones'], phases: (roadmap.phases || []) as RoadmapExtension['phases'], sprints: (roadmap.sprints || []) as RoadmapExtension['sprints'] };
    const results = (roadmap.sprintResults || {}) as Partial<SprintResults>;
    const participation = (roadmap.sprintParticipation || []) as NonNullable<BoardExtensions['sprintParticipation']>['entries'];
    return {
        ...(lists.milestones.length || lists.phases.length || lists.sprints.length ? { roadmap: { version: ROADMAP_VERSION, ...lists } } : {}),
        ...(results.credits?.length || results.closures?.length ? { sprintResults: { version: 1 as const, credits: results.credits || [], closures: results.closures || [] } } : {}),
        ...(participation.length ? { sprintParticipation: { version: 1 as const, entries: participation } } : {})
    };
}

const withoutVersion = <T extends object>(value: T): Rec => {
    const { version: _version, ...rest } = value as T & { version?: unknown };
    void _version;
    return rest;
};

export function workflowBlockFromFile(block: Rec): Pick<BoardExtensions, 'workflow' | 'functionalWorkflow' | 'workflowTypes' | 'hierarchyAutomations' | 'workitemAutomation'> {
    const automation = (block.automation || {}) as { hierarchy?: Rec; transitions?: Rec };
    return {
        workflow: { version: 2, ...(block.technical as Rec) } as Workflow,
        functionalWorkflow: { version: 2, ...(block.functional as Rec) } as Workflow,
        ...(block.types ? { workflowTypes: { version: 1, ...(block.types as Rec) } as WorkflowTypes } : {}),
        ...(automation.hierarchy ? { hierarchyAutomations: { version: 1, ...automation.hierarchy } as HierarchyAutomations } : {}),
        ...(automation.transitions ? { workitemAutomation: { version: 1, ...automation.transitions } as BoardExtensions['workitemAutomation'] } : {})
    };
}

export function projectBlockFromFile(block: Rec): { project: ProjectData; title: string } {
    const { title, derived: _derived, ...project } = block;
    void _derived;
    return { project: { version: 1, ...project } as ProjectData, title: title as string };
}

export const memberIndexFor = (project: { members?: readonly ProjectMember[] } | undefined) => memberIndex(project?.members || []);

const KNOWN_EXTENSIONS = new Set(['project', 'workflow', 'functionalWorkflow', 'workflowTypes', 'hierarchyAutomations', 'workitemAutomation', 'roadmap', 'sprintResults', 'sprintParticipation', 'dayPlanner', 'projectControl', 'conversations', 'taskRelations', 'permanentRelations', 'boardView', 'taskIdentity', 'sprintCatalog', 'projectTransfers', 'projectStorage', 'timeline', 'conversationRefs']);

/** Runtime → project.json. Record and transfer histories belong to history.json and are never written here. */
export function toProjectFile(data: BoardData): ProjectFileV1 {
    const extensions = data.extensions;
    const project = extensions.project;
    const index = memberIndexFor(project);
    const technical = getWorkflow(data);
    const workitems = data.board.tasks.map((task) => workitemToFile(task, index));
    const records = (extensions.projectControl?.records || []).map((record) => controlToFile(record, index));
    const comments: Rec[] = [
        ...(extensions.conversations?.entries || []).map(({ taskId, workitemKey, workitemCreatedAt, ...comment }: WorkitemComment) => ({ ...comment, subject: { type: 'workitem', taskId, workitemKey, workitemCreatedAt } })),
        ...(extensions.projectControl?.records || []).flatMap((record) => record.comments.map((comment) => ({ ...comment, subject: { type: 'control', recordId: record.id } })))
    ];
    const unknown = Object.fromEntries(Object.entries(extensions).filter(([key]) => !KNOWN_EXTENSIONS.has(key)));
    const storage = extensions.projectStorage as ProjectStorageMetadata | undefined;
    const automation = {
        ...(extensions.hierarchyAutomations ? { hierarchy: withoutVersion(extensions.hierarchyAutomations) } : {}),
        ...(extensions.workitemAutomation ? { transitions: withoutVersion(extensions.workitemAutomation) } : {})
    };
    const views = extensions.boardView ? { board: { hiddenStateIds: { technical: extensions.boardView.hiddenStateIds, ...(extensions.boardView.functionalHiddenStateIds ? { functional: extensions.boardView.functionalHiddenStateIds } : {}) } } } : undefined;
    return {
        meta: { schemaVersion: PROJECT_FILE_SCHEMA_VERSION, appId: BOARD_APP_ID, revision: data.meta.revision ?? 0, createdAt: data.meta.createdAt, updatedAt: data.meta.updatedAt },
        project: { ...(project ? withoutVersion({ ...project, members: index.members }) : {}), title: data.board.settings.title },
        workflow: {
            technical: withoutVersion(technical),
            functional: withoutVersion((extensions.functionalWorkflow as Workflow | undefined) || technical),
            ...(extensions.workflowTypes ? { types: withoutVersion(extensions.workflowTypes) } : {}),
            automation
        },
        workitems,
        relations: relationsToFile(data, data.board.tasks),
        roadmap: roadmapToFile(extensions),
        dayPlanner: { blocks: extensions.dayPlanner?.blocks || [] },
        projectControl: { records },
        comments,
        ...(views ? { views } : {}),
        system: {
            sequences: {
                workitems: { lastId: extensions.taskIdentity && isRecord(extensions.taskIdentity) ? extensions.taskIdentity.highWaterMark ?? 0 : 0 },
                sprints: { lastNumber: extensions.sprintCatalog?.lastNumber ?? 0, entries: extensions.sprintCatalog?.entries || [] },
                controlRecords: { lastNumber: extensions.projectControl?.lastNumber ?? 0 }
            },
            ...(storage ? { storage: withoutVersion(storage) } : {}),
            transfers: extensions.projectTransfers?.operations || []
        },
        ...(Object.keys(unknown).length ? { extensions: unknown } : {})
    };
}

export function toProjectCheckpoint(data: BoardData): ProjectCheckpoint {
    const { comments: _comments, system: _system, ...checkpoint } = toProjectFile(data);
    void _comments; void _system;
    return checkpoint;
}

const recordNumber = (id: unknown) => Number(String(id).match(/(\d+)$/)?.[1] || 0);

/** project.json (or a checkpoint) → runtime. */
export function fromProjectFile(file: ProjectFileV1 | ProjectCheckpoint): BoardData {
    if (isRecord(file.meta) && file.meta.schemaVersion !== PROJECT_FILE_SCHEMA_VERSION) throw new Error('Invalid project.json: unsupported schemaVersion.');
    const { project, title } = projectBlockFromFile(file.project);
    const index = memberIndexFor(project);
    const tasks = resolveInheritedPlanning(file.workitems.map((item) => workitemFromFile(item, index)));
    const workflow = workflowBlockFromFile(file.workflow);
    const comments = file.comments || [];
    const controlComments = new Map<string, ControlComment[]>();
    const workitemComments: WorkitemComment[] = [];
    for (const { subject, ...comment } of comments) {
        const about = subject as Rec;
        if (about.type === 'control') {
            const list = controlComments.get(about.recordId as string) || [];
            list.push(comment as unknown as ControlComment);
            controlComments.set(about.recordId as string, list);
        } else {
            const { type: _type, ...reference } = about;
            void _type;
            workitemComments.push({ ...comment, ...reference } as unknown as WorkitemComment);
        }
    }
    const records = (file.projectControl?.records || []).map((record) => controlFromFile(record, index, controlComments.get(record.id as string) || []));
    const system = isRecord(file.system) ? file.system : undefined;
    const sequences = (system?.sequences || {}) as { workitems?: { lastId: number }; sprints?: { lastNumber: number; entries: unknown[] }; controlRecords?: { lastNumber: number } };
    const lastNumber = sequences.controlRecords?.lastNumber ?? records.reduce((highest, record) => Math.max(highest, recordNumber(record.id)), 0);
    const planner = file.dayPlanner?.blocks || [];
    const board = (file.views?.board || undefined) as { hiddenStateIds?: { technical?: string[]; functional?: string[] } } | undefined;
    const transfers = (system?.transfers || []) as NonNullable<BoardExtensions['projectTransfers']>['operations'];
    const storage = system?.storage as Rec | undefined;
    const extensions: BoardExtensions = {
        ...(file.extensions || {}),
        project,
        ...workflow,
        ...roadmapBlocksFromFile(file.roadmap || {}),
        ...(planner.length ? { dayPlanner: { version: DAY_PLANNER_VERSION, blocks: planner } as BoardExtensions['dayPlanner'] } : {}),
        ...(records.length || lastNumber ? { projectControl: { version: 3 as const, lastNumber, records } } : {}),
        ...(workitemComments.length ? { conversations: { version: 1 as const, entries: workitemComments } } : {}),
        ...relationsFromFile(file.relations, tasks, { id: project.id, title }),
        ...(board ? { boardView: { version: 1 as const, hiddenStateIds: board.hiddenStateIds?.technical || [], ...(board.hiddenStateIds?.functional ? { functionalHiddenStateIds: board.hiddenStateIds.functional } : {}) } } : {}),
        ...(system ? {
            taskIdentity: { version: 1, highWaterMark: sequences.workitems?.lastId ?? 0 },
            sprintCatalog: { version: 1 as const, lastNumber: sequences.sprints?.lastNumber ?? 0, entries: (sequences.sprints?.entries || []) as NonNullable<BoardExtensions['sprintCatalog']>['entries'] },
            ...(transfers.length ? { projectTransfers: { version: 1 as const, operations: transfers } } : {}),
            ...(storage ? { projectStorage: { version: 1, ...storage } as ProjectStorageMetadata } : {})
        } : {})
    };
    // A checkpoint taken before projects existed: replay keeps deriving members, as it always has.
    if (file.project.derived) delete extensions.project;
    const meta = file.meta as Rec;
    return {
        meta: { schemaVersion: BOARD_SCHEMA_VERSION, appId: BOARD_APP_ID, revision: (meta.revision ?? 0) as number, createdAt: meta.createdAt as string, updatedAt: meta.updatedAt as string },
        board: { columns: (workflow.workflow as Workflow).states.map((state) => ({ status: state.id, title: state.name })), tasks, settings: { title } },
        extensions
    };
}

/** Parse any project text: v1 becomes runtime, older shapes pass through to the legacy path. */
export function parseProjectText(text: string): unknown {
    const raw: unknown = JSON.parse(text);
    if (isRecord(raw) && 'board' in raw && 'workitems' in raw) throw new Error('Ambiguous project file: it contains both board and workitems.');
    if (isRecord(raw) && Array.isArray(raw.workitems) && !isProjectFileV1(raw)) throw new Error('Unsupported project file version.');
    return isProjectFileV1(raw) ? fromProjectFile(attachmentsFromHashes(raw, String(raw.project.id))) : raw;
}

const SHA256 = /^[a-f0-9]{64}$/;

/** At the text boundary only: `dataUrl` references ⇄ bare content hashes. */
export function attachmentsToHashes<T>(value: T): T {
    if (Array.isArray(value)) return value.map(attachmentsToHashes) as T;
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
        if (key !== 'dataUrl' || typeof child !== 'string') return [key, attachmentsToHashes(child)];
        const reference = parseAttachmentReference(child);
        if (!reference) throw new Error('Attachment must be stored in this project’s attachments/ directory.');
        return ['sha256', reference.fileName];
    })) as T;
}

export function attachmentsFromHashes<T>(value: T, projectId: string): T {
    if (Array.isArray(value)) return value.map((item) => attachmentsFromHashes(item, projectId)) as T;
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
        if (key === 'dataUrl') throw new Error('Attachment must reference a file in this project’s attachments/ directory.');
        if (key !== 'sha256') return [key, attachmentsFromHashes(child, projectId)];
        if (typeof child !== 'string' || !SHA256.test(child)) throw new Error('Invalid attachment hash.');
        return ['dataUrl', `teamos-attachment:${encodeURIComponent(projectId)}/${child}`];
    })) as T;
}
