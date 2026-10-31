// Stable domain values: board files, tasks, roadmap and timeline data.
import type { Conversations } from './comments';
import type { BoardViewPreferences } from './boardView';

export type TaskStatus = string;
export type WorkflowKind = 'technical' | 'functional';
export type WorkflowCategory = 'backlog' | 'to-do' | 'in-progress' | 'completed' | 'cancelled';
export type WorkflowState = { id: string; name: string; color: string; category: WorkflowCategory };
export type Workflow = {
    version: 2;
    states: WorkflowState[];
    entryStateId: string;
    references: Partial<Record<WorkflowCategory, string>>;
    transitions: Record<string, string[]>;
};
export type Priority = 'high' | 'medium' | 'low';
export type Effort = 'XS' | 'S' | 'M' | 'L' | 'XL';

export type ChecklistItem = { text: string; done: boolean };

export type AttachmentKind = 'image' | 'file';
export type Attachment = {
    id: string;
    name: string;
    mime: string;
    sizeBytes: number;
    kind: AttachmentKind;
    dataUrl: string;
    createdAt: string;
};

export type WorkitemType = 'epic' | 'story' | 'task' | 'bug';
export type PlanningMode = 'inherit' | 'none' | 'explicit';
export type WorkitemAutomation = { version: 1; start?: { from: string[]; to: string }; finish?: { from: string[]; to: string } };
export type WorkitemFields = {
    type?: WorkitemType;
    parentId?: number | null;
    objective?: string; scope?: string; businessValue?: string; acceptanceCriteria?: string;
    stepsToReproduce?: string; expectedResult?: string; actualResult?: string; severity?: string; environment?: string;
    phaseMode?: PlanningMode; milestoneMode?: PlanningMode;
};
export type Task = WorkitemFields & {
    acceptance?: { author: string; at: string; local: true };
    sprintHistory?: { sprintId: string; status: string; at: string; parentId?: number | null }[];
    id: number;
    displayId?: string;
    title: string;
    description: string;
    assignees: string[];
    responsible: string;
    // Stable references; assignees/responsible remain readable name projections.
    assigneeIds?: string[];
    responsibleId?: string;
    tags: string[];
    blocked: boolean;
    blockerReason: string;
    checklist: ChecklistItem[];
    attachments: Attachment[];
    archived: boolean;
    createdAt: string;
    updatedAt: string;
    statusChangedAt?: string;
    dueDate: string;
    priority: Priority | null;
    effort: Effort | null;
    phaseId: string;
    milestoneId: string;
    sprintId: string;
    status: TaskStatus;
    pullRequests?: string[];
};

// A task as it may appear in a file before normalization, including the legacy
// single `assignee` field.
export type TaskInput = { [K in keyof Task]?: unknown } & { assignee?: unknown };

export type BoardColumn = { status: TaskStatus; title: string };
export type BoardSettings = {
    title: string;
    sortMode?: string;
    showArchivedOnly?: boolean;
    archiveFilter?: string;
};
export type BoardMeta = {
    schemaVersion: number;
    appId: string;
    createdAt: string;
    updatedAt: string;
};

export type RoadmapKind = 'milestones' | 'phases' | 'sprints';
export type RoadmapDateKey = 'dueDate' | 'startDate' | 'endDate';
// Milestones carry a dueDate; phases and sprints a startDate and endDate.
export type RoadmapItem = { id: string; title: string; parentId?: string; color?: string; objective?: string } & Partial<Record<RoadmapDateKey, string>>;
export type RoadmapExtension = {
    version: number;
    milestones: RoadmapItem[];
    phases: RoadmapItem[];
    sprints: RoadmapItem[];
};

export type TimelineChange = { before: unknown; after: unknown };
export type TimelineChanges = Record<string, TimelineChange>;
export type TimelineEventMeta = {
    [key: string]: unknown;
    sprint?: RoadmapItem;
    taskIds?: unknown[];
    fromEventId?: string;
    fromTimestamp?: string;
};
// A board snapshot (board.* events) or a task snapshot (task.* events).
export type TimelineSnapshot = Partial<BoardData> & Partial<Task>;
export type TimelineEvent = {
    id: string;
    at: string;
    kind: string;
    entityType: 'board' | 'task';
    entityId: string;
    summary: string;
    changes?: TimelineChanges;
    snapshot?: TimelineSnapshot;
    meta?: TimelineEventMeta;
};
export type TimelineEventInput = Omit<TimelineEvent, 'id' | 'at'> & { id?: string; at?: string };
export type TimelineExtension = {
    version: number;
    baselineEventId: string;
    events: TimelineEvent[];
};

