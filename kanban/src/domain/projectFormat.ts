// Persisted project format v1 (see PROJECT_FORMAT.md).
//
// The only translation between project.json and the in-memory BoardData model.
// Every function here is pure; file access stays in infrastructure/persistence.
// Entity shapes and their validation live in projectFileSchema.ts.

import type {
    BoardData, BoardExtensions, DayPlanBlock, ProjectData, ProjectMember, RoadmapExtension, SprintCatalog, SprintClosure, SprintCredit,
    Task, TaskRelation, Workflow, WorkflowTypes
} from './types';
import type { ControlComment, ControlRecord } from './projectControl';
import type { PermanentRelation, WorkitemReference } from './permanentRelations';
import type { WorkitemComment } from './comments';
import type { HierarchyAutomations } from './hierarchyAutomations';
import type {
    CommentFile, ControlRecordFile, DayPlanBlockFile, FrozenMembersFile, SprintClosureFile, SprintCreditFile, SprintParticipationFile, WorkitemFile
} from './projectFileSchema';
import { BOARD_APP_ID, BOARD_SCHEMA_VERSION, DAY_PLANNER_VERSION, ROADMAP_VERSION } from './constants';
import { parseAttachmentReference } from './attachmentReferences';
import { getWorkflow } from './workflow';
import { WORKITEM_FIELDS, workitemFieldNames, workitemType } from './workitems';
import { getProjectData, projectNameKey } from './projectData';
import { isRecord } from './util';
import { assertControlComment } from './controlHistory';
import {
    assertControlRecordFile, assertWorkitemFile, carriesStoryPoints, CONTROL_DATE_FIELDS, CONTROL_KIND_FROM_FILE, CONTROL_TYPE_FIELDS, CONTROL_TYPE_TO_FILE,
    workitemFieldApplies
} from './projectFileSchema';

export { assertWorkitemFile } from './projectFileSchema';

export const PROJECT_FILE_SCHEMA_VERSION = 1;
type Rec = Record<string, unknown>;
type MemberIndex = { members: ProjectMember[]; byKey: Map<string, string>; names: Map<string, string> };
type SprintParticipationEntries = NonNullable<BoardExtensions['sprintParticipation']>['entries'];
type TransferOperations = NonNullable<BoardExtensions['projectTransfers']>['operations'];
type TransferOperation = TransferOperations[number];
/** A reference to a workitem, possibly in another project. `fileName` is kept only when set. */
type WorkitemReferenceFile = Omit<WorkitemReference, 'taskId' | 'fileName'> & { workitemId: number; fileName?: string };
type TransferFile = Omit<TransferOperation, 'from' | 'to' | 'sourceTask'> & {
    from: WorkitemReferenceFile; to: WorkitemReferenceFile; sourceWorkitem: TransferOperation['sourceTask'];
};

export type ProjectStorageMetadata = {
    version: 1;
    baselineEventId: string;
    historyTransactionId?: string;
    legacyFileName?: string;
    convertedFromHash?: string;
    checkpointBytes?: number;
    patchBytes?: number;
};
type ProjectFileMeta = { schemaVersion: 1; appId: string; revision: number; createdAt: string; updatedAt: string };
type ProjectFileProject = Omit<ProjectData, 'version'> & { title: string; derived?: true };
type ProjectFileWorkflow = {
    technical: Omit<Workflow, 'version'>;
    functional: Omit<Workflow, 'version'>;
    types?: Omit<WorkflowTypes, 'version'>;
    automation: {
        hierarchy?: Omit<HierarchyAutomations, 'version'>;
        transitions?: Omit<NonNullable<BoardExtensions['workitemAutomation']>, 'version'>;
    };
};
type ProjectFileRoadmap = Pick<RoadmapExtension, 'milestones' | 'phases' | 'sprints'> & {
    sprintResults: { credits: SprintCreditFile[]; closures: SprintClosureFile[] };
    sprintParticipation: SprintParticipationFile[];
};
type ProjectFileSystem = {
    sequences: {
        workitems: { lastId: number };
        sprints: { lastNumber: number };
        controlRecords: { lastNumber: number };
    };
    /** The number each Sprint received, including deleted Sprints, so numbers are never reused. */
    sprintNumbers: SprintCatalog['entries'];
    storage?: Omit<ProjectStorageMetadata, 'version'>;
    transfers: TransferFile[];
};
type HiddenStateIds = { technical?: string[]; functional?: string[] };
type ProjectFileViews = { board: { hiddenStateIds: HiddenStateIds } };

