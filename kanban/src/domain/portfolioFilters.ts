// Portfolio toolbar filters: the defaults and the rules for accepting a value.
// Used by the controls, the URL state, and the filtered-rows selector.

import type { PortfolioFilters } from '@/features/portfolio/types';
import type { Task, TaskStatus, LooseBoardData } from './types';
import { getRoadmapExtension } from './roadmap';
import { phaseDescendants } from './phaseTree';
import { EFFORT_BUCKETS, isArchiveFilter } from './constants';
import { normalizeAssignee, normalizePortfolioBlockedFilter, taskAssignees } from './task';
import { matchesPeopleFilter } from './peopleFilters';

export type PortfolioFilterName = keyof PortfolioFilters;

export const DEFAULT_PORTFOLIO_FILTERS: Readonly<PortfolioFilters> = Object.freeze({
    search: '',
    archive: 'active',
    blocked: 'all',
    assignee: '',
    responsible: '',
    priority: '',
    effort: '',
    statuses: [],
    phaseId: '',
    milestoneId: '',
    sprintId: ''
});

const PRIORITY_FILTER_VALUES: readonly PortfolioFilters['priority'][] = ['', 'high', 'medium', 'low'];
const EFFORT_FILTER_VALUES: readonly PortfolioFilters['effort'][] = ['', ...EFFORT_BUCKETS];
const STATUS_FILTER_VALUES: readonly TaskStatus[] = ['backlog', 'to-do', 'doing', 'done'];

function includesValue<T>(values: readonly T[], value: unknown): value is T {
    return (values as readonly unknown[]).includes(value);
}

export function normalizePortfolioFilterValue<K extends PortfolioFilterName>(name: K, value: unknown): PortfolioFilters[K] {
    let normalized: PortfolioFilters[PortfolioFilterName];
    if (name === 'search') normalized = String(value ?? '');
    else if (name === 'archive') normalized = isArchiveFilter(value) ? value : 'active';
    else if (name === 'blocked') normalized = normalizePortfolioBlockedFilter(value);
    else if (name === 'assignee' || name === 'responsible') normalized = normalizeAssignee(value);
    else if (name === 'priority') normalized = includesValue(PRIORITY_FILTER_VALUES, value) ? value : '';
    else if (name === 'effort') normalized = includesValue(EFFORT_FILTER_VALUES, value) ? value : '';
    else if (name === 'statuses') {
        const statuses = Array.isArray(value)
            ? [...new Set(value.filter((status): status is TaskStatus => includesValue(STATUS_FILTER_VALUES, status)))] : [];
        // Preserve unchanged selections so board edits do not reset pagination.
        normalized = Array.isArray(value) && statuses.length === value.length
            && statuses.every((status, index) => status === value[index]) ? value : statuses;
    }
    else if (name === 'phaseId' || name === 'milestoneId' || name === 'sprintId') normalized = typeof value === 'string' ? value.trim() : '';
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

// The filters shown in the toolbar's Filters panel, in panel order. Search has
// its own box and is not one of them.
export const PANEL_PORTFOLIO_FILTERS = ['archive', 'blocked', 'responsible', 'assignee', 'priority', 'effort', 'statuses', 'phaseId', 'milestoneId', 'sprintId'] as const;
export type PanelPortfolioFilterName = typeof PANEL_PORTFOLIO_FILTERS[number];

export function getActivePortfolioFilterNames(filters: Partial<Record<PortfolioFilterName, unknown>> | null | undefined): PanelPortfolioFilterName[] {
    const normalized = normalizePortfolioFilterSet(filters);
    return PANEL_PORTFOLIO_FILTERS.filter((name) => name === 'statuses'
        ? normalized.statuses.length > 0 : normalized[name] !== DEFAULT_PORTFOLIO_FILTERS[name]);
}

/** Shared by every view: filters are ANDed, selected statuses are ORed. */
export function taskMatchesPortfolioFilters(task: Task, filters: PortfolioFilters, data?: LooseBoardData | null): boolean {
    if (filters.archive === 'active' && task.archived) return false;
    if (filters.archive === 'archived' && !task.archived) return false;
    if (filters.statuses.length && !filters.statuses.includes(task.status)) return false;
    if (!matchesPeopleFilter(taskAssignees(task), filters.assignee)) return false;
    if (!matchesPeopleFilter(task.responsible ? [task.responsible] : [], filters.responsible)) return false;
    if (filters.phaseId === '__none__' ? Boolean(task.phaseId) : filters.phaseId && !phaseDescendants(getRoadmapExtension(data)?.phases || [], filters.phaseId).has(task.phaseId)) return false;
    if (filters.milestoneId === '__none__' ? Boolean(task.milestoneId) : filters.milestoneId && task.milestoneId !== filters.milestoneId) return false;
    if (filters.sprintId && task.sprintId !== filters.sprintId) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.effort && task.effort !== filters.effort) return false;
    if (filters.blocked === 'blocked' && !task.blocked) return false;
    if (filters.blocked === 'unblocked' && task.blocked) return false;
    const search = filters.search.trim().toLowerCase();
    return !search || [String(task.id), task.title || '', task.description || '']
        .some((value) => value.toLowerCase().includes(search));
}
