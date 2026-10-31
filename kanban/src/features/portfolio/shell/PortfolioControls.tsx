import type { CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { BoardRecord, PortfolioFilters, ProjectSaveState } from '@/features/portfolio/types';
import { useAppStore, type AppState } from '@/features/portfolio/state/store';
import {
    clearPortfolioBulkSelection,
    openAssignSprintFromSelection,
    openCreateSprintFromSelection,
    removePortfolioBoard,
    retryPortfolioSave,
    selectPortfolioBoard,
    setPortfolioFilter,
    setPortfolioSort,
    setPortfolioViewMode
} from '@/features/portfolio/commands/portfolioControls';
import { getRoadmapExtension } from '@/domain/roadmap';
import { normalizePortfolioViewMode, createPortfolioProjectColor, portfolioSortSelectValueFromKey } from '@/domain/board';
import { DEFAULT_PORTFOLIO_FILTERS } from '@/domain/portfolioFilters';
import { getPortfolioBulkTaskIds, isBoardInHistoricalPreview } from '@/features/portfolio/queries';
import { useFocusTarget } from '@/shared/hooks/useFocusTarget';
import { useI18n } from '@/shared/i18n';
import { PortfolioActiveFilters, PortfolioToolbarFilters } from './PortfolioFilters';
import { PALETTE_SHORTCUT_LABEL, openCommandPalette } from '@/features/portfolio/palette/openCommandPalette';
import { setTableFilter, setTableSort } from '@/features/portfolio/table/tableControls';
import { DEFAULT_TABLE_SORT } from '@/features/portfolio/table/tableModel';
import { COLUMN_LABELS } from '@/features/portfolio/table/tableLabels';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';

type ToolbarState = Pick<AppState,
    | 'portfolioBoards'
    | 'portfolioTasks'
    | 'portfolioFilters'
    | 'portfolioTableSortByBoardId'
    | 'portfolioSortKey'
    | 'selectedPortfolioBoardId'
    | 'selectedPortfolioViewMode'
    | 'portfolioVisibleRows'
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
type Translate = ReturnType<typeof useI18n>['t'];

function getFilters(state: Pick<AppState, 'portfolioFilters'>): PortfolioFilters {
    return { ...DEFAULT_PORTFOLIO_FILTERS, ...(state.portfolioFilters || {}) };
}

function getChipSaveUiState(saveState: ProjectSaveState | undefined, t: Translate): ChipSaveUi {
    if (!saveState) return { status: 'idle', text: '', title: '', canRetry: false };
    if (saveState.status === 'error') {
        return {
            status: 'error',
            text: t('toolbar.saveFailed'),
            title: saveState.lastErrorMessage || t('toolbar.saveFailedPeriod'),
            canRetry: true
        };
    }
    if (saveState.status === 'saving') {
        return { status: 'saving', text: t('toolbar.saving'), title: t('toolbar.savingChanges'), canRetry: false };
    }
    if (saveState.watchStatus === 'conflict') {
        return {
            status: 'conflict',
            text: t('toolbar.conflict'),
            title: saveState.watchMessage || t('toolbar.externalChanges'),
            canRetry: false
        };
    }
    if (saveState.revision > saveState.savedRevision) {
        return { status: 'dirty', text: t('toolbar.unsaved'), title: t('toolbar.unsavedChanges'), canRetry: false };
    }
    if (saveState.watchStatus === 'watch-error') {
        return {
            status: 'warning',
            text: t('toolbar.watchError'),
            title: saveState.watchMessage || t('toolbar.watchErrorDescription'),
            canRetry: false
        };
    }
    if (saveState.watchStatus === 'external') {
        if (saveState.watchStatusUntil && Date.now() > saveState.watchStatusUntil) {
            return { status: 'idle', text: '', title: '', canRetry: false };
        }
        return {
            status: 'external',
            text: t('toolbar.externalUpdate'),
            title: saveState.watchMessage || t('toolbar.projectReloaded'),
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
    const { t } = useI18n();
    const filters = getFilters(state);
    const hasBoards = state.portfolioBoards.length > 0;
    const hasSelectedBoard = Boolean(state.selectedPortfolioBoardId);
    const viewMode = normalizePortfolioViewMode(state.selectedPortfolioViewMode);
    const tableSort = state.portfolioTableSortByBoardId[state.selectedPortfolioBoardId] || DEFAULT_TABLE_SORT;
    const tableSortValue = tableSort.column === 'title' ? 'name'
        : ['priority', 'effort', 'score'].includes(tableSort.column) ? tableSort.column : 'custom';
    const sortValue = viewMode === 'table' ? tableSortValue : portfolioSortSelectValueFromKey(state.portfolioSortKey);
    const sortRef = useFocusTarget<HTMLSelectElement>('portfolioSort');
    const search = filters.search;

    return (
        <>
            <div className={`portfolio-toolbar-left${viewMode === 'dashboard' ? ' hidden' : ''}`}>
                <div className="search-box palette-search">
                    <button
                        className={`palette-search-btn${search ? ' has-value' : ''}`}
                        id="portfolioSearchBtn"
                        type="button"
                        aria-haspopup="dialog"
                        aria-label={search ? `${t('palette.openButton')}: ${search}` : t('palette.openButton')}
                        onClick={() => openCommandPalette()}
                    >
                        <svg className="palette-search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                            <circle cx="7" cy="7" r="4.5" />
                            <path d="M10.5 10.5 14 14" />
                        </svg>
                        <span className="palette-search-text">{search || t('toolbar.searchTasks')}</span>
                        {!search && <kbd className="palette-search-kbd">{PALETTE_SHORTCUT_LABEL}</kbd>}
                    </button>
                    {search && (
                        <button
                            className="palette-search-clear"
                            id="portfolioSearchClearBtn"
                            type="button"
                            aria-label={viewMode === 'table' ? t('palette.cmdClearTableSearch', { query: search }) : t('palette.clearSearch')}
                            title={viewMode === 'table' ? t('palette.cmdClearTableSearch', { query: search }) : t('palette.clearSearch')}
                            onClick={() => viewMode === 'table' ? setTableFilter('search', '') : setPortfolioFilter('search', '')}
                        >×</button>
                    )}
                </div>
                {viewMode !== 'dashboard' && <PortfolioToolbarFilters />}
                <div className="filter-group">
                    <label htmlFor="portfolioSortSelect">{t('toolbar.sort')}</label>
                    <select id="portfolioSortSelect" ref={sortRef} value={sortValue} onChange={(event) => {
                        const value = event.target.value;
                        if (viewMode !== 'table') setPortfolioSort(value);
                        else if (value === 'name') setTableSort('title');
                        else if (value === 'priority' || value === 'effort' || value === 'score') setTableSort(value);
                    }}>
                        {viewMode === 'table' && tableSortValue === 'custom' && <option value="custom">{tableSort.column === 'score' ? t('toolbar.score') : t(COLUMN_LABELS[tableSort.column])}</option>}
                        <option value="name">{t('toolbar.name')}</option>
                        <option value="priority">{t('toolbar.priority').replace(':', '')}</option>
                        <option value="effort">{t('toolbar.effort').replace(':', '')}</option>
                        <option value="score">{t('toolbar.score')}</option>
                    </select>
                </div>
            </div>
            <div className="portfolio-toolbar-right">
                <div className={`portfolio-view-toggle${hasBoards ? '' : ' hidden'}`} id="portfolioViewModeToggle" role="group" aria-label={t('toolbar.selectedProjectViewMode')}>
                    <button
                        className={`btn${viewMode === 'board' ? ' active' : ''}`}
                        type="button"
                        data-view-mode="board"
                        aria-pressed={viewMode === 'board'}
                        onClick={() => setPortfolioViewMode('board')}
                    >{t('toolbar.board')}</button>
                    <button className={`btn${viewMode === 'dashboard' ? ' active' : ''}${hasSelectedBoard ? '' : ' hidden'}`} type="button"
                        data-view-mode="dashboard" aria-pressed={viewMode === 'dashboard'} onClick={() => setPortfolioViewMode('dashboard')}>{t('dashboard.title')}</button>
                    <button
                        className={`btn${viewMode === 'table' ? ' active' : ''}${hasSelectedBoard ? '' : ' hidden'}`}
                        type="button"
                        data-view-mode="table"
                        aria-pressed={viewMode === 'table'}
                        onClick={() => setPortfolioViewMode('table')}
                    >{t('table.view')}</button>
                    <button
                        className={`btn${viewMode === 'roadmap' ? ' active' : ''}${hasSelectedBoard ? '' : ' hidden'}`}
                        type="button"
                        data-view-mode="roadmap"
                        aria-pressed={viewMode === 'roadmap'}
                        onClick={() => setPortfolioViewMode('roadmap')}
                    >{t('toolbar.roadmap')}</button>
                    <button
                        className={`btn${viewMode === 'calendar' ? ' active' : ''}`}
                        type="button"
                        data-view-mode="calendar"
                        aria-pressed={viewMode === 'calendar'}
                        onClick={() => setPortfolioViewMode('calendar')}
                    >{t('toolbar.calendar')}</button>
                    <button
                        className={`btn${viewMode === 'planner' ? ' active' : ''}`}
                        type="button"
                        data-view-mode="planner"
                        aria-pressed={viewMode === 'planner'}
                        onClick={() => setPortfolioViewMode('planner')}
                    >{t('toolbar.planner')}</button>
                </div>
            </div>
        </>
    );
}

function ChipList({ state }: { state: ChipState }) {
    const { t } = useI18n();
    const { openProjectSettings } = usePortfolioActions();
    if (state.portfolioBoards.length === 0) {
        return <span className="empty-state-text">{t('toolbar.noProjectsLoaded')}</span>;
    }

    return (
        <>
            <span className={`portfolio-chip${state.selectedPortfolioBoardId ? '' : ' active'}`}>
                <button className="chip-link" type="button" data-action="select-board" data-board-id="" aria-pressed={!state.selectedPortfolioBoardId} onClick={() => selectPortfolioBoard('')}>{t('common.all')}</button>
            </span>
            {state.portfolioBoards.map((board) => {
                const color = getBoardColor(board);
                const saveUi = getChipSaveUiState(state.projectSaveStateById.get(board.id), t);
                return (
                    <span
                        className={`portfolio-chip${state.selectedPortfolioBoardId === board.id ? ' active' : ''}`}
                        style={{ '--chip-bg': color.bg, '--chip-border': color.border, '--chip-text': color.text } as CSSProperties}
                        key={board.id}
                    >
                        <button className="chip-link" type="button" data-action="select-board" data-board-id={board.id} aria-pressed={state.selectedPortfolioBoardId === board.id} onClick={() => selectPortfolioBoard(board.id)}>
                            {board.title || board.fileName}
                            {!board.handle && <span className="chip-readonly-label"> ({t('toolbar.readOnly')})</span>}
                            {saveUi.text && <span className={`chip-save-state ${saveUi.status}`} title={saveUi.title}> • {saveUi.text}</span>}
                        </button>
                        <button className="chip-link chip-settings" type="button" data-action="project-settings" data-board-id={board.id}
                            aria-label={t('project.settingsFor', { name: board.title || board.fileName })} title={t('project.settings')}
                            aria-haspopup="dialog" onClick={() => openProjectSettings(board.id)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h6m0 0h10M4 12h12m0 0h4M4 18h4m0 0h12M10 3v6m6 0v6M8 15v6" />
                            </svg>
                        </button>
                        {board.handle && saveUi.canRetry && (
                            <button className="chip-link" type="button" title={t('toolbar.retrySave')} data-action="retry-save" data-board-id={board.id} onClick={() => retryPortfolioSave(board.id)}>{t('common.retry')}</button>
                        )}
                        <button className="chip-link chip-link-danger" type="button" aria-label={t('toolbar.removeProject')} title={t('toolbar.removeProject')} data-action="remove-board" data-board-id={board.id} onClick={() => removePortfolioBoard(board.id)}>{t('common.remove')}</button>
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
        portfolioTableSortByBoardId: state.portfolioTableSortByBoardId,
        portfolioSortKey: state.portfolioSortKey,
        selectedPortfolioBoardId: state.selectedPortfolioBoardId,
        selectedPortfolioViewMode: state.selectedPortfolioViewMode,
        portfolioVisibleRows: state.portfolioVisibleRows,
    })));
    const { t } = useI18n();
    return (
        <>
            <section className="portfolio-toolbar" id="portfolioToolbar" aria-labelledby="portfolioToolbarTitle">
                <h2 className="sr-only" id="portfolioToolbarTitle">{t('toolbar.filters')}</h2>
                <ToolbarContent state={state} />
                <span className={`sr-only${state.selectedPortfolioViewMode === 'table' ? ' hidden' : ''}`} role="status" aria-live="polite" aria-atomic="true">
                    {t('toolbar.resultsCount', { count: Array.isArray(state.portfolioVisibleRows) ? state.portfolioVisibleRows.length : 0 })}
                </span>
            </section>
            {state.selectedPortfolioViewMode !== 'dashboard' && <PortfolioActiveFilters />}
        </>
    );
}

export function PortfolioChips() {
    const state = useAppStore(useShallow((state) => ({
        portfolioBoards: state.portfolioBoards,
        selectedPortfolioBoardId: state.selectedPortfolioBoardId,
        projectSaveStateById: state.projectSaveStateById,
    })));
    const { t } = useI18n();
    return (
        <nav className="portfolio-chips" id="portfolioBoardsChips" aria-label={t('toolbar.projectSelection')}>
            <ChipList state={state} />
        </nav>
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
    const { t } = useI18n();

    return (
        <div className={`portfolio-bulk-actions${showActions ? ' active' : ''}`} id="portfolioBulkActions">
            <div className="portfolio-bulk-actions-summary" id="portfolioBulkActionsSummary" role="status" aria-live="polite" aria-atomic="true">
                {selectedCount === 1
                    ? t('toolbar.tasksSelected', { count: selectedCount })
                    : t('toolbar.tasksSelectedPlural', { count: selectedCount })}
            </div>
            <div className="portfolio-bulk-actions-buttons">
                <button className="btn" type="button" id="portfolioBulkClearBtn" onClick={() => clearPortfolioBulkSelection(boardId)}>{t('common.clear')}</button>
                <button
                    className={`btn${showActions && hasExistingSprints ? '' : ' hidden'}`}
                    type="button"
                    id="portfolioBulkAssignSprintBtn"
                    disabled={selectedCount === 0 || !hasExistingSprints}
                    onClick={() => openAssignSprintFromSelection(boardId)}
                >{t('toolbar.addToExistingSprint')}</button>
                <button
                    className="btn btn-primary"
                    type="button"
                    id="portfolioBulkCreateSprintBtn"
                    disabled={selectedCount === 0}
                    onClick={() => openCreateSprintFromSelection(boardId)}
                >{t('toolbar.createSprint')}</button>
            </div>
        </div>
    );
}
