import { FloatingPanel, Popover } from '@/shared/ui/FloatingPanel';
import { useRef, useState, type ReactNode } from 'react';
import { createNewProject } from '@/features/portfolio/projects/projectCommands';
import { useShallow } from 'zustand/react/shallow';
import type { BoardRecord, ProjectSaveState } from '@/features/portfolio/types';
import { useAppStore, type AppState } from '@/features/portfolio/state/store';
import {
    clearPortfolioBulkSelection,
    openAssignSprintFromSelection,
    openCreateSprintFromSelection,
    removePortfolioBoard,
    retryPortfolioSave,
    selectPortfolioBoard,
    setPortfolioViewMode
} from '@/features/portfolio/commands/portfolioControls';
import { getRoadmapExtension } from '@/domain/roadmap';
import { normalizePortfolioViewMode } from '@/domain/board';
import { getPortfolioBulkTaskIds, isBoardInHistoricalPreview } from '@/features/portfolio/queries';
import { useI18n } from '@/shared/i18n';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';

type ToolbarState = Pick<AppState, 'portfolioBoards' | 'selectedPortfolioBoardId' | 'selectedPortfolioViewMode'>;
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

function getChipSaveUiState(saveState: ProjectSaveState | undefined, t: Translate): ChipSaveUi {
    if (!saveState) return { status: 'idle', text: '', title: '', canRetry: false };
    if (saveState.watchStatus === 'conflict') {
        return {
            status: 'conflict',
            text: t('toolbar.conflict'),
            title: saveState.watchMessage || t('toolbar.externalChanges'),
            canRetry: false
        };
    }
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
    const viewMode = normalizePortfolioViewMode(state.selectedPortfolioViewMode);
    const views = [
        { mode: 'board', label: t('toolbar.board') },
        { mode: 'dashboard', label: t('dashboard.title') },
        { mode: 'table', label: t('table.view') },
        { mode: 'roadmap', label: t('toolbar.roadmap') },
        { mode: 'control', label: t('control.view') },
        { mode: 'planner', label: t('toolbar.planner') }
    ] as const;
    return <nav className={`portfolio-view-toggle${state.portfolioBoards.length ? '' : ' hidden'}`} id="portfolioViewModeToggle" aria-label={t('toolbar.selectedProjectViewMode')}>
        {views.filter(({ mode }) => state.selectedPortfolioBoardId || mode === 'board' || mode === 'planner').map(({ mode, label }) => {
            const active = viewMode === mode || mode === 'planner' && viewMode === 'calendar';
            return <button className={`btn${active ? ' active' : ''}`} type="button" key={mode} data-view-mode={mode}
                aria-pressed={active} onClick={() => setPortfolioViewMode(mode)}><WorkspaceIcon name={mode} />{label}</button>;
        })}
    </nav>;
}

