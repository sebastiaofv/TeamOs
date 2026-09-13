import { createPortal } from 'react-dom';
import { useLayoutEffect } from 'react';
import { useAppStore } from '../state/store.js';
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
} from '../actions/legacyHost.js';
import { getRoadmapExtension } from '../domain/roadmap.js';
import { getBoardTimelineData } from '../domain/timeline.js';
import { EFFORT_BUCKETS } from '../domain/constants.js';
import { normalizePortfolioViewMode, createPortfolioProjectColor } from '../domain/board.js';
import { portfolioSortSelectValueFromKey } from '../domain/util.js';
import { normalizeAssignee, taskAssignees } from '../domain/task.js';
import { getProjectSaveState, projectHasUnsavedChanges } from '../persistence/projectFiles.js';

const DEFAULT_PORTFOLIO_FILTERS = {
    search: '',
    archive: 'active',
    blocked: 'all',
    assignee: '',
    priority: '',
    effort: ''
};

function getFilters(state) {
    return { ...DEFAULT_PORTFOLIO_FILTERS, ...(state.portfolioFilters || {}) };
}

function getAssigneeNames(tasks) {
    const seen = new Set();
    const values = [];
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

function getChipSaveUiState(boardId) {
    const saveState = getProjectSaveState(boardId, { create: false });
    if (!saveState) return { status: 'idle', text: '', title: '', canRetry: false };
    if (saveState.status === 'error') {
        return {
            status: 'error',
            text: 'Save failed',
            title: saveState.lastErrorMessage || 'Save failed.',
            canRetry: true
        };
    }
    if (saveState.inFlight) {
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
    if (projectHasUnsavedChanges(boardId)) {
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

function getBoardColor(board) {
    return board?.projectColor || createPortfolioProjectColor(board?.colorSeed || 0);
}

function isHistoricalPreview(state, boardId) {
    const board = state.portfolioBoards.find((record) => record.id === boardId);
    const timeline = getBoardTimelineData(board?.data);
    if (!timeline || !Array.isArray(timeline.events) || timeline.events.length === 0) return false;
    const selection = state.portfolioTimelineSelection || {};
    const selectedIndex = selection.boardId === boardId && Number.isInteger(selection.eventIndex)
        ? Math.max(0, Math.min(timeline.events.length - 1, selection.eventIndex))
        : timeline.events.length - 1;
    return selectedIndex < timeline.events.length - 1;
}

function getBulkViewModel(state) {
    const boardId = state.selectedPortfolioBoardId || '';
    const board = state.portfolioBoards.find((record) => record.id === boardId) || null;
    const canShow = Boolean(boardId)
        && state.selectedPortfolioViewMode === 'board'
        && Boolean(board?.handle)
        && !isHistoricalPreview(state, boardId);
    const taskIds = new Set((board?.data?.board?.tasks || []).map((task) => Number(task.id)));
    const selectedIds = canShow
        ? (state.portfolioBulkSelectionByBoardId?.[boardId] || []).filter((taskId) => taskIds.has(Number(taskId)))
        : [];
    const roadmap = canShow ? getRoadmapExtension(board?.data) : null;
    return {
        boardId,
        selectedCount: selectedIds.length,
        showActions: canShow && selectedIds.length > 0,
        hasExistingSprints: Array.isArray(roadmap?.sprints) && roadmap.sprints.length > 0
    };
}

function PortfolioToolbar({ state }) {
    const filters = getFilters(state);
    const assignees = getAssigneeNames(state.portfolioTasks);
    const sortValue = portfolioSortSelectValueFromKey(state.portfolioSortKey);
    const hasBoards = state.portfolioBoards.length > 0;
    const hasSelectedBoard = Boolean(state.selectedPortfolioBoardId);
    const viewMode = normalizePortfolioViewMode(state.selectedPortfolioViewMode);

    return (
        <>
            <div className="portfolio-toolbar-left">
                <div className="search-box">
                    <input
                        type="text"
                        id="portfolioSearchInput"
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
                    <select id="portfolioSortSelect" value={sortValue} onChange={(event) => setPortfolioSort(event.target.value)}>
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

function PortfolioChips({ state }) {
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
        const saveUi = getChipSaveUiState(board.id);
                return (
                    <span
                        className={`portfolio-chip${state.selectedPortfolioBoardId === board.id ? ' active' : ''}`}
                        style={{ '--chip-bg': color.bg, '--chip-border': color.border, '--chip-text': color.text }}
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

function PortfolioBulkActions({ state }) {
    const { boardId, selectedCount, showActions, hasExistingSprints } = getBulkViewModel(state);

    useLayoutEffect(() => {
        const actions = document.getElementById('portfolioBulkActions');
        if (!actions) return undefined;
        actions.classList.toggle('active', showActions);
        return () => actions.classList.remove('active');
    }, [showActions]);

    return (
        <>
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
        </>
    );
}

export function PortfolioControls() {
    const state = useAppStore((current) => current);
    const toolbar = document.getElementById('portfolioToolbar');
    const chips = document.getElementById('portfolioBoardsChips');
    const bulkActions = document.getElementById('portfolioBulkActions');
    if (!toolbar || !chips || !bulkActions) return null;

    return (
        <>
            {createPortal(<PortfolioToolbar state={state} />, toolbar)}
            {createPortal(<PortfolioChips state={state} />, chips)}
            {createPortal(<PortfolioBulkActions state={state} />, bulkActions)}
        </>
    );
}
