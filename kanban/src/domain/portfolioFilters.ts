// Portfolio toolbar filters: the defaults and the rules for accepting a value.
// Used by the controls, the URL state, and the filtered-rows selector.

import type { PortfolioFilters } from '../types';
import { EFFORT_BUCKETS, isArchiveFilter } from './constants';
import { normalizeAssignee, normalizePortfolioBlockedFilter } from './task';

export type PortfolioFilterName = keyof PortfolioFilters;

export const DEFAULT_PORTFOLIO_FILTERS: Readonly<PortfolioFilters> = Object.freeze({
    search: '',
    archive: 'active',
    blocked: 'all',
    assignee: '',
    priority: '',
    effort: ''
});

const PRIORITY_FILTER_VALUES: readonly PortfolioFilters['priority'][] = ['', 'high', 'medium', 'low'];
const EFFORT_FILTER_VALUES: readonly PortfolioFilters['effort'][] = ['', ...EFFORT_BUCKETS];

function includesValue<T>(values: readonly T[], value: unknown): value is T {
    return (values as readonly unknown[]).includes(value);
}

export function normalizePortfolioFilterValue<K extends PortfolioFilterName>(name: K, value: unknown): PortfolioFilters[K] {
    let normalized: PortfolioFilters[PortfolioFilterName];
    if (name === 'search') normalized = String(value ?? '');
    else if (name === 'archive') normalized = isArchiveFilter(value) ? value : 'active';
    else if (name === 'blocked') normalized = normalizePortfolioBlockedFilter(value);
    else if (name === 'assignee') normalized = normalizeAssignee(value);
    else if (name === 'priority') normalized = includesValue(PRIORITY_FILTER_VALUES, value) ? value : '';
    else if (name === 'effort') normalized = includesValue(EFFORT_FILTER_VALUES, value) ? value : '';
    else normalized = DEFAULT_PORTFOLIO_FILTERS[name];
    return normalized as PortfolioFilters[K];
}

// Returns a complete filter object: missing keys get their default and every
// value is normalized.
export function normalizePortfolioFilterSet(filters: Partial<Record<PortfolioFilterName, unknown>> | null | undefined): PortfolioFilters {
    const current = { ...DEFAULT_PORTFOLIO_FILTERS, ...(filters || {}) };
    return Object.fromEntries(
        (Object.keys(DEFAULT_PORTFOLIO_FILTERS) as PortfolioFilterName[]).map((key) => [key, normalizePortfolioFilterValue(key, current[key])])
    ) as PortfolioFilters;
}
