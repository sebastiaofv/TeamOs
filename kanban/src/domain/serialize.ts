import type { BoardData, BoardExtensions, BoardMeta, LooseBoardData, TeamOsExtensions } from '../types';
import { BOARD_APP_ID, BOARD_SCHEMA_VERSION, DEFAULT_BOARD_TITLE, ROADMAP_EXTENSION_KEY, TEAMOS_EXTENSIONS_KEY, TIMELINE_EXTENSION_KEY, defaultColumns } from './constants';
import { getLegacyTaskAttachmentsFromExtensions, stripLegacyTaskAttachmentsFromExtensions } from './attachments';
import { normalizeColumns } from './board';
import { normalizeRoadmapExtension } from './roadmap';
import { normalizeTask } from './task';
import { normalizeTimelineExtension } from './timeline';
import { normalizeTimestamp, nowIso } from './util';

type LooseMeta = Partial<Record<keyof BoardMeta, unknown>>;
type LooseBoard = NonNullable<LooseBoardData['board']>;

export function areSerializableValuesEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneSerializable<T>(value: T): T {
    if (value === undefined) return undefined as T;
    return JSON.parse(JSON.stringify(value));
}

export function getBoardExtensionsObject(boardData: LooseBoardData, options: { create: true }): BoardExtensions;
export function getBoardExtensionsObject(boardData: LooseBoardData | null | undefined, options?: { create?: boolean }): BoardExtensions | null;
export function getBoardExtensionsObject(boardData: LooseBoardData | null | undefined, options: { create?: boolean } = {}): BoardExtensions | null {
    const create = Boolean(options.create);
    if (!boardData || typeof boardData !== 'object' || Array.isArray(boardData)) return null;
    if (!boardData.extensions || typeof boardData.extensions !== 'object' || Array.isArray(boardData.extensions)) {
        if (!create) return null;
        boardData.extensions = {};
    }
    return boardData.extensions as BoardExtensions;
}

export function hashTextContent(text: unknown): string {
    const value = String(text ?? '');
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `h${(hash >>> 0).toString(16)}`;
}

export function getTeamOsExtensionsObject(boardData: LooseBoardData | null | undefined, options: { create?: boolean } = {}): TeamOsExtensions | null {
    const create = Boolean(options.create);
    const extensions = getBoardExtensionsObject(boardData, { create });
    if (!extensions) return null;
    const teamOs = extensions[TEAMOS_EXTENSIONS_KEY];
    if (!teamOs || typeof teamOs !== 'object' || Array.isArray(teamOs)) {
        if (!create) return null;
        const created = {};
        extensions[TEAMOS_EXTENSIONS_KEY] = created;
        return created;
    }
    return teamOs;
}

export function normalizeBoardExtensionsValue(extensionsValue: unknown, options: { includeTimeline?: boolean } = {}): BoardExtensions {
    const includeTimeline = options.includeTimeline !== false;
    const base = stripLegacyTaskAttachmentsFromExtensions(extensionsValue);
    const nextExtensions = ((base && typeof base === 'object' && !Array.isArray(base))
        ? { ...base }
        : {}) as BoardExtensions;

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

export function createBoardStateSnapshot(boardData: unknown): BoardData {
    const input = (boardData && typeof boardData === 'object' ? boardData : {}) as LooseBoardData;
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
        extensions: normalizeBoardExtensionsValue(input.extensions, { includeTimeline: false })
    };
}

export function serializeBoardDataFromObject(boardData: unknown): BoardData {
    const now = nowIso();
    const input = (boardData && typeof boardData === 'object' ? boardData : {}) as LooseBoardData;
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
        extensions: normalizeBoardExtensionsValue(input.extensions)
    };
}
