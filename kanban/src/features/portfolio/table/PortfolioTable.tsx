import { QueryFilterContext } from '@/features/portfolio/shell/QueryFilterContext';
import { TableColumnMenu } from './TableColumnMenu';
import { TablePagination } from './TablePagination';
import { showChoice } from '@/app/overlays/appMessages';
import type { AdditionalPortfolioFilter } from '@/features/portfolio/shell/PortfolioFilters';
import { PortfolioQueryControls } from '@/features/portfolio/shell/PortfolioQueryControls';
import { formatDate } from '@/domain/dates';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { SprintAction } from '@/features/portfolio/roadmap/SprintAction';
import { SprintPoints } from '@/features/portfolio/roadmap/SprintPoints';
import { workitemLabel } from '@/domain/taskIdentity';
import { WorkitemTypeBadge } from '@/features/portfolio/task/WorkitemTypeBadge';
import { isPlanningUnit, workitemType, epicOf, storyOf, WORKITEM_TYPES } from '@/domain/workitems';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { BoardData } from '@/domain/types';
import type { PortfolioRow } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { buildPortfolioRowsFromBoardData, getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { portfolioActions as actions } from '@/features/portfolio/commands/portfolioCommands';
import { useI18n } from '@/shared/i18n';
import { readTableColumnPreferences, saveTableColumnPreferences } from '@/infrastructure/browser/tablePreferences';
import { downloadCsv } from '@/infrastructure/browser/downloadCsv';
import {
    TABLE_COLUMNS, DEFAULT_TABLE_COLUMNS, DEFAULT_TABLE_SORT,
    normalizeTableColumns, filterTableRows, sortTableRows, tableCellValue, buildTableCsv,
    type TableColumnId
} from './tableModel';
import { clearTableFilters, clearTablePanelFilters, DEFAULT_TABLE_FILTER_STATE, setTableFilter, setTableSort } from './tableControls';
import { PRIORITY_LABELS, COLUMN_LABELS } from './tableLabels';
import { FloatingPanel, Popover } from '@/shared/ui/FloatingPanel';
import { formatTableTimestamp } from './tablePresentation';
import { buildSprintTableGroups, currentSprintRosters, unplannedTableRows, type SprintTableGroup, type TableView } from './tableViews';
import { useFocusTarget } from '@/shared/hooks/useFocusTarget';
import { useLocalToday } from '@/shared/hooks/useLocalToday';
import { buildAssignableSprintOptions } from '@/features/portfolio/queries/sprintPlanning';
import { getWorkflow } from '@/domain/workflow';
import { WorkflowStateBadge } from '@/features/portfolio/task/WorkflowStateBadge';
import { groupTableRows, visibleTableRows } from './tableHierarchy';

export function PortfolioTable({ hidden }: { hidden: boolean }) {
    const state = useAppStore(useShallow((s) => ({
        portfolioBoards: s.portfolioBoards, portfolioTasks: s.portfolioTasks,
        selectedPortfolioBoardId: s.selectedPortfolioBoardId, portfolioTimelineSelection: s.portfolioTimelineSelection
    })));
    const board = state.portfolioBoards.find((record) => record.id === state.selectedPortfolioBoardId);
    const projection = useMemo(() => {
        const timeline = getSelectedPortfolioTimelineView(state);
        if (timeline?.isPreview && timeline.projectedBoard) {
            return {
                data: timeline.projectedBoard,
                historical: true,
                rows: buildPortfolioRowsFromBoardData(state, timeline.boardRecord, timeline.projectedBoard, { canMutate: false, historical: true })
            };
        }
        return { data: board?.data || null, historical: false, rows: state.portfolioTasks.filter((row) => row.boardId === board?.id) };
    }, [state, board]);
    if (!board || !projection.data) return null;
    return <ProjectTable key={board.id} hidden={hidden} boardId={board.id} project={board.title || board.fileName}
        boardData={projection.data} sourceRows={projection.rows} canCreate={Boolean(board.handle) && !projection.historical} />;
}

function ProjectTable({ hidden, boardId, project, boardData, sourceRows, canCreate }: {
    hidden: boolean; boardId: string; project: string; boardData: BoardData; sourceRows: PortfolioRow[]; canCreate: boolean;
}) {
    const { t } = useI18n();
    const [view, setView] = useState<TableView>('hierarchy');
    const [lastWorkitemView, setLastWorkitemView] = useState<TableView>('hierarchy');
    const [viewMenuOpen, setViewMenuOpen] = useState(false);
    const today = useLocalToday();
    const groups = useMemo(() => view === 'sprints' ? buildSprintTableGroups(currentSprintRosters(boardData, sourceRows), today) : [], [view, boardData, sourceRows, today]);
    const viewLabels = { hierarchy: 'workitems.hierarchyAll', epics: 'workitems.type.epic', stories: 'workitems.stories', independent: 'workitems.independent', all: 'workitems.all', unplanned: 'table.unplannedWorkitems', sprints: 'table.sprints' } as const;
    return <section id="portfolioTable" className={`portfolio-table${hidden ? ' hidden' : ''}`} aria-labelledby="tableTitle">
        <h2 id="tableTitle" className="sr-only">{t('table.title', { project })}</h2>
        <div className="table-view-options" role="group" aria-label={t('table.perspectives')}>
            <Popover.Root open={viewMenuOpen && !hidden} onOpenChange={setViewMenuOpen}><div className="table-view-menu">
                <Popover.Trigger asChild><button type="button" id="tableViewBtn" className={`btn${view !== 'unplanned' && view !== 'sprints' ? ' active' : ''}`}>
                    {t(viewLabels[lastWorkitemView])}<WorkspaceIcon name="chevronDown" />
                </button></Popover.Trigger>
                <FloatingPanel className="table-view-panel" data-table-panel aria-label={t('table.perspectives')}>
                    {(['hierarchy', 'epics', 'stories', 'independent', 'all'] as const).map(key => <button className={`btn${view === key ? ' active' : ''}`} type="button" key={key}
                        data-table-view={key} aria-pressed={view === key} onClick={() => { setView(key); setLastWorkitemView(key); setViewMenuOpen(false); }}>{t(viewLabels[key])}</button>)}
                </FloatingPanel>
            </div></Popover.Root>
            {(['unplanned', 'sprints'] as const).map(key => <button className={`btn${view === key ? ' active' : ''}`} type="button" key={key}
                data-table-view={key} aria-pressed={view === key} onClick={() => setView(key)}>{t(viewLabels[key])}</button>)}
        </div>
        {view !== 'sprints' ? <WorkitemTable key={view} preferenceContext={view} hidden={hidden} boardId={boardId} project={project} boardData={boardData}
            sourceRows={view === 'unplanned' ? unplannedTableRows(sourceRows) : sourceRows.filter((row) => view === 'epics' ? workitemType(row.task) === 'epic' : view === 'stories' ? workitemType(row.task) === 'story' : view === 'hierarchy' ? true : view === 'independent' ? isPlanningUnit(boardData, row.task) && workitemType(row.task) !== 'story' : ['task', 'bug'].includes(workitemType(row.task)))} canCreate={canCreate} createType={view === 'epics' ? 'epic' : view === 'stories' ? 'story' : 'task'} planning={view === 'unplanned'} nested={view === 'hierarchy'} />
            : <>
                <p className="table-sprint-note">{t('table.sprintDatesNote')}</p>
                {groups.length === 0 && <p className="table-empty" role="status">{t('table.noSprints')}</p>}
                {groups.map((group) => <SprintTableSection key={group.sprint.id} group={group} hidden={hidden} boardId={boardId} project={project} canEdit={canCreate} sprintPointsData={boardData} />)}
            </>}
    </section>;
}

/** DD/MM/YYYY in the viewer's local time zone. */
export function formatClosureDate(iso: string): string {
    const date = new Date(iso);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function SprintTableSection({ group, hidden, boardId, project, canEdit, sprintPointsData }: { group: SprintTableGroup; hidden: boolean; boardId: string; project: string; canEdit: boolean; sprintPointsData: BoardData }) {
    const { t, language } = useI18n();
    const [expanded, setExpanded] = useState(false);
    const completeness = group.completeness === null ? t('table.noCompleteness')
        : t('table.completeness', { percent: new Intl.NumberFormat(language === 'pt' ? 'pt-PT' : 'en', { maximumFractionDigits: 1 }).format(group.completeness) });
    return <details className="table-sprint-section" data-table-sprint={group.sprint.id}
        onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>
            <span className="sr-only">{completeness} ({group.completed}/{group.total - group.cancelled}) · {t('workflow.cancelled')}: {group.cancelled}</span>
            <span className="table-sprint-labels">
                <button type="button" className="roadmap-row-title roadmap-edit-name table-sprint-name" title={t('table.sprintIdentity', { number: group.number, name: group.sprint.title })} aria-label={`${t('common.edit')} ${group.sprint.title}`}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); actions.openRoadmapEntityModal('sprints', group.sprint.id, { boardId }); }}>{t('table.sprintIdentity', { number: group.number, name: group.sprint.title })}</button>
                <span className="table-sprint-dates">{formatDate(group.sprint.startDate || '') || t('table.notDefined')} → {formatDate(group.sprint.endDate || '') || t('table.notDefined')}</span>
            </span>
            <span className="roadmap-row-actions table-sprint-controls">
                <span className="roadmap-disclosure-btn" title={t('roadmap.visibleAssociated', { visible: group.rows.length, total: group.rows.length })}><WorkspaceIcon name="table" />{group.rows.length}/{group.rows.length}</span>
                <SprintPoints data={sprintPointsData} sprintId={group.sprint.id} />
                <span className={`table-status-badge sprint-status-${group.status}`}>{t(`table.sprintStatus.${group.status}`)}</span>
                <SprintAction compact sprint={group.sprint} boardId={boardId} disabled={!canEdit} />
            </span>
        </summary>
        {expanded && group.closedAt && <p className="table-sprint-note table-sprint-frozen-note" data-sprint-closure-note>{t('sprint.frozenNote', { date: formatClosureDate(group.closedAt) })}</p>}
        {expanded && <WorkitemTable hidden={hidden} boardId={boardId} project={`${project} · ${t('table.sprintIdentity', { number: group.number, name: group.sprint.title })}`} boardData={group.boardData}
            sourceRows={group.rows} canCreate={false} createSprintId={group.sprint.id} scope={`sprint-${group.sprint.id}`} selectable={false} nested />}
    </details>;
}

