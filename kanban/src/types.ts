// Shared types: the board file format, the normalized domain model, and the
// view models the actions hand to components.

export type TaskStatus = 'backlog' | 'to-do' | 'doing' | 'done';
export type Priority = 'high' | 'medium' | 'low';
export type Effort = 'XS' | 'S' | 'M' | 'L' | 'XL';
export type Theme = 'light' | 'dark';

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

export type Task = {
    id: number;
    title: string;
    description: string;
    assignees: string[];
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
export type RoadmapItem = { id: string; title: string } & Partial<Record<RoadmapDateKey, string>>;
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

export type TeamOsExtensions = { [key: string]: unknown; taskAttachments?: Record<string, unknown> };
export type BoardExtensions = {
    [key: string]: unknown;
    roadmap?: RoadmapExtension;
    timeline?: TimelineExtension;
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

// The subset of the File System Access API the app uses. Real handles and the
// test doubles both satisfy it.
export type BoardFile = { name: string; size?: number; lastModified?: number; text(): Promise<string> };
export type BoardWritable = { write(data: string): Promise<void>; close(): Promise<void> };
export type BoardFileHandle = {
    name: string;
    getFile(): Promise<BoardFile>;
    createWritable(): Promise<BoardWritable>;
};

export type ProjectColor = { bg: string; border: string; text: string };

export type BoardRecord = {
    id: string;
    colorSeed: number | null;
    handle: BoardFileHandle | null;
    fileName: string;
    title: string;
    data: BoardData;
    projectColor?: ProjectColor;
};

export type CardRef = { boardId: string; taskId: number };

export type PortfolioRow = {
    boardIndex: number;
    boardId: string;
    taskId: number;
    taskIndex: number;
    boardTitle: string;
    boardFileName: string;
    columnTitle?: string;
    canMutate: boolean;
    historical?: boolean;
    boardData?: BoardData | null;
    task: Task;
};

export type ArchiveFilter = 'active' | 'all' | 'archived';
export type BlockedFilter = 'all' | 'blocked' | 'unblocked';
export type PortfolioFilters = {
    search: string;
    archive: ArchiveFilter;
    blocked: BlockedFilter;
    assignee: string;
    priority: '' | Priority;
    effort: '' | Effort;
};
export type PortfolioSortKey = 'board' | 'task' | 'column' | 'priority' | 'effort' | 'score' | 'dueDate' | 'updatedAt';
export type SortDir = 'asc' | 'desc';
export type PortfolioViewMode = 'board' | 'roadmap' | 'calendar';
export type CalendarView = 'year' | 'month';
export type CalendarDisplayMode = 'calendar' | 'heatmap';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'error';
export type WatchStatus = 'idle' | 'external' | 'conflict' | 'watch-error';
export type ProjectSaveState = {
    status: SaveStatus;
    lastErrorMessage: string;
    lastSavedAt: string;
    revision: number;
    savedRevision: number;
    watchStatus: WatchStatus;
    watchMessage: string;
    watchStatusUntil: number;
};

export type DateBounds = { start: Date; end: Date };
export type RoadmapRange = DateBounds & { totalDays: number };
export type RoadmapTick = { label: string; position: number };
export type HeatStats = { min: number; max: number };

export type PortfolioCalendarItem = {
    id: string;
    kind: string;
    boardId: string;
    boardTitle: string;
    title: string;
    subtitle: string;
    taskId: number | null;
    roadmapKind: string;
    projectColor: ProjectColor;
    historical: boolean;
    isRange: boolean;
    bounds: DateBounds;
};

// The editable fields of the task editor form.
export type TaskEditorFields = {
    title: string;
    description: string;
    blocked: boolean;
    blockerReason: string;
    assignees: string[];
    tags: string[];
    checklist: ChecklistItem[];
    attachments: Attachment[];
    dueDate: string;
    priority: string;
    effort: string;
    phaseId: string;
    milestoneId: string;
};

// The normalized form the editor hands to the save action.
export type TaskDraft = {
    title: string;
    description: string;
    assignees: string[];
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

export type SelectOption = { value: string; label: string };

export type TaskEditorViewModel = {
    openId: number;
    heading: string;
    initial: TaskEditorFields;
    phaseOptions: SelectOption[];
    milestoneOptions: SelectOption[];
    assigneePool: string[];
    tagSuggestions: string[];
    otherAttachmentBytes: number;
};

export type TaskDetailFields = Record<
    | 'title' | 'description' | 'assignees' | 'tags' | 'blocked' | 'blockerReason' | 'priority' | 'effort'
    | 'status' | 'createdAt' | 'updatedAt' | 'dueDate' | 'phase' | 'milestone' | 'sprint',
    string
>;
export type TaskDetailAttachment = { id: string; name: string; isImage: boolean; dataUrl: string; subLabel: string };
export type TaskDetailViewModel = {
    readOnly: boolean;
    fields: TaskDetailFields;
    checklist: ChecklistItem[];
    attachments: TaskDetailAttachment[];
};

export type RoadmapEntityMode = 'default' | 'create-sprint-from-selection' | 'assign-sprint-from-selection';
export type RoadmapEntityDates = { title: string; dueDate: string; startDate: string; endDate: string };
export type RoadmapEntityViewModel = {
    kind: RoadmapKind;
    itemId: string;
    mode: RoadmapEntityMode;
    heading: string;
    saveLabel: string;
    dateMode: 'single' | 'range';
    dateLabel: string;
    showExistingSprint: boolean;
    initial: RoadmapEntityDates;
    sprintOptions: SelectOption[];
    initialFocus: 'existingSprint' | 'title';
};

export type DialogPropsByName = {
    taskEditor: TaskEditorViewModel;
    taskDetail: TaskDetailViewModel;
    roadmapEntity: RoadmapEntityViewModel;
    shortcuts: null;
    help: null;
};
export type DialogName = keyof DialogPropsByName;

export type AppMessageButton = {
    label: string;
    value?: unknown;
    primary?: boolean;
    danger?: boolean;
    cancel?: boolean;
    submitsInput?: boolean;
};
export type AppMessage = {
    id: number;
    title: string;
    text: string;
    input?: { defaultValue: string };
    buttons: AppMessageButton[];
    cancelValue: unknown;
};

export type PortfolioTimelineViewModel = {
    boardId: string;
    boardTitle: string;
    boardFileName: string;
    hasHandle: boolean;
    timeline: TimelineExtension | null;
    selectedIndex: number | null;
    selectedEvent: TimelineEvent | null;
    isPreview: boolean;
    isExpanded: boolean;
};

export type PortfolioRoadmapViewModel = {
    boardId: string;
    boardTitle: string;
    boardFileName: string;
    boardData: BoardData | null;
    roadmap: RoadmapExtension;
    range: RoadmapRange;
    axisTicks: RoadmapTick[];
    historical: boolean;
};

export type PortfolioCalendarViewModel = {
    items: PortfolioCalendarItem[];
    aggregate: boolean;
    year: number;
    month: number;
    view: CalendarView;
    displayMode: CalendarDisplayMode;
};