// A task scheduled on the day planner. Times are local "HH:MM" on the
// 15-minute grid; the block belongs to the project file that owns the task.
export type DayPlanBlock = {
    id: string;
    taskId: number;
    date: string;
    start: string;
    end: string;
};
export type DayPlannerExtension = {
    version: number;
    blocks: DayPlanBlock[];
};

export type TeamOsExtensions = { [key: string]: unknown; taskAttachments?: Record<string, unknown> };
export type TaskRelationKind = 'related' | 'blocks' | 'blockedBy';
// Dependencies are stored once, from blocker to dependent. Related pairs use ascending IDs.
export type TaskRelation = { sourceId: number; targetId: number; kind: 'related' | 'blocks' };
export type TaskRelationsExtension = { version: 1; relations: TaskRelation[] };

export type SprintIdentity = { sprintId: string; number: number; createdAt: string | null };
export type SprintCatalog = { version: 1; lastNumber: number; entries: SprintIdentity[] };
export type ProjectStatus = 'planned' | 'active' | 'paused' | 'completed' | 'archived';
export type ProjectMember = { id: string; name: string };
export type ProjectData = {
    acronym?: string;
    version: 1;
    id: string;
    description: string;
    status: ProjectStatus | null;
    members: ProjectMember[];
    tags: string[];
};
export type BoardExtensions = {
    projectControl?: import('./projectControl').ProjectControl;
    [key: string]: unknown;
    conversations?: Conversations;
    project?: ProjectData;
    sprintParticipation?: { version: 1; entries: { sprintId: string; task: Task; at: string }[] };
    workitemAutomation?: WorkitemAutomation;
    boardView?: BoardViewPreferences;
    workflow?: Workflow;
    functionalWorkflow?: Workflow;
    roadmap?: RoadmapExtension;
    timeline?: TimelineExtension;
    dayPlanner?: DayPlannerExtension;
    taskRelations?: TaskRelationsExtension;
    sprintCatalog?: SprintCatalog;
    teamOsKanban?: TeamOsExtensions;
};

export type BoardData = {
    meta: BoardMeta;
    board: {
        columns: BoardColumn[];
        tasks: Task[];
        settings: BoardSettings;
    };
    extensions: BoardExtensions;
};

// A board payload that has not been validated or normalized: parsed JSON,
// legacy files, replayed timeline state.
export type LooseBoardData = {
    meta?: Partial<Record<keyof BoardMeta, unknown>>;
    board?: { columns?: unknown; tasks?: unknown; settings?: unknown };
    extensions?: Record<string, unknown>;
};

export type ProjectColor = { bg: string; border: string; text: string };

// Drafts are domain inputs/outputs even though the feature editor is their
// current consumer. Keeping them here lets the pure draft rules avoid a
// dependency on the React feature layer.
export type TaskEditorFields = WorkitemFields & {
    pullRequests?: string[];
    title: string;
    description: string;
    blocked: boolean;
    blockerReason: string;
    assignees: string[];
    responsible: string;
    tags: string[];
    checklist: ChecklistItem[];
    attachments: Attachment[];
    dueDate: string;
    priority: string;
    effort: string;
    phaseId: string;
    milestoneId: string;
};

export type TaskDraft = WorkitemFields & {
    pullRequests?: string[];
    title: string;
    description: string;
    assignees: string[];
    responsible: string;
    tags: string[];
    blocked: boolean;
    blockerReason: string;
    checklist: ChecklistItem[];
    attachments: Attachment[];
    rawDueDate: string;
    dueDate: string;
    priority: Priority | null;
    effort: Effort | null;
    phaseId: string;
    milestoneId: string;
};

export type DraftMessage = { type: 'error' | 'warning'; text: string };

export type DateBounds = { start: Date; end: Date };
export type RoadmapRange = DateBounds & { totalDays: number };
export type RoadmapTick = { label: string; position: number };
export type HeatStats = { min: number; max: number };