export function WorkitemTable({ hidden, boardId, project, boardData, sourceRows, canCreate, createType = 'task', createSprintId, planning = false, scope = '', preferenceContext, compact = false, emptyLabel, nested = false, bare = false, selectable = true, fixedColumns }: {
    hidden: boolean; boardId: string; project: string; boardData: BoardData; sourceRows: PortfolioRow[]; canCreate: boolean; createType?: import('@/domain/types').WorkitemType; createSprintId?: string; planning?: boolean; scope?: string; preferenceContext?: string; compact?: boolean; emptyLabel?: string; nested?: boolean; bare?: boolean; selectable?: boolean; fixedColumns?: readonly TableColumnId[];
}) {
    const { t, language } = useI18n();
    const today = useLocalToday();
    const hasAssignableSprints = planning && buildAssignableSprintOptions(boardData, today, language).length > 0;
    const sortRef = useFocusTarget<HTMLButtonElement>('portfolioTableSort', !hidden && !compact);
    const [sprintMenuOpen, setSprintMenuOpen] = useState(false);
    const sprintTrigger = useRef<HTMLButtonElement>(null);
    const pendingSprintAction = useRef<(() => void) | null>(null);
    const preferenceScope = `${boardData.extensions.project?.id || boardId}.${preferenceContext || scope || 'all'}`;
    const filters = useAppStore(state => state.tableFiltersByScope[preferenceScope] || DEFAULT_TABLE_FILTER_STATE);
    useEffect(() => { if (!hidden && !bare) useAppStore.setState({ activeTableFilterScope: preferenceScope }); }, [hidden, bare, preferenceScope]);
    const [selectedColumns, setColumns] = useState<TableColumnId[]>(() => normalizeTableColumns(readTableColumnPreferences(preferenceScope) ?? readTableColumnPreferences() ?? (compact ? TABLE_COLUMNS.filter((column) => ['id', 'title', 'type', 'status', 'responsible'].includes(column)) : undefined)));
    const columns = fixedColumns ? [...fixedColumns] : selectedColumns.filter((column) => column !== 'archived' && (!bare || column !== 'story'));
    const sort = useAppStore((state) => state.portfolioTableSortByBoardId[boardId] || DEFAULT_TABLE_SORT);
    const focusSortColumn = columns.find((column) => column === sort.column) ?? columns[0];
    const [page, setPage] = useState(0);
    const [pageScope, setPageScope] = useState({ filters, sort });
    const [pageSize, setPageSize] = useState(50);
    const [selected, setSelected] = useState<Set<number>>(() => new Set());
    const [expandedRows, setExpandedRows] = useState<Set<number>>(() => new Set());
    const scopedId = (id: string) => scope ? `${id}-${scope}` : id;
    const hierarchyFields: AdditionalPortfolioFilter[] = [
        { key: 'type', id: scopedId('tableTypeFilter'), label: t('workitems.type'), value: filters.type, changed: Boolean(filters.type),
            options: [{ value: '', label: t('common.all') }, ...WORKITEM_TYPES.map(type => ({ value: type, label: t(`workitems.type.${type}`) }))],
            onChange: value => setTableFilter('type', String(value), preferenceScope),
            reset: () => setTableFilter('type', '', preferenceScope) }
    ];
    const rows = useMemo(() => sortTableRows(filterTableRows(sourceRows, filters).filter(row => !filters.type || workitemType(row.task) === filters.type), sort.column, sort.direction, boardData),
        [sourceRows, filters, sort, boardData]);
    const rowGroups = useMemo(() => groupTableRows(rows, nested), [rows, nested]);
    const pageCount = Math.max(1, Math.ceil(rowGroups.length / pageSize));
    const currentPage = pageScope.filters === filters && pageScope.sort === sort ? Math.min(page, pageCount - 1) : 0;
    const pageRows = visibleTableRows(rowGroups.slice(currentPage * pageSize, (currentPage + 1) * pageSize), expandedRows);
    const selectedCount = selectable ? sourceRows.filter((row) => selected.has(row.taskId)).length : 0;
    const allPageSelected = pageRows.length > 0 && pageRows.every(({ row }) => selected.has(row.taskId));
    function clearFilters() {
        clearTableFilters(false, preferenceScope);
        setPage(0);
    }
    function changeColumns(next: TableColumnId[]) {
        const normalized = normalizeTableColumns(next);
        setColumns(normalized);
        saveTableColumnPreferences(normalized, preferenceScope);
    }
    function toggleSelection(ids: number[], checked: boolean) {
        setSelected((previous) => {
            const next = new Set(previous);
            ids.forEach((id) => { if (checked) next.add(id); else next.delete(id); });
            return next;
        });
    }
    function openDetails(row: PortfolioRow, event?: MouseEvent<HTMLElement>) {
        const target = event?.currentTarget;
        const trigger = target?.matches('button.table-item-link')
            ? target
            : target?.querySelector<HTMLButtonElement>('button.table-item-link');
        trigger?.focus({ preventScroll: true });
        actions.setSelectedPortfolioCard(boardId, row.taskId);
        actions.openPortfolioTaskDetails(boardId, row.taskId, row.historical && !row.liveDetails ? { boardData: row.boardData || boardData, readOnly: true } : undefined);
    }
    function cellText(row: PortfolioRow, column: TableColumnId): string {
        const value = tableCellValue(row, column, boardData);
        if (!value) return t('table.notDefined');
        if (column === 'dueDate') return formatDate(value);
        if (column === 'type') return t(`workitems.type.${workitemType(row.task)}`);
        if (column === 'status') return row.columnTitle || row.task.status;
        if (column === 'priority' && row.task.priority) return t(PRIORITY_LABELS[row.task.priority]);
        if (column === 'blocked' || column === 'dependencyBlocked' || column === 'archived') return t(value === 'true' ? 'common.yes' : 'common.no');
        if (column === 'createdAt' || column === 'updatedAt') return formatTableTimestamp(value) || t('table.notDefined');
        return value;
    }
    async function exportCsv() {
        const separator = await showChoice<',' | ';'>(t('table.separatorHint'), [
            { value: ',', label: t('table.comma') }, { value: ';', label: t('table.semicolon') }
        ], { title: t('table.export'), selectionLabel: t('table.separator'), requiredSelection: true });
        if (separator === null) return;
        const csv = buildTableCsv(rows, columns, boardData, {
            separator, header: (column) => t(COLUMN_LABELS[column]), value: cellText
        });
        const name = project.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'project';
        downloadCsv(csv, `${name}-workitems.csv`);
    }

    return (
        <QueryFilterContext.Provider value={{ filters, setFilter: (key, value) => setTableFilter(key, value, preferenceScope), clearPanel: () => clearTablePanelFilters(preferenceScope) }}>
        <div className={`table-panel${compact ? ' table-panel-compact' : ''}`} data-table-filter-scope={preferenceScope} onFocusCapture={() => useAppStore.setState({ activeTableFilterScope: preferenceScope })} onPointerDownCapture={() => useAppStore.setState({ activeTableFilterScope: preferenceScope })}>
            {bare && <div className="table-heading"><PortfolioQueryControls active={!hidden} scope={scope} iconOnlyFilters /></div>}
            {!bare && <details className={compact ? 'table-compact-tools' : 'table-tools-expanded'} open={compact ? undefined : true}>
                <summary className="btn" hidden={!compact}>{t('roadmap.tableOptions')}</summary>
                <div className="table-heading">
                    <div className="table-counts">
                        <p role="status" aria-live="polite" id={scopedId('tableCounts')}>{t('table.visibleCount', { visible: rows.length, total: sourceRows.length })}</p>
                        {selectedCount > 0 && <span role="status">{t('table.selected', { count: selectedCount })}</span>}
                        {selectedCount > 0 && <button className="btn-text" onClick={() => setSelected(new Set())}>{t('table.clearSelection')}</button>}
                    </div>
                    <div className="table-tools">
                        <PortfolioQueryControls active={!hidden} scope={scope} additionalFields={hierarchyFields} iconOnlyFilters />
                        <TableColumnMenu columns={columns} available={TABLE_COLUMNS.filter(column => column !== 'archived')} defaults={DEFAULT_TABLE_COLUMNS} required={['id', 'title']}
                            label={column => t(COLUMN_LABELS[column])} onChange={changeColumns} scope={scope} hidden={hidden} />
                        <button className="btn icon-btn" id={scopedId('tableExportCsv')} type="button" aria-label={t('table.export')} title={t('table.export')} disabled={rows.length === 0} onClick={() => void exportCsv()}><WorkspaceIcon name="export" /></button>
                        {canCreate && <div className="table-management-actions">
                            <span className="toolbar-divider" aria-hidden="true" />
                            {planning && <Popover.Root open={sprintMenuOpen && !hidden} onOpenChange={setSprintMenuOpen}><div id={scopedId('tableSprintActions')} className="table-sprint-actions">
                                <Popover.Trigger asChild><button type="button" ref={sprintTrigger} className="btn"><WorkspaceIcon name="runner" />{t('table.sprintActions')}<WorkspaceIcon name="chevronDown" /></button></Popover.Trigger>
                                <FloatingPanel className="table-sprint-actions-panel" data-table-panel aria-label={t('table.sprintActions')} onCloseAutoFocus={event => {
                                    if (!pendingSprintAction.current) return;
                                    event.preventDefault(); sprintTrigger.current?.focus({ preventScroll: true });
                                    const run = pendingSprintAction.current; pendingSprintAction.current = null; run();
                                }}>
                                    <button className="btn" id={scopedId('tableCreateSprint')} type="button" disabled={selectedCount === 0}
                                        onClick={() => { setSprintMenuOpen(false); pendingSprintAction.current = () => { actions.openRoadmapEntityModal('sprints', '', { boardId, mode: 'create-sprint-from-selection',
                                            unplannedTaskIds: sourceRows.filter(row => selected.has(row.taskId)).map(row => row.taskId) }); }; }}>{t('toolbar.createSprint')}</button>
                                    <button className="btn" id={scopedId('tableAddToSprint')} type="button" disabled={selectedCount === 0 || !hasAssignableSprints}
                                        title={!hasAssignableSprints ? t('roadmapDialog.noEligibleSprints') : undefined}
                                        onClick={() => { setSprintMenuOpen(false); pendingSprintAction.current = () => { actions.openRoadmapEntityModal('sprints', '', { boardId, mode: 'assign-sprint-from-selection',
                                            unplannedTaskIds: sourceRows.filter(row => selected.has(row.taskId)).map(row => row.taskId) }); }; }}>{t('table.addToSprint')}</button>
                                </FloatingPanel>
                            </div></Popover.Root>}
                            <button className="btn btn-primary icon-btn" id={scopedId('tableCreateTask')} type="button" aria-label={t('table.create')} title={t('table.create')} onClick={() => actions.openPortfolioCreateTaskModal(boardId, 'backlog', { preferredType: createType, preferredSprintId: createSprintId })}><WorkspaceIcon name="plus" /></button>
                        </div>}
                    </div>
                </div>
            </details>}
            {rows.length === 0 && !bare ? <div className="table-empty" role="status">
                <p>{sourceRows.length === 0 && emptyLabel ? emptyLabel : t(sourceRows.length === 0 ? scope ? 'table.emptySprint' : planning ? 'table.emptyPlanning' : 'table.empty' : 'table.noResults')}</p>
                {sourceRows.length > 0 && <button className="btn" onClick={clearFilters}>{t('table.clearFilters')}</button>}
            </div> : <>
                <div className="table-scroll" tabIndex={0} role="region" aria-label={t('table.view')}>
                    <table id={scopedId('workitemsTable')} className="workitems-table">
                        <caption className="sr-only">{t('table.title', { project })}</caption>
                        <thead><tr>
                            {selectable && <th scope="col"><input type="checkbox" aria-label={t('table.selectPage')} checked={allPageSelected}
                                onChange={(event) => toggleSelection(pageRows.map(({ row }) => row.taskId), event.target.checked)} /></th>}
                            {columns.map((column) => <th scope="col" data-column={column} key={column} aria-sort={sort.column === column ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                <button ref={column === focusSortColumn ? sortRef : undefined} type="button" onClick={() => { setTableSort(column, sort.column === column && sort.direction === 'asc' ? 'desc' : 'asc'); setPage(0); }}>
                                    {t(COLUMN_LABELS[column])}<span aria-hidden="true">{sort.column === column ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>
                                </button>
                            </th>)}
                        </tr></thead>
                        <tbody>{bare && !rows.length && <tr><td colSpan={columns.length + (selectable ? 1 : 0)}>{emptyLabel || t('table.noResults')}</td></tr>}{pageRows.map(({ row, depth, hasChildren }) => {
                            const workflowState = getWorkflow(row.boardData || boardData, row.task).states.find((state) => state.id === row.task.status);
                            return <tr key={`${boardId}:${row.taskId}`} data-board-id={boardId} data-task-id={row.taskId} data-depth={nested ? depth : undefined}
                            onClick={(event) => { if (!(event.target as HTMLElement).closest('button,input,a,label')) openDetails(row, event); }}>
                            {selectable && <td><input type="checkbox" aria-label={t('task.select', { title: row.task.title })} checked={selected.has(row.taskId)}
                                onChange={(event) => toggleSelection([row.taskId], event.target.checked)} /></td>}
                            {columns.map((column) => <td key={column} data-column={column}>
                                {column === 'id' || column === 'title'
                                    ? <div className={nested && column === 'title' ? `table-tree-cell table-tree-depth-${depth}` : undefined} style={nested && column === 'title' ? { paddingInlineStart: depth * 24 } : undefined}>
                                        {nested && column === 'title' && (hasChildren ? <button className="table-tree-toggle" type="button"
                                            aria-label={`${t(expandedRows.has(row.taskId) ? 'common.collapse' : 'common.expand')} ${row.task.title}`}
                                            aria-expanded={expandedRows.has(row.taskId)} onClick={() => setExpandedRows((previous) => {
                                                const next = new Set(previous);
                                                if (next.has(row.taskId)) next.delete(row.taskId); else next.add(row.taskId);
                                                return next;
                                            })}><span aria-hidden="true">{expandedRows.has(row.taskId) ? '▾' : '▸'}</span></button>
                                            : <span className="table-tree-spacer" aria-hidden="true" />)}
                                        <button className="table-item-link" title={cellText(row, column)} type="button" onClick={(event) => openDetails(row, event)}>{column === 'id' ? workitemLabel(row.task) : cellText(row, column)}</button>
                                    </div>
                                    : (column === 'epic' || column === 'story') && (column === 'epic' ? epicOf(boardData, row.task) : storyOf(boardData, row.task)) ? <button type="button" className="table-item-link" onClick={() => actions.openPortfolioTaskDetails(boardId, (column === 'epic' ? epicOf(boardData, row.task)! : storyOf(boardData, row.task)!).id)}>{cellText(row, column)}</button> : column === 'type' ? <WorkitemTypeBadge type={workitemType(row.task)} /> : column === 'status' && workflowState
                                        ? <WorkflowStateBadge state={workflowState} />
                                        : <span title={cellText(row, column)} className={`table-cell-text${!tableCellValue(row, column, boardData) ? ' table-not-defined' : ''}${(column === 'blocked' || column === 'dependencyBlocked') && tableCellValue(row, column, boardData) === 'true' ? ' table-blocked-badge' : ''}`}>{cellText(row, column)}</span>}
                            </td>)}
                        </tr>; })}</tbody>
                    </table>
                </div>
                {(!bare || pageCount > 1) && <TablePagination page={currentPage} pageCount={pageCount} pageSize={pageSize} scope={scope}
                    onPage={next => { setPageScope({ filters, sort }); setPage(next); }} onPageSize={size => { setPageSize(size); setPage(0); }} />}
            </>}
        </div>
        </QueryFilterContext.Provider>
    );
}