export type ProjectFileV1 = {
    meta: ProjectFileMeta;
    project: ProjectFileProject;
    workflow: ProjectFileWorkflow;
    workitems: WorkitemFile[];
    relations: { edges: Rec[]; external: Record<string, Rec> };
    roadmap: ProjectFileRoadmap;
    dayPlanner: { blocks: DayPlanBlockFile[] };
    projectControl: { records: ControlRecordFile[] };
    comments: CommentFile[];
    views?: ProjectFileViews;
    system?: ProjectFileSystem;
    extensions?: Rec;
};
/** A project.json without comments, sequences, transfers or storage metadata. */
export type ProjectCheckpoint = Omit<ProjectFileV1, 'comments' | 'system'> & { comments?: CommentFile[]; system?: ProjectFileSystem };

/** v1 has no "explicit without a value": such a row is simply unplanned. */
const persistedPlanningMode = (mode: Task['phaseMode'], id: string) => (mode === 'explicit' && !id ? 'none' : mode || (id ? 'explicit' : 'none'));

export const isProjectFileV1 = (raw: unknown): raw is ProjectFileV1 =>
    isRecord(raw) && isRecord(raw.meta) && raw.meta.schemaVersion === PROJECT_FILE_SCHEMA_VERSION
    && Array.isArray(raw.workitems) && !('board' in raw);
export const isLegacyProjectFile = (raw: unknown): boolean => isRecord(raw) && 'board' in raw && !('workitems' in raw);

function memberIndex(members: readonly ProjectMember[]): MemberIndex {
    return {
        members: [...members],
        byKey: new Map(members.map((member) => [projectNameKey(member.name), member.id])),
        names: new Map(members.map((member) => [member.id, member.name]))
    };
}
export const memberIndexFor = (project: { members?: readonly ProjectMember[] } | undefined) => memberIndex(project?.members || []);

/** Free-text legacy names become deterministic members, so no reference is lost. */
function memberId(index: MemberIndex, name: string): string {
    const key = projectNameKey(name);
    const known = index.byKey.get(key);
    if (known) return known;
    const id = `legacy-member_${encodeURIComponent(key)}`;
    index.members.push({ id, name: name.trim() });
    index.byKey.set(key, id);
    index.names.set(id, name.trim());
    return id;
}
function memberName(index: MemberIndex, id: string | null | undefined): string {
    if (id === null || id === undefined || id === '') return '';
    const name = index.names.get(id);
    if (!name) throw new Error(`Invalid project.json: unknown member ${id}.`);
    return name;
}
const emptyToNull = <T>(value: T | '' | undefined): T | null => (value === '' || value === undefined ? null : value);

export function workitemToFile(task: Task, index: MemberIndex, parentType?: string): WorkitemFile {
    const type = workitemType(task);
    const epic = type === 'epic';
    const names = Array.isArray(task.assignees) ? task.assignees.filter((name) => name?.trim()) : [];
    const phaseMode = persistedPlanningMode(task.phaseMode, task.phaseId);
    const milestoneMode = persistedPlanningMode(task.milestoneMode, task.milestoneId);
    const textFields = Object.fromEntries(workitemFieldNames(type).map((field) => [field, task[field] ?? '']));
    return {
        id: task.id,
        ...(task.permanentId ? { permanentId: task.permanentId } : {}),
        ...(task.displayId ? { displayId: task.displayId } : {}),
        type,
        title: task.title,
        description: task.description || '',
        status: task.status,
        ...(epic ? {} : { parentId: task.parentId ?? null }),
        assigneeIds: names.map((name) => memberId(index, name)),
        responsibleId: task.responsible?.trim() ? memberId(index, task.responsible) : null,
        tags: task.tags || [],
        priority: task.priority ?? null,
        ...(epic ? {} : { effort: task.effort ?? null }),
        ...(task.storyPoints !== undefined && carriesStoryPoints(type, parentType) ? { storyPoints: task.storyPoints } : {}),
        dueDate: emptyToNull(task.dueDate),
        ...(epic ? {} : { sprintId: emptyToNull(task.sprintId) }),
        phaseMode,
        ...(phaseMode === 'explicit' ? { phaseId: task.phaseId } : {}),
        milestoneMode,
        ...(milestoneMode === 'explicit' ? { milestoneId: task.milestoneId } : {}),
        blocked: Boolean(task.blocked),
        ...(task.blocked ? { blockerReason: task.blockerReason || '' } : {}),
        archived: Boolean(task.archived),
        checklist: task.checklist || [],
        ...(epic ? {} : { pullRequests: task.pullRequests || [] }),
        attachments: task.attachments || [],
        ...textFields,
        ...(task.severity && workitemFieldApplies('severity', type) ? { severity: task.severity } : {}),
        ...(task.acceptance && workitemFieldApplies('acceptance', type) ? { acceptance: task.acceptance } : {}),
        ...(task.sprintHistory?.length && workitemFieldApplies('sprintHistory', type) ? { sprintHistory: task.sprintHistory } : {}),
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        ...(task.statusChangedAt ? { statusChangedAt: task.statusChangedAt } : {})
    };
}

