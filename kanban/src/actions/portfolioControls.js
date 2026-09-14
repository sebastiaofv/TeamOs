// Store-backed portfolio controls and project-session actions.
//
// The module owns the state transitions behind toolbar filters, project chips,
// bulk controls, board selection, and calendar navigation.

import { EFFORT_BUCKETS } from '../domain/constants.js';
import { normalizeAssignee, normalizePortfolioBlockedFilter } from '../domain/task.js';
import { normalizePortfolioSortKey, normalizePortfolioViewMode } from '../domain/board.js';
import { getRoadmapExtension } from '../domain/roadmap.js';
import {
    closePortfolioContextsForProject as defaultClosePortfolioContextsForProject,
    clearPortfolioTimelineSelection as defaultClearPortfolioTimelineSelection,
    openRoadmapEntityModal as defaultOpenRoadmapEntityModal
} from './portfolioMutations.js';
import { retryProjectSave, primeProjectFileBaselines, syncProjectSaveStates } from '../persistence/projectFiles.js';
import { notifyAppStateChanged, useAppStore } from '../state/store.js';
import { refreshPortfolioState } from '../state/portfolioViewState.js';
import { updatePortfolioUrlState } from './portfolioNavigation.js';
import { buildPortfolioCalendarViewModel } from '../selectors/portfolioViews.js';

export const DEFAULT_PORTFOLIO_FILTERS = Object.freeze({
    search: '',
    archive: 'active',
    blocked: 'all',
    assignee: '',
    priority: '',
    effort: ''
});

const noop = () => {};

function normalizeFilterValue(name, value) {
    if (name === 'search') return String(value ?? '');
    if (name === 'archive') return ['active', 'all', 'archived'].includes(value) ? value : 'active';
    if (name === 'blocked') return normalizePortfolioBlockedFilter(value);
    if (name === 'assignee') return normalizeAssignee(value);
    if (name === 'priority') return ['', 'high', 'medium', 'low'].includes(value) ? value : '';
    if (name === 'effort') return ['', ...EFFORT_BUCKETS].includes(value) ? value : '';
    return undefined;
}

/**
 * Create the actions that control the portfolio shell.
 *
 * Browser-facing collaborators remain injectable for isolated consumers. The
 * application uses the store-owned derived-state transition by default.
 */
