// Compatibility facade for portfolio selectors.
//
// Each view family owns its own derivation module; this file keeps the
// established import surface stable for components and consumers.

import type { PortfolioFilters, PortfolioRow } from '@/features/portfolio/types';
import {
    comparePortfolioRows,
    normalizePortfolioSortDir,
    normalizePortfolioSortKey
} from '@/domain/board';
import {
    normalizeAssignee,
    normalizePortfolioBlockedFilter,
    taskHasAssignee
} from '@/domain/task';
import { DEFAULT_PORTFOLIO_FILTERS, normalizePortfolioFilterSet } from '@/domain/portfolioFilters';
import {
    buildPortfolioRowsFromBoardData,
    buildPortfolioTasks,
    getBoardRecord,
    type SelectorState
} from './portfolioRowViews';
import {
    buildPortfolioTimelineViewModel,
    getPortfolioBulkTaskIds,
    getSelectedPortfolioTimelineView,
    isBoardInHistoricalPreview,
    type PortfolioTimelineSelectionView
} from './portfolioTimelineViews';
import { buildPortfolioRoadmapView } from './portfolioRoadmapViews';
import { buildPortfolioCalendarViewModel } from './portfolioCalendarViews';
import { buildPortfolioPlannerViewModel } from './portfolioPlannerViews';

// Normalized filters for the current state; an assignee filter that matches no
// loaded task is dropped.
export function normalizePortfolioFilters(state: SelectorState): PortfolioFilters {
    const next = normalizePortfolioFilterSet(state?.portfolioFilters);
    if ((state?.portfolioBoards || []).length > 0 && next.assignee) {
        const names = new Set(
            (state?.portfolioTasks || buildPortfolioTasks(state))
                .flatMap((item) => item?.task?.assignees || [])
                .map((name) => normalizeAssignee(name))
                .filter(Boolean)
        );
        if (![...names].some((name) => name.toLowerCase() === next.assignee.toLowerCase())) {
            next.assignee = '';
        }
    }
    return next;
}

export function getFilteredSortedPortfolioRows(state: SelectorState, options: { sourceRows?: PortfolioRow[] } = {}): PortfolioRow[] {
    const filters = { ...DEFAULT_PORTFOLIO_FILTERS, ...(state?.portfolioFilters || {}) };
    const search = String(filters.search || '').trim().toLowerCase();
    const priorityFilter = filters.priority || '';
    const assigneeFilter = normalizeAssignee(filters.assignee || '');
    const blockedFilter = normalizePortfolioBlockedFilter(filters.blocked || 'all');
    const effortFilter = filters.effort || '';
    const archiveFilter = filters.archive || 'active';
    const sortBy = normalizePortfolioSortKey(state?.portfolioSortKey);
    const sortDir = normalizePortfolioSortDir(state?.portfolioSortDir);
    const timelineView = getSelectedPortfolioTimelineView(state);
    const sourceRows = options.sourceRows
        || ((timelineView?.isPreview && timelineView.projectedBoard)
            ? buildPortfolioRowsFromBoardData(state, timelineView.boardRecord, timelineView.projectedBoard, {
                canMutate: false,
                historical: true
            })
            : (Array.isArray(state?.portfolioTasks) ? state.portfolioTasks : buildPortfolioTasks(state)));

    return sourceRows
        .filter((item) => {
            const task = item.task;
            if (state?.selectedPortfolioBoardId && item.boardId !== state.selectedPortfolioBoardId) return false;
            if (archiveFilter === 'active' && task.archived) return false;
            if (archiveFilter === 'archived' && !task.archived) return false;
            if (priorityFilter && task.priority !== priorityFilter) return false;
            if (assigneeFilter && !taskHasAssignee(task, assigneeFilter)) return false;
            if (blockedFilter === 'blocked' && !task.blocked && !item.dependencyBlocked) return false;
            if (blockedFilter === 'unblocked' && (task.blocked || item.dependencyBlocked)) return false;
            if (effortFilter && task.effort !== effortFilter) return false;
            if (search && !String(task.title || '').toLowerCase().includes(search)) return false;
            return true;
        })
        .sort((a, b) => comparePortfolioRows(a, b, sortBy, sortDir));
}

export type { SelectorState, PortfolioTimelineSelectionView };
export {
    buildPortfolioTasks,
    buildPortfolioRowsFromBoardData,
    getBoardRecord,
    buildPortfolioTimelineViewModel,
    getPortfolioBulkTaskIds,
    getSelectedPortfolioTimelineView,
    isBoardInHistoricalPreview,
    buildPortfolioRoadmapView,
    buildPortfolioCalendarViewModel,
    buildPortfolioPlannerViewModel
};
export type { PlannerBlockView, PlannerDayView, PlannerTrayGroup, PlannerTrayItem, PlannerViewModel } from './portfolioPlannerViews';