export function workitemFromFile(value: Rec, index: MemberIndex): Task {
    assertWorkitemFile(value);
    const textFields = Object.fromEntries(WORKITEM_FIELDS.filter((field) => value[field]).map((field) => [field, value[field]]));
    return {
        type: value.type,
        parentId: value.parentId ?? null,
        phaseMode: value.phaseMode,
        milestoneMode: value.milestoneMode,
        ...textFields,
        ...(value.severity ? { severity: value.severity } : {}),
        ...(value.acceptance ? { acceptance: value.acceptance } : {}),
        ...(value.sprintHistory ? { sprintHistory: value.sprintHistory } : {}),
        pullRequests: value.pullRequests || [],
        ...(value.displayId ? { displayId: value.displayId } : {}),
        ...(value.permanentId ? { permanentId: value.permanentId } : {}),
        id: value.id,
        title: value.title,
        description: value.description,
        assignees: value.assigneeIds.map((id) => memberName(index, id)).filter(Boolean),
        responsible: memberName(index, value.responsibleId),
        assigneeIds: [...value.assigneeIds],
        responsibleId: value.responsibleId ?? '',
        tags: value.tags,
        blocked: value.blocked,
        blockerReason: value.blockerReason || '',
        checklist: value.checklist,
        attachments: value.attachments,
        archived: value.archived,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        ...(value.statusChangedAt ? { statusChangedAt: value.statusChangedAt } : {}),
        dueDate: value.dueDate ?? '',
        priority: value.priority,
        effort: value.effort ?? null,
        ...(value.storyPoints !== undefined ? { storyPoints: value.storyPoints } : {}),
        phaseId: value.phaseId ?? '',
        milestoneId: value.milestoneId ?? '',
        sprintId: value.sprintId ?? '',
        status: value.status
    };
}

/** v1 stores planning only where explicit; runtime rows keep the effective value. */
export function resolveInheritedPlanning(tasks: Task[]): Task[] {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const effective = (task: Task, field: 'phaseId' | 'milestoneId'): string => {
        const seen = new Set<number>();
        let current: Task | undefined = task;
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

export function controlToFile(record: ControlRecord, index: MemberIndex): ControlRecordFile {
    const values = record as unknown as Rec;
    const type = CONTROL_TYPE_TO_FILE[record.kind];
    const typeFields = Object.fromEntries(CONTROL_TYPE_FIELDS[type].map((field) => (
        [field, CONTROL_DATE_FIELDS.has(field) ? emptyToNull(values[field]) : values[field]]
    )));
    return {
        id: record.id,
        type,
        title: record.title,
        description: record.description,
        status: record.status,
        ownerId: record.owner?.trim() ? memberId(index, record.owner) : null,
        assigneeIds: (record.assignees || []).map((name) => memberId(index, name)),
        tags: record.tags || [],
        related: record.related,
        dueDate: emptyToNull(record.dueDate),
        ...typeFields,
        ...(record.legacyWorkitemIds ? { legacyWorkitemIds: record.legacyWorkitemIds } : {}),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
    };
}

// The runtime record carries the fields of every type; those of the other types stay at these values.
const CONTROL_RUNTIME_DEFAULTS = {
    probability: 'medium', impact: 'medium', mitigationPlan: '', contingencyPlan: '', materializedDate: '', actualImpact: '',
    decisionMaker: '', decisionDate: '', rationale: '',
    validator: '', deliveredDate: '', acceptedDate: ''
} as const;

export function controlFromFile(value: Rec, index: MemberIndex, comments: ControlComment[] = []): ControlRecord {
    assertControlRecordFile(value);
    const typeFields = Object.fromEntries(CONTROL_TYPE_FIELDS[value.type].map((field) => [field, (value as Rec)[field] ?? '']));
    return {
        id: value.id,
        kind: CONTROL_KIND_FROM_FILE[value.type],
        title: value.title,
        description: value.description,
        status: value.status,
        owner: memberName(index, value.ownerId),
        assignees: value.assigneeIds.map((id) => memberName(index, id)).filter(Boolean),
        tags: value.tags,
        ...CONTROL_RUNTIME_DEFAULTS,
        ...typeFields,
        dueDate: value.dueDate ?? '',
        related: value.related,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        comments,
        history: [],
        ...(value.legacyWorkitemIds ? { legacyWorkitemIds: value.legacyWorkitemIds } : {})
    };
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
            external[side.permanentId] = {
                projectId: side.projectId,
                projectTitle: side.projectTitle,
                workitemId: side.taskId,
                ...(side.displayId ? { displayId: side.displayId } : {}),
                title: side.title
            };
        }
    }
    return { edges: [...edges.values()], external };
}

