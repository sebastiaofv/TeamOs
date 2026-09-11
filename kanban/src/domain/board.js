import { hasExactKeys } from './util.js';
import { resolveKnownTaskStatus } from './task.js';
import { MAX_COLUMNS, defaultColumns } from './constants.js';

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
