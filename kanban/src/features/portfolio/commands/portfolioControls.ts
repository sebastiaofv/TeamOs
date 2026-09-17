// Store-backed portfolio controls and project-session actions.
//
// The module owns the state transitions behind toolbar filters, project chips,
// bulk controls, board selection, and calendar navigation.

import type { BoardRecord, PortfolioFilters } from '@/features/portfolio/types';
import { normalizePortfolioSortKey, normalizePortfolioViewMode } from '@/domain/board';
import { DEFAULT_PORTFOLIO_FILTERS, normalizePortfolioFilterValue, type PortfolioFilterName } from '@/domain/portfolioFilters';
import { getRoadmapExtension } from '@/domain/roadmap';
import {
    clearPortfolioTimelineSelection as defaultClearPortfolioTimelineSelection,
    openRoadmapEntityModal as defaultOpenRoadmapEntityModal
} from './portfolioCommands';
import { closePortfolioContextsForProject as defaultClosePortfolioContextsForProject } from '@/app/overlays/dialogs';
import {
    forgetProjectFileState,
    retryProjectSave,
    syncProjectSaveStates
} from '@/infrastructure/persistence/projectFiles';
import { primeProjectFileBaselines } from '@/infrastructure/persistence/projectFileWatcher';
import { useAppStore, type AppState, type AppStore } from '@/features/portfolio/state/store';
import { updatePortfolioUrlState } from './portfolioNavigation';
import { buildPortfolioCalendarViewModel, getPortfolioBulkTaskIds } from '@/features/portfolio/queries';

export type PortfolioControlOptions = {
    store?: AppStore;
    updateUrlState?: (() => void) | null;
    primeProjectFiles?: (records: BoardRecord[]) => unknown;
    closePortfolioContextsForProject?: (boardId: string) => void;
    clearPortfolioTimelineSelection?: () => void;
    openCreateSprintModal?: (boardId: string) => unknown;
    openAssignSprintModal?: (boardId: string) => unknown;
    retrySave?: (boardId: string) => boolean;
    forgetFileState?: (boardId: string) => void;
};

function assignFilter<K extends PortfolioFilterName>(filters: PortfolioFilters, name: K, value: unknown) {
    filters[name] = normalizePortfolioFilterValue(name, value);
}

/**
 * Create the actions that control the portfolio shell.
 *
 * Browser-facing collaborators remain injectable for isolated consumers. The
 * application uses the store-owned derived-state transition by default.
 */