export function relationsFromFile(
    relations: ProjectFileV1['relations'] | undefined,
    tasks: readonly Task[],
    project: { id: string; title: string }
): Pick<BoardExtensions, 'taskRelations' | 'permanentRelations'> {
    const byPermanent = new Map(tasks.map((task) => [task.permanentId || `local:${task.id}`, task]));
    const reference = (id: string): WorkitemReference | null => {
        const task = byPermanent.get(id);
        if (task) {
            return {
                permanentId: id, projectId: project.id, projectTitle: project.title, fileName: '', taskId: task.id, title: task.title,
                ...(task.displayId ? { displayId: task.displayId } : {})
            };
        }
        const external = relations?.external[id];
        if (!external) return null;
        return {
            permanentId: id,
            projectId: external.projectId as string,
            projectTitle: external.projectTitle as string,
            fileName: '',
            taskId: external.workitemId as number,
            title: external.title as string,
            ...(external.displayId ? { displayId: external.displayId as string } : {})
        };
    };
    const taskRelations: TaskRelation[] = [];
    const permanentRelations: PermanentRelation[] = [];
    for (const edge of relations?.edges || []) {
        const sourceId = edge.source as string, targetId = edge.target as string, kind = edge.kind as TaskRelation['kind'];
        const sourceTask = byPermanent.get(sourceId), targetTask = byPermanent.get(targetId);
        if (sourceTask && targetTask) {
            taskRelations.push({ sourceId: sourceTask.id, targetId: targetTask.id, kind });
            continue;
        }
        const source = reference(sourceId), target = reference(targetId);
        if (!source || !target) throw new Error('Invalid project.json: relation endpoint is not resolvable.');
        permanentRelations.push({ source, target, kind });
    }
    return {
        ...(taskRelations.length ? { taskRelations: { version: 1 as const, relations: taskRelations } } : {}),
        ...(permanentRelations.length ? { permanentRelations: { version: 1 as const, relations: permanentRelations } } : {})
    };
}

const withoutVersion = <T extends object>(value: T): Omit<T, 'version'> => {
    const { version: _version, ...rest } = value as T & { version?: unknown };
    void _version;
    return rest;
};

// Frozen rows (closed Sprints, Sprint participation) are workitems as they were at that
// moment. They use the v1 workitem shape, with member ids resolved by their own `members`
// list, so the names of that moment survive renames and removed members.

type FrozenTask = Omit<Task, 'assigneeIds' | 'responsibleId'> & Partial<Pick<Task, 'assigneeIds' | 'responsibleId'>>;

/** A frozen row has no parent to inherit from later: store its effective planning explicitly. */
const frozenPlanning = (task: FrozenTask): FrozenTask => ({
    ...task,
    ...(task.phaseMode === 'inherit' ? { phaseMode: task.phaseId ? 'explicit' : 'none' } : {}),
    ...(task.milestoneMode === 'inherit' ? { milestoneMode: task.milestoneId ? 'explicit' : 'none' } : {})
});

function frozenRowsToFile(tasks: readonly FrozenTask[], projectMembers: readonly ProjectMember[]): { workitems: WorkitemFile[]; members: FrozenMembersFile } {
    const index = memberIndex(projectMembers);
    const types = new Map(tasks.map((task) => [task.id, workitemType(task)]));
    const used = new Map<string, string>();
    const workitems = tasks.map((task) => {
        const row = workitemToFile(frozenPlanning(task) as Task, index, task.parentId == null ? undefined : types.get(task.parentId));
        const names = (task.assignees || []).filter((name) => name?.trim());
        row.assigneeIds.forEach((id, position) => used.set(id, names[position].trim()));
        if (row.responsibleId) used.set(row.responsibleId, task.responsible.trim());
        return row;
    });
    return { workitems, members: [...used].map(([id, name]) => ({ id, name })) };
}

