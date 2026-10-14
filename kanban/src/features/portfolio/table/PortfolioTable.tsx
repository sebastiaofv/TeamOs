import { useMemo, useState, type MouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { BoardData } from '@/domain/types';
import type { PortfolioRow } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { buildPortfolioRowsFromBoardData, getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';
import { readTableColumnPreferences, saveTableColumnPreferences } from '@/infrastructure/browser/tablePreferences';
import { downloadCsv } from '@/infrastructure/browser/downloadCsv';
import {
    TABLE_COLUMNS, DEFAULT_TABLE_COLUMNS, DEFAULT_TABLE_FILTERS, DEFAULT_TABLE_SORT,
    normalizeTableColumns, filterTableRows, sortTableRows, tableCellValue, buildTableCsv,
    type TableColumnId
} from './tableModel';
import { clearTableFilters, setTableSort } from './tableControls';
import { PRIORITY_LABELS, STATUS_LABELS, COLUMN_LABELS } from './tableLabels';
import { useTableDisclosure } from './useTableDisclosure';

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
    const actions = usePortfolioActions();
    const columnDisclosure = useTableDisclosure(hidden);
    const filters = useAppStore((state) => state.portfolioTableFiltersByBoardId[boardId] || DEFAULT_TABLE_FILTERS);
    const [columns, setColumns] = useState<TableColumnId[]>(() => normalizeTableColumns(readTableColumnPreferences()));
    const sort = useAppStore((state) => state.portfolioTableSortByBoardId[boardId] || DEFAULT_TABLE_SORT);
    const [page, setPage] = useState(0);
    const [pageScope, setPageScope] = useState({ filters, sort });
    const [pageSize, setPageSize] = useState(50);
    const [selected, setSelected] = useState<Set<number>>(() => new Set());
    const [separator, setSeparator] = useState<',' | ';'>(',');
    const rows = useMemo(() => sortTableRows(filterTableRows(sourceRows, filters), sort.column, sort.direction, boardData),
        [sourceRows, filters, sort, boardData]);
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    const currentPage = pageScope.filters === filters && pageScope.sort === sort ? Math.min(page, pageCount - 1) : 0;
    const pageRows = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
    const selectedCount = sourceRows.filter((row) => selected.has(row.taskId)).length;
    const allPageSelected = pageRows.length > 0 && pageRows.every((row) => selected.has(row.taskId));
    const activeCount = sourceRows.filter((row) => !row.task.archived).length;
    function clearFilters() {
        clearTableFilters();
        setPage(0);
    }
    function changeColumns(next: TableColumnId[]) {
        const normalized = normalizeTableColumns(next);
        setColumns(normalized);
        saveTableColumnPreferences(normalized);
    }
    function moveColumn(column: TableColumnId, step: number) {
        const next = [...columns];
        const from = next.indexOf(column);
        const to = from + step;
        if (from < 0 || to < 0 || to >= next.length) return;
        [next[from], next[to]] = [next[to], next[from]];
        changeColumns(next);
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
        actions.openPortfolioTaskDetails(boardId, row.taskId, row.historical ? { boardData, readOnly: true } : undefined);
    }
    function cellText(row: PortfolioRow, column: TableColumnId): string {
        const value = tableCellValue(row, column, boardData);
        if (!value) return t('table.notDefined');
        if (column === 'status') return t(STATUS_LABELS[row.task.status]);
        if (column === 'priority' && row.task.priority) return t(PRIORITY_LABELS[row.task.priority]);
        if (column === 'blocked' || column === 'archived') return t(value === 'true' ? 'common.yes' : 'common.no');
        return value;
    }
    function exportCsv() {
        const csv = buildTableCsv(rows, columns, boardData, {
            separator, header: (column) => t(COLUMN_LABELS[column]), value: cellText
        });
        const name = project.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'project';
        downloadCsv(csv, `${name}-workitems.csv`);
    }

    return (
        <section id="portfolioTable" className={`portfolio-table${hidden ? ' hidden' : ''}`} aria-labelledby="tableTitle">
            <h2 id="tableTitle" className="sr-only">{t('table.title', { project })}</h2>
            <div className="table-heading">
                <div className="table-tools">
                    <details id="tableColumns" className="table-columns" ref={columnDisclosure.detailsRef} onKeyDown={columnDisclosure.onKeyDown} onToggle={columnDisclosure.onToggle}>
                        <summary className="btn" ref={columnDisclosure.summaryRef}>{t('table.columns')}</summary>
                        <div className="table-column-panel" data-table-panel>
                            <div className="table-column-options">
                                {[...columns, ...TABLE_COLUMNS.filter((column) => !columns.includes(column))].map((column) => {
                                    const required = column === 'id' || column === 'title';
                                    const index = columns.indexOf(column);
                                    const label = t(COLUMN_LABELS[column]);
                                    return <div className="table-column-option" key={column}>
                                        <label htmlFor={`tableColumn-${column}`}><input id={`tableColumn-${column}`} type="checkbox" checked={index >= 0} disabled={required}
                                            onChange={(event) => changeColumns(event.target.checked ? [...columns, column] : columns.filter((entry) => entry !== column))} /> {label}
                                            {required && <span className="table-column-required"> ({t('table.mandatory')})</span>}
                                        </label>
                                        <button className="btn" disabled={index <= 0} aria-label={t('table.moveLeft', { column: label })} onClick={() => moveColumn(column, -1)}>←</button>
                                        <button className="btn" disabled={index < 0 || index === columns.length - 1} aria-label={t('table.moveRight', { column: label })} onClick={() => moveColumn(column, 1)}>→</button>
                                    </div>;
                                })}
                            </div>
                            <button className="btn" onClick={() => changeColumns([...DEFAULT_TABLE_COLUMNS])}>{t('table.resetColumns')}</button>
                        </div>
                    </details>
                </div>
                <div className="table-export">
                    <label htmlFor="tableCsvSeparator">{t('table.separator')}</label>
                    <span className="table-csv-select">
                        <select id="tableCsvSeparator" value={separator} onChange={(event) => setSeparator(event.target.value === ';' ? ';' : ',')}>
                            <option value=",">{t('table.comma')}</option><option value=";">{t('table.semicolon')}</option>
                        </select>
                        <svg className="table-csv-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
                    </span>
                    <button className="btn" id="tableExportCsv" disabled={rows.length === 0} onClick={exportCsv}>{t('table.export')}</button>
                </div>
            </div>
            <div className="table-summary">
                <p role="status" aria-live="polite" id="tableCounts">{t('table.counts', { visible: rows.length, total: sourceRows.length, active: activeCount, archived: sourceRows.length - activeCount })}</p>
                <span role="status">{t('table.selected', { count: selectedCount })}</span>
                {selectedCount > 0 && <button className="btn" onClick={() => setSelected(new Set())}>{t('table.clearSelection')}</button>}
            </div>
            {rows.length === 0 ? <div className="table-empty" role="status">
                <p>{t(sourceRows.length === 0 ? 'table.empty' : 'table.noResults')}</p>
                {sourceRows.length === 0 && canCreate
                    ? <button className="btn btn-primary" id="tableCreateTask" onClick={() => actions.openPortfolioCreateTaskModal(boardId, 'backlog')}>{t('table.create')}</button>
                    : sourceRows.length > 0 && <button className="btn" onClick={clearFilters}>{t('table.clearFilters')}</button>}
            </div> : <>
                <div className="table-scroll" tabIndex={0} role="region" aria-label={t('table.view')}>
                    <table id="workitemsTable">
                        <caption className="sr-only">{t('table.title', { project })}</caption>
                        <thead><tr>
                            <th scope="col"><input type="checkbox" aria-label={t('table.selectPage')} checked={allPageSelected}
                                onChange={(event) => toggleSelection(pageRows.map((row) => row.taskId), event.target.checked)} /></th>
                            {columns.map((column) => <th scope="col" key={column} aria-sort={sort.column === column ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                <button type="button" onClick={() => { setTableSort(column, sort.column === column && sort.direction === 'asc' ? 'desc' : 'asc'); setPage(0); }}>
                                    {t(COLUMN_LABELS[column])}<span aria-hidden="true">{sort.column === column ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>
                                </button>
                            </th>)}
                            <th scope="col">{t('table.actions')}</th>
                        </tr></thead>
                        <tbody>{pageRows.map((row) => <tr key={`${boardId}:${row.taskId}`} data-board-id={boardId} data-task-id={row.taskId}
                            onClick={(event) => { if (!(event.target as HTMLElement).closest('button,input,a,label')) openDetails(row, event); }}>
                            <td><input type="checkbox" aria-label={t('task.select', { title: row.task.title })} checked={selected.has(row.taskId)}
                                onChange={(event) => toggleSelection([row.taskId], event.target.checked)} /></td>
                            {columns.map((column) => <td key={column} data-column={column}>
                                {column === 'id' || column === 'title'
                                    ? <button className="table-item-link" type="button" onClick={(event) => openDetails(row, event)}>{column === 'id' ? `#${row.taskId}` : cellText(row, column)}</button>
                                    : <span className={!tableCellValue(row, column, boardData) ? 'table-not-defined' : undefined}>{cellText(row, column)}</span>}
                            </td>)}
                            <td><button className="btn" aria-label={t('common.edit')} disabled={!row.canMutate || row.historical}
                                onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); actions.editPortfolioTask(boardId, row.taskId); }}>{t('common.edit')}</button></td>
                        </tr>)}</tbody>
                    </table>
                </div>
                <nav className="table-pagination" aria-label={t('table.view')}>
                    <label htmlFor="tablePageSize">{t('table.pageSize')} <select id="tablePageSize" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}>
                        {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                    </select></label>
                    <button className="btn" id="tablePreviousPage" disabled={currentPage === 0} onClick={() => { setPageScope({ filters, sort }); setPage(currentPage - 1); }}>{t('table.previous')}</button>
                    <span role="status">{t('table.page', { current: currentPage + 1, total: pageCount })}</span>
                    <button className="btn" id="tableNextPage" disabled={currentPage >= pageCount - 1} onClick={() => { setPageScope({ filters, sort }); setPage(currentPage + 1); }}>{t('table.next')}</button>
                </nav>
            </>}
        </section>
    );
}
