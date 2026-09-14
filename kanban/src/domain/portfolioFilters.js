// Portfolio toolbar filters: the defaults and the rules for accepting a value.
// Used by the controls, the URL state, and the filtered-rows selector.

import { BOARD_ARCHIVE_FILTER_VALUES, EFFORT_BUCKETS } from './constants.js';
import { normalizeAssignee, normalizePortfolioBlockedFilter } from './task.js';

export const DEFAULT_PORTFOLIO_FILTERS = Object.freeze({
    search: '',
    archive: 'active',
    blocked: 'all',
    assignee: '',
    priority: '',
    effort: ''
});

const PRIORITY_FILTER_VALUES = ['', 'high', 'medium', 'low'];
const EFFORT_FILTER_VALUES = ['', ...EFFORT_BUCKETS];

export function normalizePortfolioFilterValue(name, value) {
    if (name === 'search') return String(value ?? '');
    if (name === 'archive') return BOARD_ARCHIVE_FILTER_VALUES.includes(value) ? value : 'active';
    if (name === 'blocked') return normalizePortfolioBlockedFilter(value);
    if (name === 'assignee') return normalizeAssignee(value);
    if (name === 'priority') return PRIORITY_FILTER_VALUES.includes(value) ? value : '';
    if (name === 'effort') return EFFORT_FILTER_VALUES.includes(value) ? value : '';
    return DEFAULT_PORTFOLIO_FILTERS[name];
}

// Returns a complete filter object: missing keys get their default and every
// value is normalized.
export function normalizePortfolioFilterSet(filters) {
    const current = { ...DEFAULT_PORTFOLIO_FILTERS, ...(filters || {}) };
    return Object.fromEntries(
        Object.keys(DEFAULT_PORTFOLIO_FILTERS).map((key) => [key, normalizePortfolioFilterValue(key, current[key])])
    );
}
