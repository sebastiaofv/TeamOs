import type {
    BoardColumn,
    BoardData,
    ProjectColor,
    TaskStatus
} from './types';
import type { PortfolioRow, PortfolioSortKey, PortfolioViewMode, SortDir } from '@/features/portfolio/types';
import { compareText, hasExactKeys, normalizeTimestamp, nowIso } from './util';
import { isAcceptedLegacyAssigneeValue, normalizeBlockerReason, normalizeTaskStatus, resolveKnownTaskStatus } from './task';
import { BOARD_APP_ID, BOARD_SCHEMA_VERSION, MAX_COLUMNS, ROADMAP_EXTENSION_KEY, TASK_TITLE_MAX_LENGTH, TIMELINE_EXTENSION_KEY, defaultColumns, isArchiveFilter, isEffort } from './constants';
import { comparePortfolioDueDateAsc } from './calendar';
import { normalizeRoadmapExtension, parseRoadmapIsoDate } from './roadmap';
import { effortRank, priorityRank, taskScore } from './scoring';
import { normalizeTimelineExtension } from './timelineSchema';
import { getProjectInfo, validateProjectInfo } from './project';
import { validateWorkitems } from './workitems';
import { getWorkflow, validateWorkflow } from './workflow';
import { getRelations } from './relations';
import { validatePhaseHierarchy } from './projectPlan';
import { getConversation } from './comments';
import { getPullRequests, normalizePullRequest } from './pullRequests';
import { getMaintenanceConfig, getApplications } from './applications';

const PORTFOLIO_SORT_KEYS: readonly PortfolioSortKey[] = ['board', 'task', 'column', 'priority', 'effort', 'score', 'dueDate', 'updatedAt'];

export function hasExtendedBoardSettings(settings: unknown): settings is Record<'title' | 'sortMode' | 'showArchivedOnly', unknown> {
    return hasExactKeys(settings, ['title', 'sortMode', 'showArchivedOnly'])
        || hasExactKeys(settings, ['title', 'sortMode', 'showArchivedOnly', 'archiveFilter']);
}

export function hasTitleOnlyBoardSettings(settings: unknown): settings is Record<'title', unknown> {
    return hasExactKeys(settings, ['title']);
}

