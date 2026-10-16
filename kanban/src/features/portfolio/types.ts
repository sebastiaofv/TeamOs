// Portfolio session, view-model, editor, and dialog types.

import type {
    BoardData,
    ChecklistItem,
    DateBounds,
    Effort,
    Priority,
    ProjectColor,
    RoadmapExtension,
    RoadmapKind,
    RoadmapRange,
    RoadmapTick,
    Task,
    TaskEditorFields,
    TimelineEvent,
    TimelineExtension
} from '@/domain/types';
import type { BoardFileHandle } from '@/infrastructure/browser/types';

export type { DraftMessage, TaskDraft, TaskEditorFields } from '@/domain/types';

export type BoardRecord = {
    id: string;
    colorSeed: number | null;
    handle: BoardFileHandle | null;
    // Read-only drag/drop imports do not expose a file-system handle. This
    // metadata identity lets the session reject importing that same file
    // again without persisting it into the board JSON.
    sourceKey?: string;
    fileName: string;
    title: string;
    data: BoardData;
    projectColor?: ProjectColor;
};

export type CardRef = { boardId: string; taskId: number };

export type PortfolioRow = {
    dependencyBlocked?: boolean;
    assignmentNeedsReview?: boolean;
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
export type PortfolioViewMode = 'board' | 'table' | 'roadmap' | 'calendar' | 'planner' | 'dashboard' | 'portfolio' | 'maintenance';
export type PlannerMode = 'day' | 'week';
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

export type SelectOption = { value: string; label: string };

export type TaskEditorViewModel = {
    openId: number;
    heading: string;
    initial: TaskEditorFields;
    phaseOptions: SelectOption[];
    milestoneOptions: SelectOption[];
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
    boardData?: BoardData;
    missing?: boolean;
    task?: Task;
    readOnly: boolean;
    fields: TaskDetailFields;
    checklist: ChecklistItem[];
    attachments: TaskDetailAttachment[];
};

export type RoadmapEntityMode = 'default' | 'create-sprint-from-selection' | 'assign-sprint-from-selection';
export type RoadmapEntityDates = { title: string; dueDate: string; startDate: string; endDate: string; parentPhaseId?: string };
export type RoadmapEntityViewModel = {
    parentPhaseOptions?: SelectOption[];
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

// The task the command palette opened for (open, hovered or selected card),
// and text to start with (e.g. an example from Help).
export type CommandPaletteProps = { contextTask: { boardId: string; taskId: number } | null; initialQuery?: string };
export type HelpTab = 'guide' | 'palette';
export type HelpDialogProps = { tab?: HelpTab };

export type DialogPropsByName = {
    commandPalette: CommandPaletteProps;
    taskEditor: TaskEditorViewModel;
    taskDetail: TaskDetailViewModel;
    roadmapEntity: RoadmapEntityViewModel;
    shortcuts: null;
    help: HelpDialogProps | null;
};
export type DialogName = keyof DialogPropsByName;

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
