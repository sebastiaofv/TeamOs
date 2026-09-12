import { hasExactKeys, nowIso } from './util.js';
import { resolveKnownTaskStatus } from './task.js';
import { BOARD_APP_ID, BOARD_SCHEMA_VERSION, MAX_COLUMNS, defaultColumns } from './constants.js';

export function hasExtendedBoardSettings(settings) {
    return hasExactKeys(settings, ['title', 'sortMode', 'showArchivedOnly'])
        || hasExactKeys(settings, ['title', 'sortMode', 'showArchivedOnly', 'archiveFilter']);
}

export function hasTitleOnlyBoardSettings(settings) {
    return hasExactKeys(settings, ['title']);
}

export function nextPortfolioProjectId() {
    return `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeBoardArchiveFilter(value) {
    if (value === true || value === '1' || value === 'archived') return 'archived';
    if (value === 'all') return 'all';
    return 'active';
}

export function normalizeColumns(inputColumns) {
    if (!Array.isArray(inputColumns) || inputColumns.length === 0) {
        return defaultColumns.map(col => ({ ...col }));
    }

    const defaultsByStatus = Object.fromEntries(defaultColumns.map(col => [col.status, col]));
    const seen = new Set();
    const normalized = [];
    inputColumns.forEach((col) => {
        if (!col || typeof col !== 'object') return;
        const status = resolveKnownTaskStatus(col.status);
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

export function normalizePortfolioSortDir(value) {
    return value === 'desc' ? 'desc' : 'asc';
}

export function normalizePortfolioSortKey(value) {
    return ['board', 'task', 'column', 'priority', 'effort', 'score', 'dueDate', 'updatedAt'].includes(value)
        ? value
        : 'priority';
}

export function normalizePortfolioViewMode(value) {
    if (value === 'roadmap') return 'roadmap';
    if (value === 'calendar') return 'calendar';
    return 'board';
}

export function portfolioProjectColorKey(color) {
    if (!color) return '';
    return `${color.bg}|${color.border}|${color.text}`;
}

export function slugifyColumnName(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function createPortfolioProjectColor(seed, offset = 0) {
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

export function createEmptyProjectData(title) {
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

export function isAcceptedBoardSettingsShape(settings) {
    return hasTitleOnlyBoardSettings(settings) || hasExtendedBoardSettings(settings);
}