export function createPortfolioControlActions({
    store = useAppStore,
    notify = store === useAppStore ? notifyAppStateChanged : noop,
    updateUrlState = null,
    primeProjectFiles = primeProjectFileBaselines,
    closePortfolioContextsForProject = defaultClosePortfolioContextsForProject,
    clearPortfolioTimelineSelection = defaultClearPortfolioTimelineSelection,
    openCreateSprintModal = (boardId) => defaultOpenRoadmapEntityModal('sprints', '', { mode: 'create-sprint-from-selection', boardId }),
    openAssignSprintModal = (boardId) => defaultOpenRoadmapEntityModal('sprints', '', { mode: 'assign-sprint-from-selection', boardId }),
    retrySave = retryProjectSave
} = {}) {
    const getState = () => store.getState();
    const syncUrlState = typeof updateUrlState === 'function'
        ? updateUrlState
        : () => updatePortfolioUrlState(undefined, getState());

    function refreshViews() {
        refreshPortfolioState({ store, notify });
    }

    function commitState(partial) {
        store.setState(partial);
        notify();
    }

    function clearBulkSelectionState(boardId = '') {
        const state = getState();
        const nextSelection = { ...(state.portfolioBulkSelectionByBoardId || {}) };
        if (boardId) {
            delete nextSelection[boardId];
        } else {
            Object.keys(nextSelection).forEach((key) => delete nextSelection[key]);
        }
        commitState({ portfolioBulkSelectionByBoardId: nextSelection });
    }

    function clearPortfolioBulkSelection(boardId = '') {
        clearBulkSelectionState(boardId);
        refreshViews();
    }

    function setSelectedPortfolioBoardId(boardId, options = {}) {
        const state = getState();
        const nextBoardId = boardId || '';
        const partial = { selectedPortfolioBoardId: nextBoardId };
        if (nextBoardId !== state.selectedPortfolioBoardId) {
            partial.portfolioBulkSelectionByBoardId = {};
        }
        if (options.resetViewModeWhenEmpty !== false && !nextBoardId) {
            partial.selectedPortfolioViewMode = 'board';
        }
        commitState(partial);
        refreshPortfolioState({ store, notify });
    }

    function appendPortfolioRecords(records, options = {}) {
        const list = Array.isArray(records) ? records.filter(Boolean) : [];
        if (list.length === 0) return;

        const state = getState();
        const portfolioBoards = [...state.portfolioBoards, ...list].sort((a, b) => {
            const aLabel = String(a.title || a.fileName || '').toLowerCase();
            const bLabel = String(b.title || b.fileName || '').toLowerCase();
            return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
        });
        let selectedPortfolioBoardId = state.selectedPortfolioBoardId;
        if (typeof options.selectBoardId === 'string') {
            selectedPortfolioBoardId = options.selectBoardId;
        }
        if (
            selectedPortfolioBoardId
            && !portfolioBoards.some((board) => board.id === selectedPortfolioBoardId)
        ) {
            selectedPortfolioBoardId = '';
        }

        const partial = { portfolioBoards };
        if (selectedPortfolioBoardId !== state.selectedPortfolioBoardId) {
            partial.selectedPortfolioBoardId = selectedPortfolioBoardId;
            partial.portfolioBulkSelectionByBoardId = {};
        }
        commitState(partial);
        syncProjectSaveStates(store);
        refreshViews();
        void primeProjectFiles(list);
    }

    function selectPortfolioBoard(boardId) {
        const state = getState();
        if ((boardId || '') !== state.selectedPortfolioBoardId) {
            clearPortfolioTimelineSelection();
        }
        setSelectedPortfolioBoardId(boardId, {
            resetViewModeWhenEmpty: !(!boardId && state.selectedPortfolioViewMode === 'calendar')
        });
        refreshViews();
        syncUrlState();
    }

    function removePortfolioBoard(boardId) {
        const state = getState();
        if (!state.portfolioBoards.some((board) => board.id === boardId)) return;

        closePortfolioContextsForProject(boardId);
        const timelineSelection = state.portfolioTimelineSelection || {};
        if (timelineSelection.boardId === boardId) {
            clearPortfolioTimelineSelection();
        }

        const portfolioBulkSelectionByBoardId = { ...(state.portfolioBulkSelectionByBoardId || {}) };
        delete portfolioBulkSelectionByBoardId[boardId];
        const projectSaveStateById = new Map(state.projectSaveStateById || []);
        const projectFileStateById = new Map(state.projectFileStateById || []);
        projectSaveStateById.delete(boardId);
        projectFileStateById.delete(boardId);

        const partial = {
            portfolioBoards: state.portfolioBoards.filter((board) => board.id !== boardId),
            portfolioBulkSelectionByBoardId,
            projectSaveStateById,
            projectFileStateById
        };
        if (state.selectedPortfolioCardRef?.boardId === boardId) {
            partial.selectedPortfolioCardRef = null;
        }
        if (state.hoveredPortfolioCardRef?.boardId === boardId) {
            partial.hoveredPortfolioCardRef = null;
        }
        if (state.selectedPortfolioBoardId === boardId) {
            partial.selectedPortfolioBoardId = '';
        }
        if (timelineSelection.boardId === boardId) {
            partial.portfolioTimelineSelection = { boardId: '', eventIndex: null };
        }

        commitState(partial);
        refreshViews();
    }

    function setPortfolioFilter(name, value) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_PORTFOLIO_FILTERS, name)) return;
        const next = { ...DEFAULT_PORTFOLIO_FILTERS, ...(getState().portfolioFilters || {}) };
        next[name] = normalizeFilterValue(name, value);
        commitState({ portfolioFilters: next });
        refreshViews();
        syncUrlState();
    }

    function setPortfolioSort(value) {
        const state = getState();
        const nextKey = value === 'name' ? 'task' : normalizePortfolioSortKey(value);
        if (nextKey === state.portfolioSortKey && state.portfolioSortDir === 'asc') return;
        commitState({ portfolioSortKey: nextKey, portfolioSortDir: 'asc' });
        refreshViews();
        syncUrlState();
    }

    function canUsePortfolioViewMode(mode) {
        const state = getState();
        const normalized = normalizePortfolioViewMode(mode);
        if (normalized === 'calendar') return state.portfolioBoards.length > 0;
        if (normalized === 'roadmap') return Boolean(state.selectedPortfolioBoardId);
        return state.portfolioBoards.length > 0;
    }

    function setPortfolioViewMode(mode) {
        const state = getState();
        const nextMode = normalizePortfolioViewMode(mode);
        if (!canUsePortfolioViewMode(nextMode) || nextMode === state.selectedPortfolioViewMode) return;
        commitState({ selectedPortfolioViewMode: nextMode });
        refreshViews();
        syncUrlState();
    }

    function resetPortfolioFilters() {
        commitState({
            portfolioFilters: { ...DEFAULT_PORTFOLIO_FILTERS },
            portfolioSortKey: 'priority',
            portfolioSortDir: 'asc'
        });
        refreshViews();
        syncUrlState();
    }

    function getSelectedPortfolioBulkTaskIds(boardId = getState().selectedPortfolioBoardId) {
        const state = getState();
        const board = state.portfolioBoards.find((record) => record.id === boardId);
        if (!board) return [];
        const taskIds = new Set((board.data?.board?.tasks || []).map((task) => Number(task.id)));
        return (state.portfolioBulkSelectionByBoardId?.[boardId] || [])
            .filter((taskId) => taskIds.has(Number(taskId)));
    }

    function openCreateSprintFromSelection(boardId = getState().selectedPortfolioBoardId) {
        if (!boardId || getSelectedPortfolioBulkTaskIds(boardId).length === 0) return;
        return openCreateSprintModal(boardId);
    }

    function openAssignSprintFromSelection(boardId = getState().selectedPortfolioBoardId) {
        if (!boardId || getSelectedPortfolioBulkTaskIds(boardId).length === 0) return;
        const board = getState().portfolioBoards.find((record) => record.id === boardId);
        const sprints = getRoadmapExtension(board?.data)?.sprints;
        if (!Array.isArray(sprints) || sprints.length === 0) return;
        return openAssignSprintModal(boardId);
    }

    function retryPortfolioSave(boardId) {
        return retrySave(boardId);
    }

    function setPortfolioCalendarPeriod(year, month) {
        commitState({
            portfolioCalendarYear: Number(year),
            portfolioCalendarMonth: Number(month),
            portfolioCalendarView: 'month'
        });
        refreshViews();
    }

    function setPortfolioCalendarView(view) {
        if (!['year', 'month'].includes(view)) return;
        commitState({ portfolioCalendarView: view });
        refreshViews();
    }

    function togglePortfolioCalendarDisplayMode() {
        commitState({
            portfolioCalendarDisplayMode: getState().portfolioCalendarDisplayMode === 'heatmap'
                ? 'calendar'
                : 'heatmap'
        });
        refreshViews();
    }

    function shiftPortfolioCalendarMonth(step) {
        const state = getState();
        const currentYear = Number.isInteger(state.portfolioCalendarYear)
            ? state.portfolioCalendarYear
            : new Date().getUTCFullYear();
        const currentMonth = Number.isInteger(state.portfolioCalendarMonth)
            ? state.portfolioCalendarMonth
            : new Date().getUTCMonth();
        const next = new Date(Date.UTC(currentYear, currentMonth + Number(step || 0), 1));
        setPortfolioCalendarPeriod(next.getUTCFullYear(), next.getUTCMonth());
    }

    function shiftPortfolioCalendarYear(step) {
        const model = buildPortfolioCalendarViewModel(getState());
        commitState({ portfolioCalendarYear: model.year + Number(step || 0) });
        refreshViews();
    }

    return {
        appendPortfolioRecords,
        canUsePortfolioViewMode,
        clearPortfolioBulkSelection,
        getSelectedPortfolioBulkTaskIds,
        openAssignSprintFromSelection,
        openCreateSprintFromSelection,
        removePortfolioBoard,
        resetPortfolioFilters,
        retryPortfolioSave,
        selectPortfolioBoard,
        setPortfolioCalendarPeriod,
        setPortfolioCalendarView,
        setPortfolioFilter,
        setPortfolioSort,
        setPortfolioViewMode,
        setSelectedPortfolioBoardId,
        shiftPortfolioCalendarMonth,
        shiftPortfolioCalendarYear,
        togglePortfolioCalendarDisplayMode
    };
}