function frozenRowsFromFile(rows: readonly Rec[], members: FrozenMembersFile): FrozenTask[] {
    const index = memberIndex(members);
    return rows.map((row) => {
        const { assigneeIds: _assigneeIds, responsibleId: _responsibleId, ...task } = workitemFromFile(row, index);
        void _assigneeIds; void _responsibleId;
        return task;
    });
}

function closureToFile(closure: SprintClosure, projectMembers: readonly ProjectMember[]): SprintClosureFile {
    const { workflow, functionalWorkflow, workflowTypes, tasks, ...rest } = closure;
    const { workitems, members } = frozenRowsToFile(tasks, projectMembers);
    return {
        ...rest,
        workitems,
        members,
        workflow: withoutVersion(workflow),
        functionalWorkflow: withoutVersion(functionalWorkflow),
        ...(workflowTypes ? { workflowTypes: withoutVersion(workflowTypes) } : {})
    };
}

export function closureFromFile(value: Rec | SprintClosureFile): SprintClosure {
    const { workitems, members, ...stored } = value as SprintClosureFile;
    return {
        ...stored,
        tasks: frozenRowsFromFile(workitems, members) as Task[],
        workflow: { version: 2, ...stored.workflow },
        functionalWorkflow: { version: 2, ...stored.functionalWorkflow },
        ...(stored.workflowTypes ? { workflowTypes: { version: 1, ...stored.workflowTypes } } : {})
    } as SprintClosure;
}

type ParticipationEntry = SprintParticipationEntries[number];
function participationToFile(entry: ParticipationEntry, projectMembers: readonly ProjectMember[]): SprintParticipationFile {
    const { workitems: [workitem], members } = frozenRowsToFile([entry.task], projectMembers);
    return { sprintId: entry.sprintId, at: entry.at, workitem, members };
}
export function participationFromFile(value: Rec | SprintParticipationFile): ParticipationEntry {
    const stored = value as SprintParticipationFile;
    return { sprintId: stored.sprintId, task: frozenRowsFromFile([stored.workitem], stored.members)[0] as Task, at: stored.at };
}

export const creditToFile = ({ taskKey, taskId, ...credit }: SprintCredit): SprintCreditFile => ({ workitemKey: taskKey, workitemId: taskId, ...credit });
export function creditFromFile(value: Rec | SprintCreditFile): SprintCredit {
    const { workitemKey, workitemId, ...credit } = value as SprintCreditFile;
    return { taskKey: workitemKey, taskId: workitemId, ...credit };
}

function roadmapToFile(extensions: BoardExtensions, projectMembers: readonly ProjectMember[]): ProjectFileRoadmap {
    const roadmap = extensions.roadmap;
    const results = extensions.sprintResults;
    const closed = new Set(results?.closures.map((closure) => closure.sprintId));
    const openParticipation = (extensions.sprintParticipation?.entries || [])
        .filter((entry) => !closed.has(entry.sprintId))
        .map((entry) => participationToFile(entry, projectMembers));
    return {
        milestones: roadmap?.milestones || [],
        phases: roadmap?.phases || [],
        sprints: roadmap?.sprints || [],
        sprintResults: {
            credits: (results?.credits || []).map(creditToFile),
            closures: (results?.closures || []).map((closure) => closureToFile(closure, projectMembers))
        },
        sprintParticipation: openParticipation
    };
}

export function roadmapBlocksFromFile(roadmap: Partial<ProjectFileRoadmap>): Pick<BoardExtensions, 'roadmap' | 'sprintResults' | 'sprintParticipation'> {
    const lists = { milestones: roadmap.milestones || [], phases: roadmap.phases || [], sprints: roadmap.sprints || [] };
    const credits = (roadmap.sprintResults?.credits || []).map(creditFromFile);
    const closures = (roadmap.sprintResults?.closures || []).map(closureFromFile);
    const participation = (roadmap.sprintParticipation || []).map(participationFromFile);
    const hasRoadmap = lists.milestones.length || lists.phases.length || lists.sprints.length;
    return {
        ...(hasRoadmap ? { roadmap: { version: ROADMAP_VERSION, ...lists } } : {}),
        ...(credits.length || closures.length ? { sprintResults: { version: 1 as const, credits, closures } } : {}),
        ...(participation.length ? { sprintParticipation: { version: 1 as const, entries: participation } } : {})
    };
}