export function nextPortfolioProjectId(): string {
    return `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeColumns(inputColumns: unknown): BoardColumn[] {
    if (!Array.isArray(inputColumns) || inputColumns.length === 0) {
        return defaultColumns.map(col => ({ ...col }));
    }

    const defaultsByStatus: Partial<Record<TaskStatus, BoardColumn>> = Object.fromEntries(defaultColumns.map(col => [col.status, col]));
    const seen = new Set<TaskStatus>();
    const normalized: BoardColumn[] = [];
    inputColumns.forEach((col) => {
        if (!col || typeof col !== 'object') return;
        const status = typeof col.status === 'string' && /^wf_[a-z0-9_-]+$/i.test(col.status) ? col.status : resolveKnownTaskStatus(col.status);
        if (!status) return;
        if (seen.has(status)) return;
        const rawTitle = typeof col.title === 'string' ? col.title.trim() : '';
        const fallbackTitle = defaultsByStatus[status]?.title || status;
        normalized.push({
            status,
            title: rawTitle || fallbackTitle
        });
        seen.add(status);
    });

    if (normalized.length === 0) {
        return defaultColumns.map(col => ({ ...col }));
    }

    // Currently unreachable with real input: resolveKnownTaskStatus() only
    // ever resolves to one of 4 canonical statuses (or null), so `normalized`
    // (deduped on that resolved value) can never exceed length 4 against a
    // cap (MAX_COLUMNS) of 5.
    return normalized.slice(0, MAX_COLUMNS);
}

export function normalizePortfolioSortDir(value: unknown): SortDir {
    return value === 'desc' ? 'desc' : 'asc';
}

export function normalizePortfolioSortKey(value: unknown): PortfolioSortKey {
    return (PORTFOLIO_SORT_KEYS as readonly unknown[]).includes(value)
        ? value as PortfolioSortKey
        : 'priority';
}

export function portfolioSortSelectValueFromKey(sortKey: unknown): 'name' | 'priority' | 'effort' | 'score' {
    const key = normalizePortfolioSortKey(sortKey);
    if (key === 'task') return 'name';
    if (key === 'priority' || key === 'effort' || key === 'score') return key;
    return 'priority';
}

export function normalizePortfolioViewMode(value: unknown): PortfolioViewMode {
    if (value === 'maintenance') return 'maintenance';
    if (value === 'portfolio') return 'portfolio';
    if (value === 'dashboard') return 'dashboard';
    if (value === 'table') return 'table';
    if (value === 'roadmap') return 'roadmap';
    if (value === 'calendar') return 'calendar';
    if (value === 'planner') return 'planner';
    return 'board';
}

export function portfolioProjectColorKey(color: Partial<ProjectColor> | null | undefined): string {
    if (!color) return '';
    return `${color.bg}|${color.border}|${color.text}`;
}

export function slugifyColumnName(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function createPortfolioProjectColor(seed: unknown, offset = 0): ProjectColor {
    const baseSeed = Math.max(0, Number(seed) || 0) + (offset * 997);
    const hue = (((baseSeed * 137.50776405) % 360) + 360) % 360;
    const saturation = 62 + (baseSeed % 4) * 5;
    const bgLightness = 95 - (baseSeed % 3);
    const borderLightness = 78 - (baseSeed % 4) * 4;
    const textLightness = 28 - (baseSeed % 2) * 4;
    const hueValue = hue.toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    return {
        bg: `hsl(${hueValue} ${saturation}% ${bgLightness}%)`,
        border: `hsl(${hueValue} ${Math.max(50, saturation - 12)}% ${borderLightness}%)`,
        text: `hsl(${hueValue} ${Math.min(84, saturation + 8)}% ${textLightness}%)`
    };
}

export function createEmptyProjectData(title: string | null | undefined): BoardData {
    const now = nowIso();
    const projectTitle = (title || '').trim() || 'Untitled Project';
    return {
        meta: {
            schemaVersion: BOARD_SCHEMA_VERSION,
            appId: BOARD_APP_ID,
            createdAt: now,
            updatedAt: now
        },
        board: {
            columns: normalizeColumns(defaultColumns).map(col => ({ status: col.status, title: col.title })),
            tasks: [],
            settings: {
                title: projectTitle
            }
        },
        extensions: {}
    };
}

export function isAcceptedBoardSettingsShape(settings: unknown): settings is Record<'title', unknown> {
    return hasTitleOnlyBoardSettings(settings) || hasExtendedBoardSettings(settings);
}

export function comparePortfolioRows(a: PortfolioRow, b: PortfolioRow, sortBy: unknown, sortDir: unknown): number {
    const key = normalizePortfolioSortKey(sortBy);
    const dir = normalizePortfolioSortDir(sortDir);
    const statusRank = (value: unknown) => {
        const normalized = normalizeTaskStatus(value);
        if (normalized === 'backlog') return 0;
        if (normalized === 'to-do') return 1;
        if (normalized === 'doing') return 2;
        if (normalized === 'done') return 3;
        return 99;
    };

    let base = 0;
    if (key === 'board') {
        base = compareText(
            a.boardTitle || a.boardFileName || '',
            b.boardTitle || b.boardFileName || ''
        );
    } else if (key === 'task') {
        base = compareText(a.task.title || '', b.task.title || '');
    } else if (key === 'column') {
        base = statusRank(a.task.status) - statusRank(b.task.status);
    } else if (key === 'priority') {
        base = priorityRank(a.task.priority) - priorityRank(b.task.priority);
    } else if (key === 'effort') {
        base = effortRank(a.task.effort) - effortRank(b.task.effort);
    } else if (key === 'score') {
        const aScore = taskScore(a.task);
        const bScore = taskScore(b.task);
        if (aScore === null && bScore === null) {
            base = 0;
        } else if (aScore === null) {
            base = 1;
        } else if (bScore === null) {
            base = -1;
        } else {
            base = aScore - bScore;
        }
    } else if (key === 'dueDate') {
        base = comparePortfolioDueDateAsc(a, b);
    } else if (key === 'updatedAt') {
        base = (a.task.updatedAt || '').localeCompare(b.task.updatedAt || '');
    }

    if (base === 0) {
        base = priorityRank(a.task.priority) - priorityRank(b.task.priority);
    }
    if (base === 0) {
        base = (a.task.updatedAt || '').localeCompare(b.task.updatedAt || '') * -1;
    }
    if (base === 0) {
        base = compareText(a.task.title || '', b.task.title || '');
    }
    if (base === 0) {
        base = (a.task.id || 0) - (b.task.id || 0);
    }

    return dir === 'desc' ? base * -1 : base;
}

export function validateBoardData(data: unknown): asserts data is BoardData {
    if (!hasExactKeys(data, ['meta', 'board', 'extensions'])) {
        throw new Error('Invalid file root structure.');
    }
    if (!hasExactKeys(data.meta, ['schemaVersion', 'appId', 'createdAt', 'updatedAt'])) {
        throw new Error('Invalid meta structure.');
    }
    const schemaVersion = data.meta.schemaVersion;
    if (schemaVersion !== BOARD_SCHEMA_VERSION) {
        throw new Error(`Unsupported schemaVersion. Expected ${BOARD_SCHEMA_VERSION}.`);
    }
    if (data.meta.appId !== BOARD_APP_ID) {
        throw new Error('Invalid appId.');
    }
    if (!data.meta.createdAt || Number.isNaN(Date.parse(String(data.meta.createdAt)))) {
        throw new Error('Invalid meta.createdAt.');
    }
    if (!data.meta.updatedAt || Number.isNaN(Date.parse(String(data.meta.updatedAt)))) {
        throw new Error('Invalid meta.updatedAt.');
    }
    if (!hasExactKeys(data.board, ['columns', 'tasks', 'settings'])) {
        throw new Error('Invalid board structure.');
    }
    if (!Array.isArray(data.board.columns) || data.board.columns.length === 0) {
        throw new Error('Board must include at least one column.');
    }
    if (data.board.columns.length > MAX_COLUMNS) {
        throw new Error(`Board cannot have more than ${MAX_COLUMNS} columns.`);
    }
    if (!Array.isArray(data.board.tasks)) {
        throw new Error('Board tasks must be an array.');
    }
    if (!isAcceptedBoardSettingsShape(data.board.settings)) {
        throw new Error('Invalid board.settings structure.');
    }
    if (typeof data.board.settings.title !== 'string' || !data.board.settings.title.trim()) {
        throw new Error('Invalid board.settings.title.');
    }
    if (hasExtendedBoardSettings(data.board.settings)) {
        if (!(['manual', 'dueDate', 'effort', 'score'] as unknown[]).includes(data.board.settings.sortMode)) {
            throw new Error('Invalid board.settings.sortMode.');
        }
        if (typeof data.board.settings.showArchivedOnly !== 'boolean') {
            throw new Error('Invalid board.settings.showArchivedOnly.');
        }
        if ('archiveFilter' in data.board.settings && !isArchiveFilter(data.board.settings.archiveFilter)) {
            throw new Error('Invalid board.settings.archiveFilter.');
        }
    }
    const extensions = data.extensions;
    if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions)) {
        throw new Error('Invalid extensions structure.');
    }
    if ('project' in extensions) validateProjectInfo(getProjectInfo({ extensions: extensions as Record<string, unknown> }));
    if ('workflow' in extensions) validateWorkflow(getWorkflow(data as BoardData));
    if ('relations' in extensions) getRelations(data as BoardData);
    if ('projectPlan' in extensions) validatePhaseHierarchy(data as BoardData);
    if ('conversation' in extensions) getConversation(data as BoardData);
    if ('applications' in extensions) getApplications(data as BoardData);
    if ('maintenance' in extensions) getMaintenanceConfig(data as BoardData);
    if ('pullRequests' in extensions) for (const links of Object.values(getPullRequests(data as BoardData).byTaskId)) {
        if (!Array.isArray(links)) throw new Error('Invalid pull request list.');
        links.forEach(normalizePullRequest);
    }
    if (Object.prototype.hasOwnProperty.call(extensions, ROADMAP_EXTENSION_KEY)) {
        const normalizedRoadmap = normalizeRoadmapExtension((extensions as Record<string, unknown>)[ROADMAP_EXTENSION_KEY]);
        if (!normalizedRoadmap) {
            throw new Error('Invalid extensions.roadmap structure.');
        }
    }
    if (Object.prototype.hasOwnProperty.call(extensions, TIMELINE_EXTENSION_KEY)) {
        const normalizedTimeline = normalizeTimelineExtension((extensions as Record<string, unknown>)[TIMELINE_EXTENSION_KEY]);
        if (!normalizedTimeline) {
            throw new Error('Invalid extensions.timeline structure.');
        }
        if (normalizedTimeline.events.length > 0) {
            if (normalizedTimeline.events[0].kind !== 'board.baseline') {
                throw new Error('Timeline must start with board.baseline.');
            }
            if (normalizedTimeline.baselineEventId !== normalizedTimeline.events[0].id) {
                throw new Error('Timeline baselineEventId is invalid.');
            }
        }
    }
    const statuses = new Set<string>();
    data.board.columns.forEach((col) => {
        if (!hasExactKeys(col, ['status', 'title'])) {
            throw new Error('Invalid column structure.');
        }
        if (typeof col.status !== 'string' || !col.status.trim()) {
            throw new Error('Column status must be a non-empty string.');
        }
        if (typeof col.title !== 'string' || !col.title.trim()) {
            throw new Error('Column title must be a non-empty string.');
        }
        if (statuses.has(col.status)) {
            throw new Error('Column statuses must be unique.');
        }
        statuses.add(col.status);
    });

    const taskIds = new Set<number>();
    validateWorkitems(data as BoardData);
    data.board.tasks.forEach((task) => {
        const baseKeys = ['id', 'title', 'description', 'checklist', 'archived', 'createdAt', 'updatedAt', 'dueDate', 'priority', 'status'];
        const optionalTaskKeys = new Set(['workContext', 'applicationId', 'maintenanceOrigin', 'assigneeId', 'legacyAssignees', 'workitemType', 'parentId', 'acceptanceCriteria', 'reproductionSteps', 'expectedResult', 'tags', 'effort', 'attachments', 'assignee', 'assignees', 'blocked', 'blockerReason', 'statusChangedAt', 'phaseId', 'milestoneId', 'sprintId']);
        const taskKeys = Object.keys(task || {});
        const hasAllRequired = baseKeys.every((key) => taskKeys.includes(key));
        const hasOnlyAllowed = taskKeys.every((key) => baseKeys.includes(key) || optionalTaskKeys.has(key));
        if (!hasAllRequired || !hasOnlyAllowed) {
            throw new Error('Invalid task structure.');
        }
        if (typeof task.id !== 'number' || !Number.isFinite(task.id)) {
            throw new Error('Task id must be a number.');
        }
        if (!Number.isSafeInteger(task.id) || task.id <= 0) {
            throw new Error('Task id must be a positive safe integer.');
        }
        if (taskIds.has(task.id)) {
            throw new Error('Task ids must be unique.');
        }
        taskIds.add(task.id);
        if (typeof task.title !== 'string' || !task.title.trim()) {
            throw new Error('Task title must be a non-empty string.');
        }
        if (task.title.length > TASK_TITLE_MAX_LENGTH) {
            throw new Error(`Task title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer.`);
        }
        if (typeof task.description !== 'string') {
            throw new Error('Task description must be a string.');
        }
        if (!Array.isArray(task.checklist)) {
            throw new Error('Task checklist must be an array.');
        }
        if (typeof task.archived !== 'boolean') {
            throw new Error('Task archived must be boolean.');
        }
        if (!normalizeTimestamp(task.createdAt)) {
            throw new Error('Task createdAt must be a valid timestamp.');
        }
        if (!normalizeTimestamp(task.updatedAt)) {
            throw new Error('Task updatedAt must be a valid timestamp.');
        }
        if ('statusChangedAt' in task && !normalizeTimestamp(task.statusChangedAt)) {
            throw new Error('Task statusChangedAt must be a valid timestamp.');
        }
        if (typeof task.dueDate !== 'string' || (task.dueDate && !parseRoadmapIsoDate(task.dueDate))) {
            throw new Error('Task dueDate must be YYYY-MM-DD or empty.');
        }
        if (task.priority !== null && !['high', 'medium', 'low'].includes(task.priority)) {
            throw new Error('Task priority is invalid.');
        }
        if ('effort' in task && task.effort !== null && !isEffort(String(task.effort).toUpperCase())) {
            throw new Error('Task effort is invalid.');
        }
        if ('assignee' in task && !isAcceptedLegacyAssigneeValue(task.assignee)) {
            throw new Error('Task assignee must be a string or string array.');
        }
        if ('assignees' in task && (!Array.isArray(task.assignees) || task.assignees.some((name: unknown) => typeof name !== 'string'))) {
            throw new Error('Task assignees must be a string array.');
        }
        if ('phaseId' in task && typeof task.phaseId !== 'string') {
            throw new Error('Task phaseId must be a string.');
        }
        if ('milestoneId' in task && typeof task.milestoneId !== 'string') {
            throw new Error('Task milestoneId must be a string.');
        }
        if ('sprintId' in task && typeof task.sprintId !== 'string') {
            throw new Error('Task sprintId must be a string.');
        }
        if ('blocked' in task && typeof task.blocked !== 'boolean') {
            throw new Error('Task blocked must be boolean.');
        }
        if ('blockerReason' in task && typeof task.blockerReason !== 'string') {
            throw new Error('Task blockerReason must be a string.');
        }
        if (task.blocked === true && !normalizeBlockerReason(task.blockerReason)) {
            throw new Error('Blocked tasks require blockerReason.');
        }
        const maintenanceStatuses = task.workContext === 'maintenance' ? getMaintenanceConfig(data as BoardData)?.workflow?.states.map((state) => state.id) : undefined;
        if (task.workContext !== undefined && task.workContext !== 'project' && task.workContext !== 'maintenance') throw new Error('Invalid work context.');
        if (typeof task.status !== 'string' || !(maintenanceStatuses ? maintenanceStatuses.includes(task.status) : statuses.has(task.status))) {
            throw new Error('Task status is invalid.');
        }
        task.checklist.forEach((item: unknown) => {
            if (!hasExactKeys(item, ['text', 'done'])) {
                throw new Error('Invalid checklist item structure.');
            }
            if (typeof item.text !== 'string' || !item.text.trim()) {
                throw new Error('Checklist item text must be non-empty.');
            }
            if (typeof item.done !== 'boolean') {
                throw new Error('Checklist item done must be boolean.');
            }
        });
        if (Object.prototype.hasOwnProperty.call(task, 'attachments')) {
            if (!Array.isArray(task.attachments)) {
                throw new Error('Task attachments must be an array.');
            }
            task.attachments.forEach((attachment: unknown) => {
                if (!hasExactKeys(attachment, ['id', 'name', 'mime', 'sizeBytes', 'kind', 'dataUrl', 'createdAt'])) {
                    throw new Error('Invalid attachment structure.');
                }
                if (typeof attachment.id !== 'string' || !attachment.id.trim()) {
                    throw new Error('Attachment id must be a non-empty string.');
                }
                if (typeof attachment.name !== 'string' || !attachment.name.trim()) {
                    throw new Error('Attachment name must be a non-empty string.');
                }
                if (typeof attachment.mime !== 'string') {
                    throw new Error('Attachment mime must be a string.');
                }
                if (typeof attachment.sizeBytes !== 'number' || !Number.isFinite(attachment.sizeBytes) || attachment.sizeBytes < 0) {
                    throw new Error('Attachment sizeBytes must be a non-negative number.');
                }
                if (attachment.kind !== 'image' && attachment.kind !== 'file') {
                    throw new Error('Attachment kind is invalid.');
                }
                if (typeof attachment.dataUrl !== 'string' || !attachment.dataUrl.startsWith('data:')) {
                    throw new Error('Attachment dataUrl must be a data URL string.');
                }
                if (!normalizeTimestamp(attachment.createdAt)) {
                    throw new Error('Attachment createdAt must be a valid timestamp.');
                }
            });
        }
        if (Object.prototype.hasOwnProperty.call(task, 'tags')) {
            if (!Array.isArray(task.tags)) {
                throw new Error('Task tags must be an array.');
            }
            task.tags.forEach((tag: unknown) => {
                if (typeof tag !== 'string' || !tag.trim()) {
                    throw new Error('Task tag must be non-empty string.');
                }
            });
        }
    });
}
