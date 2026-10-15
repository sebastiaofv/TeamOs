import type { BoardColumn, Effort } from './types';
import type { ArchiveFilter } from '@/features/portfolio/types';

export const BOARD_SCHEMA_VERSION = 1;
export const BOARD_APP_ID = 'teamos-kanban';
export const BOARD_FILE_EXTENSION = '.json';
export const DEFAULT_BOARD_TITLE = 'Example Task Board';
export const TASK_TITLE_MAX_LENGTH = 80;
export const EFFORT_BUCKETS: readonly Effort[] = ['XS', 'S', 'M', 'L', 'XL'];
export const MAX_COLUMNS = 20;
export const BOARD_ARCHIVE_FILTER_VALUES: readonly ArchiveFilter[] = ['active', 'all', 'archived'];
export const TEAMOS_EXTENSIONS_KEY = 'teamOsKanban';
export const TASK_ATTACHMENTS_EXTENSIONS_KEY = 'taskAttachments';
export const ROADMAP_EXTENSION_KEY = 'roadmap';
export const ROADMAP_VERSION = 1;
export const TIMELINE_EXTENSION_KEY = 'timeline';
export const TIMELINE_VERSION = 1;
export const DAY_PLANNER_EXTENSION_KEY = 'dayPlanner';
export const DAY_PLANNER_VERSION = 1;
export const ATTACHMENT_MAX_COUNT = 10;
export const ATTACHMENT_HARD_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_SOFT_WARN_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_TASK_SOFT_TOTAL_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES = 25 * 1024 * 1024;
export const PROJECT_FILE_WATCH_INTERVAL_MS = 4000;
export const PROJECT_FILE_CONFLICT_SUPPRESS_MS = 15000;
export const PROJECT_FILE_EXTERNAL_BADGE_MS = 5000;
export const THEME_STORAGE_KEY = 'teamOsKanbanTheme';
export const LANGUAGE_STORAGE_KEY = 'teamOsKanbanLanguage';
export const DEBUG_LOGS_ENABLED = false;
export const CALENDAR_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const CALENDAR_WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const defaultColumns: readonly BoardColumn[] = [
    { status: 'backlog', title: 'backlog' },
    { status: 'to-do', title: 'to-do' },
    { status: 'doing', title: 'in progress' },
    { status: 'done', title: 'done' }
];

export function isEffort(value: unknown): value is Effort {
    return (EFFORT_BUCKETS as readonly unknown[]).includes(value);
}

export function isArchiveFilter(value: unknown): value is ArchiveFilter {
    return (BOARD_ARCHIVE_FILTER_VALUES as readonly unknown[]).includes(value);
}