function ChipList({ state, expandedProducts, onProductToggle }: { state: ChipState; expandedProducts: Record<string, boolean>; onProductToggle: (key: string, open: boolean) => void }) {
    const { t } = useI18n();
    const { openProjectSettings } = usePortfolioActions();
    if (state.portfolioBoards.length === 0) {
        return <span className="empty-state-text">{t('toolbar.noProjectsLoaded')}</span>;
    }

    const renderBoard = (board: BoardRecord, grouped = false) => {
        const saveUi = getChipSaveUiState(state.projectSaveStateById.get(board.id), t);
        return (
            <span
                className={`portfolio-chip${state.selectedPortfolioBoardId === board.id ? ' active' : ''}`}
                key={board.id}
            >
                <button className="chip-link" type="button" title={board.title || board.fileName} data-action="select-board" data-board-id={board.id} aria-pressed={state.selectedPortfolioBoardId === board.id} onClick={(event) => { selectPortfolioBoard(board.id); const panel = event.currentTarget.closest<HTMLElement>('[popover]'); panel?.hidePopover(); }}>
                    {board.title || board.fileName}
                    {!board.handle && <span className="chip-readonly-label"> ({t('toolbar.readOnly')})</span>}
                    {saveUi.text && <span className={`chip-save-state ${saveUi.status}`} title={saveUi.title}>{saveUi.status === 'saving' && <span className="save-spinner" aria-hidden="true" />} {saveUi.text}</span>}
                </button>
                <button className="chip-link chip-settings" type="button" data-action="project-settings" data-board-id={board.id}
                    aria-label={t('project.settingsFor', { name: board.title || board.fileName })} title={t('project.settings')}
                    aria-haspopup="dialog" onClick={() => { document.getElementById('projectPickerBtn')?.focus(); openProjectSettings(board.id); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h6m0 0h10M4 12h12m0 0h4M4 18h4m0 0h12M10 3v6m6 0v6M8 15v6" />
                    </svg>
                </button>
                {board.handle && saveUi.canRetry && (
                    <button className="chip-link" type="button" title={t('toolbar.retrySave')} data-action="retry-save" data-board-id={board.id} onClick={() => retryPortfolioSave(board.id)}>{t('common.retry')}</button>
                )}
                <button className="chip-link chip-link-danger" type="button" aria-label={t('toolbar.removeProject')} title={t('toolbar.removeProject')} data-action="remove-board" data-board-id={board.id} onClick={() => removePortfolioBoard(board.id)}>{grouped ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg> : t('common.remove')}</button>
            </span>
        );
    };
    const groups: { key: string; product: string; boards: BoardRecord[] }[] = [];
    for (const board of state.portfolioBoards) {
        const product = board.data.extensions.project?.productName?.trim() || '';
        const key = product.toLowerCase();
        const group = product && groups.find((entry) => entry.product && entry.key === key);
        if (group) group.boards.push(board);
        else groups.push({ key: product ? key : board.id, product, boards: [board] });
    }
    return (
        <>
            <span className={`portfolio-chip${state.selectedPortfolioBoardId ? '' : ' active'}`}>
                <button className="chip-link" type="button" data-action="select-board" data-board-id="" aria-pressed={!state.selectedPortfolioBoardId} onClick={() => selectPortfolioBoard('')}>{t('common.all')}</button>
            </span>
            {groups.map((group) => group.product ? <ProductProjectMenu key={group.key} product={group.product}
                active={group.boards.some((board) => board.id === state.selectedPortfolioBoardId)} open={Boolean(expandedProducts[group.key])} onOpenChange={open => onProductToggle(group.key, open)}>
                {group.boards.map((board) => renderBoard(board, true))}
                <button type="button" className="product-create btn" onClick={() => { void createNewProject(group.product); }}>{t('header.newProject')}</button>
            </ProductProjectMenu> : group.boards.map((board) => renderBoard(board)))}
        </>
    );
}

function ProductProjectMenu({ product, active, children, open, onOpenChange }: { product: string; active: boolean; children: ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) {
    return <details className={`product-project-menu${active ? ' active' : ''}`} open={open} onToggle={event => onOpenChange(event.currentTarget.open)}>
        <summary><span>{product}</span><span aria-hidden="true">›</span></summary>
        <div className="product-projects">{children}</div>
    </details>;
}

export function PortfolioToolbar() {
    const state = useAppStore(useShallow((state) => ({
        portfolioBoards: state.portfolioBoards,
        selectedPortfolioBoardId: state.selectedPortfolioBoardId,
        selectedPortfolioViewMode: state.selectedPortfolioViewMode
    })));
    const { t } = useI18n();
    return <section className="portfolio-toolbar" id="portfolioToolbar" aria-labelledby="portfolioToolbarTitle">
        <h2 className="sr-only" id="portfolioToolbarTitle">{t('toolbar.selectedProjectViewMode')}</h2>
        <ToolbarContent state={state} />
    </section>;
}

export function PortfolioProjectPicker() {
    const state = useAppStore(useShallow((state) => ({
        portfolioBoards: state.portfolioBoards,
        selectedPortfolioBoardId: state.selectedPortfolioBoardId,
        projectSaveStateById: state.projectSaveStateById,
    })));
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
    const panel = useRef<HTMLDivElement>(null);
    const selected = state.portfolioBoards.find((board) => board.id === state.selectedPortfolioBoardId);
    const label = selected?.title || selected?.fileName || t('common.all');
    const saveUi = selected && getChipSaveUiState(state.projectSaveStateById.get(selected.id), t);
    if (!state.portfolioBoards.length) return null;
    return <Popover.Root open={open} onOpenChange={setOpen}><div className="header-project-picker">
        <span className="toolbar-divider" aria-hidden="true" />
        <Popover.Trigger asChild><button id="projectPickerBtn" className="project-picker-trigger" type="button" data-project-count={state.portfolioBoards.length}
            aria-label={`${t('toolbar.projectSelection')}: ${label}`} title={label} aria-haspopup="dialog" aria-expanded={open}>
            <span>{label}</span><WorkspaceIcon name="chevronDown" />
        </button></Popover.Trigger>
        {saveUi?.text && <span className={`chip-save-state ${saveUi.status}`} title={saveUi.title} role="status">{saveUi.status === 'saving' && <span className="save-spinner" aria-hidden="true" />}{saveUi.text}</span>}
        <FloatingPanel ref={panel} align="start" className="project-picker-panel" id="portfolioBoardsChips" role="dialog" aria-label={t('toolbar.projectSelection')}
            onClick={(event) => { if ((event.target as Element).closest('button')) setOpen(false); }}
            onKeyDown={(event) => event.stopPropagation()}>
            <ChipList state={state} expandedProducts={expandedProducts} onProductToggle={(key, open) => setExpandedProducts(current => current[key] === open ? current : { ...current, [key]: open })} />
        </FloatingPanel>
    </div></Popover.Root>;
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
