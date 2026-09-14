import type { CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { BoardRecord, PortfolioFilters, PortfolioRow, ProjectSaveState } from '../types';
import { useAppStore, type AppState } from '../state/store';
import {
    clearPortfolioBulkSelection,
    openAssignSprintFromSelection,
    openCreateSprintFromSelection,
    removePortfolioBoard,
    resetPortfolioFilters,
    retryPortfolioSave,
    selectPortfolioBoard,
    setPortfolioFilter,
    setPortfolioSort,
    setPortfolioViewMode
} from '../actions/portfolioControls';
import { getRoadmapExtension } from '../domain/roadmap';
import { EFFORT_BUCKETS } from '../domain/constants';
import { normalizePortfolioViewMode, createPortfolioProjectColor } from '../domain/board';
import { DEFAULT_PORTFOLIO_FILTERS } from '../domain/portfolioFilters';
import { portfolioSortSelectValueFromKey } from '../domain/util';
import { normalizeAssignee, taskAssignees } from '../domain/task';
import { getPortfolioBulkTaskIds, isBoardInHistoricalPreview } from '../selectors/portfolioViews';
import { useFocusTarget } from '../hooks/useFocusTarget';

type ToolbarState = Pick<AppState,
    | 'portfolioBoards'
    | 'portfolioTasks'
    | 'portfolioFilters'
    | 'portfolioSortKey'
    | 'selectedPortfolioBoardId'
    | 'selectedPortfolioViewMode'
>;
type ChipState = Pick<AppState, 'portfolioBoards' | 'selectedPortfolioBoardId' | 'projectSaveStateById'>;
type BulkState = Pick<AppState,
    | 'portfolioBoards'
    | 'selectedPortfolioBoardId'
    | 'selectedPortfolioViewMode'
    | 'portfolioBulkSelectionByBoardId'
    | 'portfolioTimelineSelection'
>;

type ChipSaveUi = { status: string; text: string; title: string; canRetry: boolean };

function getFilters(state: Pick<AppState, 'portfolioFilters'>): PortfolioFilters {
    return { ...DEFAULT_PORTFOLIO_FILTERS, ...(state.portfolioFilters || {}) };
}

function getAssigneeNames(tasks: PortfolioRow[]): string[] {
    const seen = new Set<string>();
    const values: string[] = [];
    (Array.isArray(tasks) ? tasks : []).forEach((item) => {
        taskAssignees(item?.task).forEach((value) => {
            const name = normalizeAssignee(value);
            const key = name.toLowerCase();
            if (!name || seen.has(key)) return;
            seen.add(key);
            values.push(name);
        });
    });
    return values.sort((a, b) => a.localeCompare(b));
}

function getChipSaveUiState(saveState: ProjectSaveState | undefined): ChipSaveUi {
    if (!saveState) return { status: 'idle', text: '', title: '', canRetry: false };
    if (saveState.status === 'error') {
        return {
            status: 'error',
            text: 'Save failed',
            title: saveState.lastErrorMessage || 'Save failed.',
            canRetry: true
        };
    }
    if (saveState.status === 'saving') {
        return { status: 'saving', text: 'Saving', title: 'Saving changes…', canRetry: false };
    }
    if (saveState.watchStatus === 'conflict') {
        return {
            status: 'conflict',
            text: 'Conflict',
            title: saveState.watchMessage || 'External changes detected while local edits are unsaved.',
            canRetry: false
        };
    }
    if (saveState.revision > saveState.savedRevision) {
        return { status: 'dirty', text: 'Unsaved', title: 'Unsaved changes.', canRetry: false };
    }
    if (saveState.watchStatus === 'watch-error') {
        return {
            status: 'warning',
            text: 'Watch error',
            title: saveState.watchMessage || 'Could not read project file for external changes.',
            canRetry: false
        };
    }
    if (saveState.watchStatus === 'external') {
        if (saveState.watchStatusUntil && Date.now() > saveState.watchStatusUntil) {
            return { status: 'idle', text: '', title: '', canRetry: false };
        }
        return {
            status: 'external',
            text: 'External update',
            title: saveState.watchMessage || 'Project reloaded from disk.',
            canRetry: false
        };
    }
    return { status: 'idle', text: '', title: '', canRetry: false };
}

function getBoardColor(board: BoardRecord | null | undefined) {
    return board?.projectColor || createPortfolioProjectColor(board?.colorSeed || 0);
}

function getBulkViewModel(state: BulkState) {
    const boardId = state.selectedPortfolioBoardId || '';
    const board = state.portfolioBoards.find((record) => record.id === boardId) || null;
    const canShow = Boolean(boardId)
        && state.selectedPortfolioViewMode === 'board'
        && Boolean(board?.handle)
        && !isBoardInHistoricalPreview(state, boardId);
    const selectedIds = canShow ? getPortfolioBulkTaskIds(state, boardId) : [];
    const roadmap = canShow ? getRoadmapExtension(board?.data) : null;
    return {
        boardId,
        selectedCount: selectedIds.length,
        showActions: canShow && selectedIds.length > 0,
        hasExistingSprints: Array.isArray(roadmap?.sprints) && roadmap.sprints.length > 0
    };
}

function ToolbarContent({ state }: { state: ToolbarState }) {
    const filters = getFilters(state);
    const assignees = getAssigneeNames(state.portfolioTasks);
    const sortValue = portfolioSortSelectValueFromKey(state.portfolioSortKey);
    const hasBoards = state.portfolioBoards.length > 0;
    const hasSelectedBoard = Boolean(state.selectedPortfolioBoardId);
    const viewMode = normalizePortfolioViewMode(state.selectedPortfolioViewMode);
    const searchRef = useFocusTarget<HTMLInputElement>('portfolioSearch');
    const sortRef = useFocusTarget<HTMLSelectElement>('portfolioSort');

    return (
        <>
            <div className="portfolio-toolbar-left">
                <div className="search-box">
                    <input
                        type="text"
                        id="portfolioSearchInput"
                        ref={searchRef}
                        placeholder="Search tasks..."
                        value={filters.search}
                        onChange={(event) => setPortfolioFilter('search', event.target.value)}
                    />
                </div>
                <div className="filter-group">
                    <label>Archive:</label>
                    <select id="portfolioArchiveFilter" value={filters.archive} onChange={(event) => setPortfolioFilter('archive', event.target.value)}>
                        <option value="active">Active Only</option>
                        <option value="all">Active + Archived</option>
                        <option value="archived">Archived Only</option>
                    </select>
                </div>
                <div className="filter-group">
                    <label>Blocked:</label>
                    <select id="portfolioBlockedFilter" value={filters.blocked} onChange={(event) => setPortfolioFilter('blocked', event.target.value)}>
                        <option value="all">All</option>
                        <option value="blocked">Blocked Only</option>
                        <option value="unblocked">Unblocked Only</option>
                    </select>
                </div>
                <div className="filter-group">
                    <label>Assignee:</label>
                    <select id="portfolioAssigneeFilter" value={filters.assignee} onChange={(event) => setPortfolioFilter('assignee', event.target.value)}>
                        <option value="">All</option>
                        {assignees.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                </div>
                <div className="filter-group">
                    <label>Priority:</label>
                    <select id="portfolioPriorityFilter" value={filters.priority} onChange={(event) => setPortfolioFilter('priority', event.target.value)}>
                        <option value="">All</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                </div>
                <div className="filter-group">
                    <label>Effort:</label>
                    <select id="portfolioEffortFilter" value={filters.effort} onChange={(event) => setPortfolioFilter('effort', event.target.value)}>
                        <option value="">All</option>
                        {EFFORT_BUCKETS.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
                    </select>
                </div>
                <div className="filter-group">
                    <label>Sort:</label>
                    <select id="portfolioSortSelect" ref={sortRef} value={sortValue} onChange={(event) => setPortfolioSort(event.target.value)}>
                        <option value="name">Name</option>
                        <option value="priority">Priority</option>
                        <option value="effort">Effort</option>
                        <option value="score">Score</option>
                    </select>
                </div>
            </div>
            <div className="portfolio-toolbar-right">
                <div className={`portfolio-view-toggle${hasBoards ? '' : ' hidden'}`} id="portfolioViewModeToggle" aria-label="Selected project view mode">
                    <button
                        className={`btn${viewMode === 'board' ? ' active' : ''}`}
                        type="button"
                        data-view-mode="board"
                        aria-pressed={viewMode === 'board'}
                        onClick={() => setPortfolioViewMode('board')}
                    >Board</button>
                    <button
                        className={`btn${viewMode === 'roadmap' ? ' active' : ''}${hasSelectedBoard ? '' : ' hidden'}`}
                        type="button"
                        data-view-mode="roadmap"
                        aria-pressed={viewMode === 'roadmap'}
                        onClick={() => setPortfolioViewMode('roadmap')}
                    >Roadmap</button>
                    <button
                        className={`btn${viewMode === 'calendar' ? ' active' : ''}`}
                        type="button"
                        data-view-mode="calendar"
                        aria-pressed={viewMode === 'calendar'}
                        onClick={() => setPortfolioViewMode('calendar')}
                    >Calendar</button>
                </div>
                <button className="btn" id="resetPortfolioFiltersBtn" type="button" onClick={() => resetPortfolioFilters()}>Reset Filters</button>
            </div>
        </>
    );
}

function ChipList({ state }: { state: ChipState }) {
    if (state.portfolioBoards.length === 0) {
        return <span className="empty-state-text">No projects loaded</span>;
    }

    return (
        <>
            <span className={`portfolio-chip${state.selectedPortfolioBoardId ? '' : ' active'}`}>
                <button className="chip-link" type="button" data-action="select-board" data-board-id="" onClick={() => selectPortfolioBoard('')}>All</button>
            </span>
            {state.portfolioBoards.map((board) => {
                const color = getBoardColor(board);
                const saveUi = getChipSaveUiState(state.projectSaveStateById.get(board.id));
                return (
                    <span
                        className={`portfolio-chip${state.selectedPortfolioBoardId === board.id ? ' active' : ''}`}
                        style={{ '--chip-bg': color.bg, '--chip-border': color.border, '--chip-text': color.text } as CSSProperties}
                        key={board.id}
                    >
                        <button className="chip-link" type="button" data-action="select-board" data-board-id={board.id} onClick={() => selectPortfolioBoard(board.id)}>
                            {board.title || board.fileName}
                            {!board.handle && <span className="chip-readonly-label"> (Read-only)</span>}
                            {saveUi.text && <span className={`chip-save-state ${saveUi.status}`} title={saveUi.title}> • {saveUi.text}</span>}
                        </button>
                        {board.handle && saveUi.canRetry && (
                            <button className="chip-link" type="button" title="Retry save" data-action="retry-save" data-board-id={board.id} onClick={() => retryPortfolioSave(board.id)}>Retry</button>
                        )}
                        <button className="chip-link chip-link-danger" type="button" aria-label="Remove project" title="Remove project" data-action="remove-board" data-board-id={board.id} onClick={() => removePortfolioBoard(board.id)}>Remove</button>
                    </span>
                );
            })}
        </>
    );
}

export function PortfolioToolbar() {
    const state = useAppStore(useShallow((state) => ({
        portfolioBoards: state.portfolioBoards,
        portfolioTasks: state.portfolioTasks,
        portfolioFilters: state.portfolioFilters,
        portfolioSortKey: state.portfolioSortKey,
        selectedPortfolioBoardId: state.selectedPortfolioBoardId,
        selectedPortfolioViewMode: state.selectedPortfolioViewMode,
    })));
    return (
        <div className="portfolio-toolbar" id="portfolioToolbar">
            <ToolbarContent state={state} />
        </div>
    );
}

export function PortfolioChips() {
    const state = useAppStore(useShallow((state) => ({
        portfolioBoards: state.portfolioBoards,
        selectedPortfolioBoardId: state.selectedPortfolioBoardId,
        projectSaveStateById: state.projectSaveStateById,
    })));
    return (
        <div className="portfolio-chips" id="portfolioBoardsChips">
            <ChipList state={state} />
        </div>
    );
}

export function PortfolioBulkActions() {
    const state = useAppStore(useShallow((state) => ({
        portfolioBoards: state.portfolioBoards,
        selectedPortfolioBoardId: state.selectedPortfolioBoardId,
        selectedPortfolioViewMode: state.selectedPortfolioViewMode,
        portfolioBulkSelectionByBoardId: state.portfolioBulkSelectionByBoardId,
        portfolioTimelineSelection: state.portfolioTimelineSelection,
    })));
    const { boardId, selectedCount, showActions, hasExistingSprints } = getBulkViewModel(state);

    return (
        <div className={`portfolio-bulk-actions${showActions ? ' active' : ''}`} id="portfolioBulkActions">
            <div className="portfolio-bulk-actions-summary" id="portfolioBulkActionsSummary">
                {selectedCount} {selectedCount === 1 ? 'task' : 'tasks'} selected
            </div>
            <div className="portfolio-bulk-actions-buttons">
                <button className="btn" type="button" id="portfolioBulkClearBtn" onClick={() => clearPortfolioBulkSelection(boardId)}>Clear</button>
                <button
                    className={`btn${showActions && hasExistingSprints ? '' : ' hidden'}`}
                    type="button"
                    id="portfolioBulkAssignSprintBtn"
                    disabled={selectedCount === 0 || !hasExistingSprints}
                    onClick={() => openAssignSprintFromSelection(boardId)}
                >Add to Existing Sprint</button>
                <button
                    className="btn btn-primary"
                    type="button"
                    id="portfolioBulkCreateSprintBtn"
                    disabled={selectedCount === 0}
                    onClick={() => openCreateSprintFromSelection(boardId)}
                >Create Sprint</button>
            </div>
        </div>
    );
}