const activeActions = createPortfolioControlActions();

export const appendPortfolioRecords = (...args) => activeActions.appendPortfolioRecords(...args);
export const canUsePortfolioViewMode = (...args) => activeActions.canUsePortfolioViewMode(...args);
export const clearPortfolioBulkSelection = (...args) => activeActions.clearPortfolioBulkSelection(...args);
export const getSelectedPortfolioBulkTaskIds = (...args) => activeActions.getSelectedPortfolioBulkTaskIds(...args);
export const openAssignSprintFromSelection = (...args) => activeActions.openAssignSprintFromSelection(...args);
export const openCreateSprintFromSelection = (...args) => activeActions.openCreateSprintFromSelection(...args);
export const removePortfolioBoard = (...args) => activeActions.removePortfolioBoard(...args);
export const resetPortfolioFilters = (...args) => activeActions.resetPortfolioFilters(...args);
export const retryPortfolioSave = (...args) => activeActions.retryPortfolioSave(...args);
export const selectPortfolioBoard = (...args) => activeActions.selectPortfolioBoard(...args);
export const setPortfolioCalendarPeriod = (...args) => activeActions.setPortfolioCalendarPeriod(...args);
export const setPortfolioCalendarView = (...args) => activeActions.setPortfolioCalendarView(...args);
export const setPortfolioFilter = (...args) => activeActions.setPortfolioFilter(...args);
export const setPortfolioSort = (...args) => activeActions.setPortfolioSort(...args);
export const setPortfolioViewMode = (...args) => activeActions.setPortfolioViewMode(...args);
export const setSelectedPortfolioBoardId = (...args) => activeActions.setSelectedPortfolioBoardId(...args);
export const shiftPortfolioCalendarMonth = (...args) => activeActions.shiftPortfolioCalendarMonth(...args);
export const shiftPortfolioCalendarYear = (...args) => activeActions.shiftPortfolioCalendarYear(...args);
export const togglePortfolioCalendarDisplayMode = (...args) => activeActions.togglePortfolioCalendarDisplayMode(...args);
