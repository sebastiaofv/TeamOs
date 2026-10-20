import type { BoardData, BoardExtensions, BoardMeta, LooseBoardData } from './types';
import { BOARD_APP_ID, BOARD_SCHEMA_VERSION, DAY_PLANNER_EXTENSION_KEY, DEFAULT_BOARD_TITLE, ROADMAP_EXTENSION_KEY, TIMELINE_EXTENSION_KEY, defaultColumns } from './constants';
import { getLegacyTaskAttachmentsFromExtensions, stripLegacyTaskAttachmentsFromExtensions } from './attachments';
import { normalizeColumns } from './board';
import { normalizeDayPlannerExtension } from './dayPlanner';
import { normalizeRoadmapExtension } from './roadmap';
import { normalizeTask } from './task';
import { migrateBoardData } from './boardMigrations';
import { normalizeTimelineExtension } from './timelineSchema';
import { normalizeTimestamp, nowIso } from './util';
import { parseTaskRelations } from '@/domain/taskRelations';
import { normalizeSprintCatalog } from '@/domain/sprintCatalog';
import { reserveTaskIdentities } from './taskIdentity';
import { parseConversations } from './comments';
export { getBoardExtensionsObject, getTeamOsExtensionsObject } from './extensions';
export { areSerializableValuesEqual, cloneSerializable } from './serializable';

type LooseMeta = Partial<Record<keyof BoardMeta, unknown>>;
type LooseBoard = NonNullable<LooseBoardData['board']>;

export function hashTextContent(text: unknown): string {
    const value = String(text ?? '');
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `h${(hash >>> 0).toString(16)}`;
}

export function normalizeBoardExtensionsValue(
    extensionsValue: unknown,
    options: { includeTimeline?: boolean; taskIds?: ReadonlySet<number> } = {}
): BoardExtensions {
    const includeTimeline = options.includeTimeline !== false;
    const base = stripLegacyTaskAttachmentsFromExtensions(extensionsValue);
    const nextExtensions = ((base && typeof base === 'object' && !Array.isArray(base))
        ? { ...base }
        : {}) as BoardExtensions;
    delete nextExtensions.conversationRefs;
    if (!includeTimeline) delete nextExtensions.conversations;
    else if (nextExtensions.conversations !== undefined || normalizeTimelineExtension(nextExtensions.timeline)?.events.some((event) => event.kind === 'task.comment.published')) {
        const conversations = parseConversations(nextExtensions.conversations, normalizeTimelineExtension(nextExtensions.timeline)?.events);
        if (conversations) nextExtensions.conversations = conversations;
    }

    const relations = parseTaskRelations(nextExtensions.taskRelations, options.taskIds);
    if (relations?.relations.length) nextExtensions.taskRelations = relations;
    else delete nextExtensions.taskRelations;

    if (Object.prototype.hasOwnProperty.call(nextExtensions, ROADMAP_EXTENSION_KEY)) {
        const normalizedRoadmap = normalizeRoadmapExtension(nextExtensions[ROADMAP_EXTENSION_KEY]);
        if (normalizedRoadmap) {
            nextExtensions[ROADMAP_EXTENSION_KEY] = normalizedRoadmap;
        } else {
            delete nextExtensions[ROADMAP_EXTENSION_KEY];
        }
    }

    const sprintCatalog = normalizeSprintCatalog(nextExtensions.sprintCatalog, nextExtensions.roadmap?.sprints || [], nextExtensions.timeline);
    if (sprintCatalog) nextExtensions.sprintCatalog = sprintCatalog;

    if (Object.prototype.hasOwnProperty.call(nextExtensions, DAY_PLANNER_EXTENSION_KEY)) {
        const normalizedPlanner = normalizeDayPlannerExtension(nextExtensions[DAY_PLANNER_EXTENSION_KEY], options.taskIds);
        if (normalizedPlanner) {
            nextExtensions[DAY_PLANNER_EXTENSION_KEY] = normalizedPlanner;
        } else {
            delete nextExtensions[DAY_PLANNER_EXTENSION_KEY];
        }
    }

    if (!includeTimeline) {
        delete nextExtensions[TIMELINE_EXTENSION_KEY];
        return nextExtensions;
    }

    if (Object.prototype.hasOwnProperty.call(nextExtensions, TIMELINE_EXTENSION_KEY)) {
        const normalizedTimeline = normalizeTimelineExtension(nextExtensions[TIMELINE_EXTENSION_KEY]);
        if (normalizedTimeline) {
            nextExtensions[TIMELINE_EXTENSION_KEY] = normalizedTimeline;
        } else {
            delete nextExtensions[TIMELINE_EXTENSION_KEY];
        }
    }
    return nextExtensions;
}