type WorkflowBlocks = Pick<BoardExtensions, 'workflow' | 'functionalWorkflow' | 'workflowTypes' | 'hierarchyAutomations' | 'workitemAutomation'>;
export function workflowBlockFromFile(block: Rec | ProjectFileWorkflow): WorkflowBlocks {
    const stored = block as ProjectFileWorkflow;
    const automation = stored.automation || {};
    return {
        workflow: { version: 2, ...stored.technical } as Workflow,
        functionalWorkflow: { version: 2, ...stored.functional } as Workflow,
        ...(stored.types ? { workflowTypes: { version: 1, ...stored.types } as WorkflowTypes } : {}),
        ...(automation.hierarchy ? { hierarchyAutomations: { version: 1, ...automation.hierarchy } as HierarchyAutomations } : {}),
        ...(automation.transitions ? { workitemAutomation: { version: 1, ...automation.transitions } as BoardExtensions['workitemAutomation'] } : {})
    };
}

/** Identity first, then description and roster. Mapping workitems and records may have added legacy members. */
function projectBlockToFile(project: ProjectData, members: ProjectMember[], title: string): ProjectFileProject {
    const { id, acronym, version: _version, members: _members, ...rest } = project;
    void _version; void _members;
    return { id, title, ...(acronym !== undefined ? { acronym } : {}), ...rest, members } as ProjectFileProject;
}

export function projectBlockFromFile(block: Rec | ProjectFileProject): { project: ProjectData; title: string } {
    const { title, derived: _derived, ...project } = block as ProjectFileProject;
    void _derived;
    return { project: { version: 1, ...project }, title };
}

const boardViewToFile = (view: NonNullable<BoardExtensions['boardView']>): ProjectFileViews => ({
    board: {
        hiddenStateIds: {
            technical: view.hiddenStateIds,
            ...(view.functionalHiddenStateIds ? { functional: view.functionalHiddenStateIds } : {})
        }
    }
});
const boardViewFromFile = (hidden: HiddenStateIds | undefined) => ({
    version: 1 as const,
    hiddenStateIds: hidden?.technical || [],
    ...(hidden?.functional ? { functionalHiddenStateIds: hidden.functional } : {})
});

export const KNOWN_PROJECT_EXTENSIONS = new Set([
    'controlComments', 'controlRecordHistory', 'project', 'workflow', 'functionalWorkflow', 'workflowTypes', 'hierarchyAutomations',
    'workitemAutomation', 'roadmap', 'sprintResults', 'sprintParticipation', 'dayPlanner', 'projectControl', 'conversations',
    'taskRelations', 'permanentRelations', 'boardView', 'taskIdentity', 'sprintCatalog', 'projectTransfers', 'projectStorage',
    'timeline', 'conversationRefs'
]);

const blockToFile = ({ taskId, ...block }: DayPlanBlock): DayPlanBlockFile => ({ ...block, workitemId: taskId });
function blockFromFile(value: Rec | DayPlanBlockFile): DayPlanBlock {
    const { workitemId, ...block } = value as DayPlanBlockFile;
    return { ...block, taskId: workitemId } as DayPlanBlock;
}
export const dayPlannerToFile = (blocks: readonly DayPlanBlock[]) => ({ blocks: blocks.map(blockToFile) });
export const dayPlannerFromFile = (blocks: readonly Rec[]) => blocks.map(blockFromFile);

const referenceToFile = ({ taskId, fileName, ...reference }: WorkitemReference): WorkitemReferenceFile => ({
    ...reference, workitemId: taskId, ...(fileName ? { fileName } : {})
});
const referenceFromFile = ({ workitemId, fileName, ...reference }: WorkitemReferenceFile): WorkitemReference => ({
    ...reference, fileName: fileName || '', taskId: workitemId
});
const transferToFile = ({ from, to, sourceTask, ...operation }: TransferOperation): TransferFile => ({
    ...operation, from: referenceToFile(from), to: referenceToFile(to), sourceWorkitem: sourceTask
});
const transferFromFile = ({ from, to, sourceWorkitem, ...operation }: TransferFile): TransferOperation => ({
    ...operation, from: referenceFromFile(from), to: referenceFromFile(to), sourceTask: sourceWorkitem
});

const controlCommentKey = (recordId: string, commentId: string) => `${recordId}:${commentId}`;

