import { BOARD_APP_ID, BOARD_SCHEMA_VERSION, DEFAULT_BOARD_TITLE, ROADMAP_EXTENSION_KEY, TEAMOS_EXTENSIONS_KEY, TIMELINE_EXTENSION_KEY, defaultColumns } from './constants.js';
import { getLegacyTaskAttachmentsFromExtensions, stripLegacyTaskAttachmentsFromExtensions } from './attachments.js';
import { normalizeColumns } from './board.js';
import { normalizeRoadmapExtension } from './roadmap.js';
import { normalizeTask } from './task.js';
import { normalizeTimelineExtension } from './timeline.js';
import { normalizeTimestamp, nowIso } from './util.js';

export function areSerializableValuesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneSerializable(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

export function getBoardExtensionsObject(boardData, options = {}) {
    const create = Boolean(options.create);
    if (!boardData || typeof boardData !== 'object' || Array.isArray(boardData)) return null;
    if (!boardData.extensions || typeof boardData.extensions !== 'object' || Array.isArray(boardData.extensions)) {
        if (!create) return null;
        boardData.extensions = {};
    }
    return boardData.extensions;
}

export function hashTextContent(text) {
    const value = String(text ?? '');
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `h${(hash >>> 0).toString(16)}`;
}

export function getTeamOsExtensionsObject(boardData, options = {}) {
    const create = Boolean(options.create);
    const extensions = getBoardExtensionsObject(boardData, { create });
    if (!extensions) return null;
    if (!extensions[TEAMOS_EXTENSIONS_KEY] || typeof extensions[TEAMOS_EXTENSIONS_KEY] !== 'object' || Array.isArray(extensions[TEAMOS_EXTENSIONS_KEY])) {
        if (!create) return null;
        extensions[TEAMOS_EXTENSIONS_KEY] = {};
    }
    return extensions[TEAMOS_EXTENSIONS_KEY];
}

export function normalizeBoardExtensionsValue(extensionsValue, options = {}) {
    const includeTimeline = options.includeTimeline !== false;
    const base = stripLegacyTaskAttachmentsFromExtensions(extensionsValue);
    const nextExtensions = (base && typeof base === 'object' && !Array.isArray(base))
        ? { ...base }
        : {};

    if (Object.prototype.hasOwnProperty.call(nextExtensions, ROADMAP_EXTENSION_KEY)) {
        const normalizedRoadmap = normalizeRoadmapExtension(nextExtensions[ROADMAP_EXTENSION_KEY]);
        if (normalizedRoadmap) {
            nextExtensions[ROADMAP_EXTENSION_KEY] = normalizedRoadmap;
        } else {
            delete nextExtensions[ROADMAP_EXTENSION_KEY];
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

export function createBoardStateSnapshot(boardData) {
    const input = boardData && typeof boardData === 'object' ? boardData : {};
    const meta = input.meta && typeof input.meta === 'object' ? input.meta : {};
    const board = input.board && typeof input.board === 'object' ? input.board : {};
    const settings = board.settings && typeof board.settings === 'object' ? board.settings : {};
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
        extensions: normalizeBoardExtensionsValue(input.extensions, { includeTimeline: false })
    };
}

export function serializeBoardDataFromObject(boardData) {
    const now = nowIso();
    const input = boardData && typeof boardData === 'object' ? boardData : {};
    const meta = input.meta && typeof input.meta === 'object' ? input.meta : {};
    const board = input.board && typeof input.board === 'object' ? input.board : {};
    const settings = board.settings && typeof board.settings === 'object' ? board.settings : {};
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
        extensions: normalizeBoardExtensionsValue(input.extensions)
    };
}