export function createPortfolioControlActions({
    store = useAppStore,
    updateUrlState = null,
    primeProjectFiles = primeProjectFileBaselines,
    closePortfolioContextsForProject = defaultClosePortfolioContextsForProject,
    clearPortfolioTimelineSelection = defaultClearPortfolioTimelineSelection,
    openCreateSprintModal = (boardId) => defaultOpenRoadmapEntityModal('sprints', '', { mode: 'create-sprint-from-selection', boardId }),
    openAssignSprintModal = (boardId) => defaultOpenRoadmapEntityModal('sprints', '', { mode: 'assign-sprint-from-selection', boardId }),
    retrySave = retryProjectSave,
    forgetFileState = forgetProjectFileState
}: PortfolioControlOptions = {}) {
    const getState = () => store.getState();
    const syncUrlState = typeof updateUrlState === 'function'
        ? updateUrlState
        : () => updatePortfolioUrlState(undefined, getState());

    function commitState(partial: Partial<AppState>) {
        store.setState(partial);
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
    }

    function setSelectedPortfolioBoardId(boardId: string | null | undefined, options: { resetViewModeWhenEmpty?: boolean } = {}) {
        const state = getState();
        const nextBoardId = boardId || '';
        const partial: Partial<AppState> = { selectedPortfolioBoardId: nextBoardId };
        if (nextBoardId !== state.selectedPortfolioBoardId) {
            partial.portfolioBulkSelectionByBoardId = {};
        }
        if (options.resetViewModeWhenEmpty !== false && !nextBoardId) {
            partial.selectedPortfolioViewMode = 'board';
        }
        commitState(partial);
    }

    function appendPortfolioRecords(records: readonly (BoardRecord | null | undefined)[] | null | undefined, options: { selectBoardId?: string } = {}) {
        const list = Array.isArray(records) ? records.filter((record): record is BoardRecord => Boolean(record)) : [];
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

        const partial: Partial<AppState> = { portfolioBoards };
        if (selectedPortfolioBoardId !== state.selectedPortfolioBoardId) {
            partial.selectedPortfolioBoardId = selectedPortfolioBoardId;
            partial.portfolioBulkSelectionByBoardId = {};
        }
        commitState(partial);
        syncProjectSaveStates(store);

        void primeProjectFiles(list);
    }

    function selectPortfolioBoard(boardId: string) {
        const state = getState();
        if ((boardId || '') !== state.selectedPortfolioBoardId) {
            clearPortfolioTimelineSelection();
        }
        setSelectedPortfolioBoardId(boardId, {
            resetViewModeWhenEmpty: !(!boardId && state.selectedPortfolioViewMode === 'calendar')
        });

        syncUrlState();
    }

    function removePortfolioBoard(boardId: string) {
        const state = getState();
        if (!state.portfolioBoards.some((board) => board.id === boardId)) return;

        closePortfolioContextsForProject(boardId);
        const timelineSelection: Partial<AppState['portfolioTimelineSelection']> = state.portfolioTimelineSelection || {};
        if (timelineSelection.boardId === boardId) {
            clearPortfolioTimelineSelection();
        }

        const portfolioBulkSelectionByBoardId = { ...(state.portfolioBulkSelectionByBoardId || {}) };
        delete portfolioBulkSelectionByBoardId[boardId];
        const projectSaveStateById = new Map(state.projectSaveStateById || []);
        projectSaveStateById.delete(boardId);
        forgetFileState(boardId);

        const partial: Partial<AppState> = {
            portfolioBoards: state.portfolioBoards.filter((board) => board.id !== boardId),
            portfolioBulkSelectionByBoardId,
            projectSaveStateById
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
    }

    function setPortfolioFilter(name: string, value: unknown) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_PORTFOLIO_FILTERS, name)) return;
        const next = { ...DEFAULT_PORTFOLIO_FILTERS, ...(getState().portfolioFilters || {}) };
        assignFilter(next, name as PortfolioFilterName, value);
        commitState({ portfolioFilters: next });

        syncUrlState();
    }

    function setPortfolioSort(value: unknown) {
        const state = getState();
        const nextKey = value === 'name' ? 'task' : normalizePortfolioSortKey(value);
        if (nextKey === state.portfolioSortKey && state.portfolioSortDir === 'asc') return;
        commitState({ portfolioSortKey: nextKey, portfolioSortDir: 'asc' });

        syncUrlState();
    }

    function canUsePortfolioViewMode(mode: unknown): boolean {
        const state = getState();
        const normalized = normalizePortfolioViewMode(mode);
        if (normalized === 'calendar') return state.portfolioBoards.length > 0;
        if (normalized === 'roadmap') return Boolean(state.selectedPortfolioBoardId);
        return state.portfolioBoards.length > 0;
    }

    function setPortfolioViewMode(mode: unknown) {
        const state = getState();
        const nextMode = normalizePortfolioViewMode(mode);
        if (!canUsePortfolioViewMode(nextMode) || nextMode === state.selectedPortfolioViewMode) return;
        commitState({ selectedPortfolioViewMode: nextMode });

        syncUrlState();
    }

    function resetPortfolioFilters() {
        commitState({
            portfolioFilters: { ...DEFAULT_PORTFOLIO_FILTERS },
            portfolioSortKey: 'priority',
            portfolioSortDir: 'asc'
        });

        syncUrlState();
    }

    function openCreateSprintFromSelection(boardId = getState().selectedPortfolioBoardId) {
        if (!boardId || getPortfolioBulkTaskIds(getState(), boardId).length === 0) return;
        return openCreateSprintModal(boardId);
    }

    function openAssignSprintFromSelection(boardId = getState().selectedPortfolioBoardId) {
        if (!boardId || getPortfolioBulkTaskIds(getState(), boardId).length === 0) return;
        const board = getState().portfolioBoards.find((record) => record.id === boardId);
        const sprints = getRoadmapExtension(board?.data)?.sprints;
        if (!Array.isArray(sprints) || sprints.length === 0) return;
        return openAssignSprintModal(boardId);
    }

    function retryPortfolioSave(boardId: string) {
        return retrySave(boardId);
    }

    function setPortfolioCalendarPeriod(year: unknown, month: unknown) {
        commitState({
            portfolioCalendarYear: Number(year),
            portfolioCalendarMonth: Number(month),
            portfolioCalendarView: 'month'
        });
    }

    function setPortfolioCalendarView(view: unknown) {
        if (view !== 'year' && view !== 'month') return;
        commitState({ portfolioCalendarView: view });
    }

    function togglePortfolioCalendarDisplayMode() {
        commitState({
            portfolioCalendarDisplayMode: getState().portfolioCalendarDisplayMode === 'heatmap'
                ? 'calendar'
                : 'heatmap'
        });
    }

    function shiftPortfolioCalendarMonth(step: unknown) {
        const state = getState();
        const currentYear = typeof state.portfolioCalendarYear === 'number' && Number.isInteger(state.portfolioCalendarYear)
            ? state.portfolioCalendarYear
            : new Date().getUTCFullYear();
        const currentMonth = typeof state.portfolioCalendarMonth === 'number' && Number.isInteger(state.portfolioCalendarMonth)
            ? state.portfolioCalendarMonth
            : new Date().getUTCMonth();
        const next = new Date(Date.UTC(currentYear, currentMonth + Number(step || 0), 1));
        setPortfolioCalendarPeriod(next.getUTCFullYear(), next.getUTCMonth());
    }

    function shiftPortfolioCalendarYear(step: unknown) {
        const model = buildPortfolioCalendarViewModel(getState());
        commitState({ portfolioCalendarYear: model.year + Number(step || 0) });
    }
    return {
        appendPortfolioRecords,
        canUsePortfolioViewMode,
        clearPortfolioBulkSelection,
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

type PortfolioControlActions = ReturnType<typeof createPortfolioControlActions>;

const activeActions = createPortfolioControlActions();

export const appendPortfolioRecords: PortfolioControlActions['appendPortfolioRecords'] = (...args) => activeActions.appendPortfolioRecords(...args);
export const canUsePortfolioViewMode: PortfolioControlActions['canUsePortfolioViewMode'] = (...args) => activeActions.canUsePortfolioViewMode(...args);
export const clearPortfolioBulkSelection: PortfolioControlActions['clearPortfolioBulkSelection'] = (...args) => activeActions.clearPortfolioBulkSelection(...args);
export const openAssignSprintFromSelection: PortfolioControlActions['openAssignSprintFromSelection'] = (...args) => activeActions.openAssignSprintFromSelection(...args);
export const openCreateSprintFromSelection: PortfolioControlActions['openCreateSprintFromSelection'] = (...args) => activeActions.openCreateSprintFromSelection(...args);
export const removePortfolioBoard: PortfolioControlActions['removePortfolioBoard'] = (...args) => activeActions.removePortfolioBoard(...args);
export const resetPortfolioFilters: PortfolioControlActions['resetPortfolioFilters'] = (...args) => activeActions.resetPortfolioFilters(...args);
export const retryPortfolioSave: PortfolioControlActions['retryPortfolioSave'] = (...args) => activeActions.retryPortfolioSave(...args);
export const selectPortfolioBoard: PortfolioControlActions['selectPortfolioBoard'] = (...args) => activeActions.selectPortfolioBoard(...args);
export const setPortfolioCalendarPeriod: PortfolioControlActions['setPortfolioCalendarPeriod'] = (...args) => activeActions.setPortfolioCalendarPeriod(...args);
export const setPortfolioCalendarView: PortfolioControlActions['setPortfolioCalendarView'] = (...args) => activeActions.setPortfolioCalendarView(...args);
export const setPortfolioFilter: PortfolioControlActions['setPortfolioFilter'] = (...args) => activeActions.setPortfolioFilter(...args);
export const setPortfolioSort: PortfolioControlActions['setPortfolioSort'] = (...args) => activeActions.setPortfolioSort(...args);
export const setPortfolioViewMode: PortfolioControlActions['setPortfolioViewMode'] = (...args) => activeActions.setPortfolioViewMode(...args);
export const setSelectedPortfolioBoardId: PortfolioControlActions['setSelectedPortfolioBoardId'] = (...args) => activeActions.setSelectedPortfolioBoardId(...args);
export const shiftPortfolioCalendarMonth: PortfolioControlActions['shiftPortfolioCalendarMonth'] = (...args) => activeActions.shiftPortfolioCalendarMonth(...args);
export const shiftPortfolioCalendarYear: PortfolioControlActions['shiftPortfolioCalendarYear'] = (...args) => activeActions.shiftPortfolioCalendarYear(...args);
export const togglePortfolioCalendarDisplayMode: PortfolioControlActions['togglePortfolioCalendarDisplayMode'] = (...args) => activeActions.togglePortfolioCalendarDisplayMode(...args);