/** Workitem comments, then every Project Control comment once: those no longer on a record are marked `current: false`. */
function commentsToFile(extensions: BoardExtensions): CommentFile[] {
    const records = extensions.projectControl?.records || [];
    const control = new Map((extensions.controlComments || []).map((entry) => [controlCommentKey(entry.recordId, entry.comment.id), entry]));
    const active = new Set<string>();
    for (const record of records) {
        for (const comment of record.comments) {
            const key = controlCommentKey(record.id, comment.id);
            active.add(key);
            control.set(key, { recordId: record.id, comment });
        }
    }
    const workitemComments = (extensions.conversations?.entries || []).map(({ taskId, workitemKey, workitemCreatedAt, ...comment }: WorkitemComment) => (
        { ...comment, subject: { kind: 'workitem' as const, workitemId: taskId, workitemKey, workitemCreatedAt } }
    ));
    const controlComments = [...control.values()].map(({ recordId, comment }) => (
        { ...comment, subject: { kind: 'control' as const, recordId, ...(active.has(controlCommentKey(recordId, comment.id)) ? {} : { current: false as const }) } }
    ));
    return [...workitemComments, ...controlComments];
}

/** Runtime → project.json. Record and transfer histories belong to history.json and are never written here. */
export function toProjectFile(data: BoardData): ProjectFileV1 {
    const extensions = data.extensions;
    const project = extensions.project || getProjectData(data);
    const index = memberIndexFor(project);
    const technical = getWorkflow(data);
    const typeOf = new Map(data.board.tasks.map((task) => [task.id, workitemType(task)]));
    const workitems = data.board.tasks.map((task) => workitemToFile(task, index, task.parentId == null ? undefined : typeOf.get(task.parentId)));
    const records = (extensions.projectControl?.records || []).map((record) => controlToFile(record, index));
    const unknown = Object.fromEntries(Object.entries(extensions).filter(([key]) => !KNOWN_PROJECT_EXTENSIONS.has(key)));
    const storage = extensions.projectStorage;
    const taskIdentity = isRecord(extensions.taskIdentity) ? extensions.taskIdentity : undefined;
    return {
        meta: {
            schemaVersion: PROJECT_FILE_SCHEMA_VERSION,
            appId: BOARD_APP_ID,
            revision: data.meta.revision ?? 0,
            createdAt: data.meta.createdAt,
            updatedAt: data.meta.updatedAt
        },
        project: projectBlockToFile(project, index.members, data.board.settings.title),
        workflow: {
            technical: withoutVersion(technical),
            functional: withoutVersion((extensions.functionalWorkflow as Workflow | undefined) || technical),
            ...(extensions.workflowTypes ? { types: withoutVersion(extensions.workflowTypes) } : {}),
            automation: {
                ...(extensions.hierarchyAutomations ? { hierarchy: withoutVersion(extensions.hierarchyAutomations) } : {}),
                ...(extensions.workitemAutomation ? { transitions: withoutVersion(extensions.workitemAutomation) } : {})
            }
        },
        workitems,
        relations: relationsToFile(data, data.board.tasks),
        roadmap: roadmapToFile(extensions, project.members),
        dayPlanner: dayPlannerToFile(extensions.dayPlanner?.blocks || []),
        projectControl: { records },
        comments: commentsToFile(extensions),
        ...(extensions.boardView ? { views: boardViewToFile(extensions.boardView) } : {}),
        system: {
            sequences: {
                workitems: { lastId: taskIdentity?.highWaterMark ?? 0 },
                sprints: { lastNumber: extensions.sprintCatalog?.lastNumber ?? 0 },
                controlRecords: { lastNumber: extensions.projectControl?.lastNumber ?? 0 }
            },
            sprintNumbers: extensions.sprintCatalog?.entries || [],
            ...(storage ? { storage: withoutVersion(storage) } : {}),
            transfers: (extensions.projectTransfers?.operations || []).map(transferToFile)
        },
        ...(Object.keys(unknown).length ? { extensions: unknown } : {})
    };
}

export function toProjectCheckpoint(data: BoardData): ProjectCheckpoint {
    const { comments: _comments, system: _system, ...checkpoint } = toProjectFile(data);
    void _comments; void _system;
    return checkpoint;
}

const recordNumber = (id: string) => Number(id.match(/(\d+)$/)?.[1] || 0);

type CommentsFromFile = {
    workitem: WorkitemComment[];
    /** Every Project Control comment, including those of records removed by a restore. */
    canonical: NonNullable<BoardExtensions['controlComments']>;
    /** The comments each record currently shows. */
    byRecord: Map<string, ControlComment[]>;
};
function commentsFromFile(comments: readonly CommentFile[]): CommentsFromFile {
    const result: CommentsFromFile = { workitem: [], canonical: [], byRecord: new Map() };
    const seen = new Set<string>();
    for (const { subject, ...comment } of comments) {
        if (subject.kind !== 'control') {
            const { workitemId, workitemKey, workitemCreatedAt } = subject;
            result.workitem.push({ ...comment, taskId: workitemId, workitemKey, workitemCreatedAt } as unknown as WorkitemComment);
            continue;
        }
        assertControlComment(comment);
        const { recordId, current } = subject as { recordId: unknown; current?: unknown };
        if (typeof recordId !== 'string' || !recordId || (current !== undefined && typeof current !== 'boolean')) {
            throw new Error('Invalid Project Control comment subject.');
        }
        const key = controlCommentKey(recordId, comment.id);
        if (seen.has(key)) throw new Error('Duplicate Project Control comment.');
        seen.add(key);
        result.canonical.push({ recordId, comment });
        const shown = result.byRecord.get(recordId) || [];
        if (current !== false) shown.push(comment);
        result.byRecord.set(recordId, shown);
    }
    return result;
}