export function createBoardStateSnapshot(boardData: unknown): BoardData {
    const input = migrateBoardData((boardData && typeof boardData === 'object' ? boardData : {}) as LooseBoardData);
    const meta = (input.meta && typeof input.meta === 'object' ? input.meta : {}) as LooseMeta;
    const board = (input.board && typeof input.board === 'object' ? input.board : {}) as LooseBoard;
    const settings = (board.settings && typeof board.settings === 'object' ? board.settings : {}) as { title?: unknown };
    const now = nowIso();
    const roadmap = normalizeRoadmapExtension(input.extensions?.[ROADMAP_EXTENSION_KEY]);
    const normalizedColumns = normalizeColumns(Array.isArray(board.columns) ? board.columns : defaultColumns);
    const normalizedTasks = Array.isArray(board.tasks)
        ? board.tasks.map((task) => normalizeTask(task, {
            fallbackAttachments: getLegacyTaskAttachmentsFromExtensions(input, task?.id),
            includeStatusChangedAt: false,
            roadmap
        }))
        : [];
    const title = typeof settings.title === 'string' && settings.title.trim()
        ? settings.title.trim()
        : DEFAULT_BOARD_TITLE;

    return {
        meta: {
            schemaVersion: BOARD_SCHEMA_VERSION,
            appId: BOARD_APP_ID,
            createdAt: normalizeTimestamp(meta.createdAt) || now,
            updatedAt: normalizeTimestamp(meta.updatedAt) || normalizeTimestamp(meta.createdAt) || now
        },
        board: {
            columns: normalizedColumns.map((col) => ({ status: col.status, title: col.title })),
            tasks: normalizedTasks,
            settings: {
                title
            }
        },
        extensions: normalizeBoardExtensionsValue(input.extensions, {
            includeTimeline: false,
            taskIds: new Set(normalizedTasks.map((task) => Number(task.id)))
        })
    };
}

export function serializeBoardDataFromObject(boardData: unknown): BoardData {
    const now = nowIso();
    const input = migrateBoardData((boardData && typeof boardData === 'object' ? boardData : {}) as LooseBoardData);
    const reservedInput = { ...input, extensions: { ...input.extensions } };
    reserveTaskIdentities(reservedInput);
    const meta = (input.meta && typeof input.meta === 'object' ? input.meta : {}) as LooseMeta;
    const board = (input.board && typeof input.board === 'object' ? input.board : {}) as LooseBoard;
    const settings = (board.settings && typeof board.settings === 'object' ? board.settings : {}) as { title?: unknown };
    const roadmap = normalizeRoadmapExtension(input.extensions?.[ROADMAP_EXTENSION_KEY]);

    const normalizedColumns = normalizeColumns(Array.isArray(board.columns) ? board.columns : defaultColumns);
    const normalizedTasks = Array.isArray(board.tasks)
        ? board.tasks.map(task => normalizeTask(task, {
            fallbackAttachments: getLegacyTaskAttachmentsFromExtensions(input, task?.id),
            includeStatusChangedAt: false,
            roadmap
        }))
        : [];
    const title = typeof settings.title === 'string' && settings.title.trim()
        ? settings.title.trim()
        : DEFAULT_BOARD_TITLE;

    return {
        meta: {
            schemaVersion: BOARD_SCHEMA_VERSION,
            appId: BOARD_APP_ID,
            createdAt: normalizeTimestamp(meta.createdAt) || now,
            updatedAt: now
        },
        board: {
            columns: normalizedColumns.map(col => ({ status: col.status, title: col.title })),
            tasks: normalizedTasks,
            settings: {
                title
            }
        },
        extensions: normalizeBoardExtensionsValue(reservedInput.extensions, {
            taskIds: new Set(normalizedTasks.map((task) => Number(task.id)))
        })
    };
}