function assertPlanningUnits(workitems: readonly WorkitemFile[]): void {
    const types = new Map(workitems.map((item) => [item.id, String(item.type)]));
    for (const item of workitems) {
        const parentType = item.parentId == null ? undefined : types.get(item.parentId);
        if ('storyPoints' in item && !carriesStoryPoints(String(item.type), parentType)) {
            throw new Error(`Invalid project.json: workitem ${String(item.id)} is not a planning unit and cannot have storyPoints.`);
        }
    }
}

/** `system` back to the runtime blocks. A checkpoint has none: the current project supplies them. */
function systemFromFile(system: ProjectFileSystem | undefined): Partial<BoardExtensions> {
    if (!system) return {};
    const sequences: Partial<ProjectFileSystem['sequences']> = system.sequences || {};
    const transfers = system.transfers || [];
    return {
        taskIdentity: { version: 1, highWaterMark: sequences.workitems?.lastId ?? 0 },
        sprintCatalog: { version: 1, lastNumber: sequences.sprints?.lastNumber ?? 0, entries: system.sprintNumbers || [] },
        ...(transfers.length ? { projectTransfers: { version: 1 as const, operations: transfers.map(transferFromFile) } } : {}),
        ...(system.storage ? { projectStorage: { version: 1 as const, ...system.storage } } : {})
    };
}

/** project.json (or a checkpoint) → runtime. */
export function fromProjectFile(file: ProjectFileV1 | ProjectCheckpoint): BoardData {
    if (isRecord(file.meta) && file.meta.schemaVersion !== PROJECT_FILE_SCHEMA_VERSION) throw new Error('Invalid project.json: unsupported schemaVersion.');
    const { project, title } = projectBlockFromFile(file.project);
    const index = memberIndexFor(project);
    assertPlanningUnits(file.workitems);
    const tasks = resolveInheritedPlanning(file.workitems.map((item) => workitemFromFile(item, index)));
    const workflow = workflowBlockFromFile(file.workflow);
    const comments = commentsFromFile(file.comments || []);
    const records = (file.projectControl?.records || []).map((record) => controlFromFile(record, index, comments.byRecord.get(record.id) || []));
    const system = isRecord(file.system) ? file.system : undefined;
    const lastNumber = system?.sequences?.controlRecords?.lastNumber
        ?? records.reduce((highest, record) => Math.max(highest, recordNumber(record.id)), 0);
    const planner = dayPlannerFromFile(file.dayPlanner?.blocks || []);
    const extensions: BoardExtensions = {
        ...(file.extensions || {}),
        ...(comments.canonical.length ? { controlComments: comments.canonical } : {}),
        project,
        ...workflow,
        ...roadmapBlocksFromFile(file.roadmap || {}),
        ...(planner.length ? { dayPlanner: { version: DAY_PLANNER_VERSION, blocks: planner } as BoardExtensions['dayPlanner'] } : {}),
        ...(records.length || lastNumber ? { projectControl: { version: 3 as const, lastNumber, records } } : {}),
        ...(comments.workitem.length ? { conversations: { version: 1 as const, entries: comments.workitem } } : {}),
        ...relationsFromFile(file.relations, tasks, { id: project.id, title }),
        ...(file.views?.board ? { boardView: boardViewFromFile(file.views.board.hiddenStateIds) } : {}),
        ...systemFromFile(system)
    };
    // A checkpoint taken before projects existed: replay keeps deriving members, as it always has.
    if (file.project.derived) delete extensions.project;
    const columns = (workflow.workflow as Workflow).states.map((state) => ({ status: state.id, title: state.name }));
    return {
        meta: {
            schemaVersion: BOARD_SCHEMA_VERSION,
            appId: BOARD_APP_ID,
            revision: file.meta.revision ?? 0,
            createdAt: file.meta.createdAt,
            updatedAt: file.meta.updatedAt
        },
        board: { columns, tasks, settings: { title } },
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
