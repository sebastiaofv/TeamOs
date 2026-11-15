import { useMemo, useState, type MouseEvent } from 'react';
import { formatDate } from '@/domain/dates';
import type { BoardData } from '@/domain/types';
import { useShallow } from 'zustand/react/shallow';
import { CONTROL_KINDS, CONTROL_STATUSES, ASSESSMENTS, controlPending, controlRecords, type ControlKind, type ControlRecord } from '@/domain/projectControl';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries/portfolioTimelineViews';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import { useLocalToday } from '@/shared/hooks/useLocalToday';
import { openDialog } from '@/app/overlays/dialogs';
import { showChoice } from '@/app/overlays/appMessages';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { readTableColumnPreferences, saveTableColumnPreferences } from '@/infrastructure/browser/tablePreferences';
import { buildCsv } from '@/infrastructure/browser/csv';
import { downloadCsv } from '@/infrastructure/browser/downloadCsv';
import { FilterMenu } from '@/features/portfolio/shell/PortfolioFilterMenu';
import { ActiveFilterTags } from '@/features/portfolio/shell/ActiveFilterTags';
import type { AdditionalPortfolioFilter } from '@/features/portfolio/shell/PortfolioFilters';
import { TableColumnMenu } from '@/features/portfolio/table/TableColumnMenu';
import { TablePagination } from '@/features/portfolio/table/TablePagination';
import { formatTableTimestamp } from '@/features/portfolio/table/tablePresentation';
import { projectElementOptions } from './ControlRelated';
import { ControlBadge } from './ControlBadge';
import { navigateControlTabs } from './controlTabNavigation';
import { CONTROL_TABLE_COLUMNS, DEFAULT_CONTROL_COLUMNS, controlCellValue, filterControlRecords, normalizeControlColumns, sortControlRecords, type ControlColumn } from './controlTableModel';

export function PortfolioControl({ hidden }: { hidden: boolean }) {
    const state = useAppStore(useShallow((value) => ({ portfolioBoards: value.portfolioBoards, selectedPortfolioBoardId: value.selectedPortfolioBoardId, portfolioTimelineSelection: value.portfolioTimelineSelection })));
    if (hidden) return null;
    const timeline = getSelectedPortfolioTimelineView(state);
    const board = state.portfolioBoards.find(item => item.id === state.selectedPortfolioBoardId);
    const data = timeline?.isPreview ? timeline.projectedBoard : board?.data;
    if (!board || !data) return null;
    return <ControlTable key={board.id} boardId={board.id} project={board.title || board.fileName} data={data} readOnly={!board.handle || Boolean(timeline?.isPreview)} />;
}

function ControlTable({ boardId, project, data, readOnly }: { boardId: string; project: string; data: BoardData; readOnly: boolean }) {
    const { t } = useI18n();
    const [kind, setKind] = useState<ControlKind>('risks');
    return <section className="portfolio-control portfolio-table" aria-label={t('control.view')}>
        <div role="tablist" className="control-tabs table-view-options" aria-label={t('control.view')}>{CONTROL_KINDS.map(value => <button key={value} type="button" className={`btn${kind === value ? ' active' : ''}`} role="tab" id={`control-${value}-tab`} aria-controls="control-table-panel" aria-selected={kind === value} tabIndex={kind === value ? 0 : -1}
            onKeyDown={event => navigateControlTabs(event, CONTROL_KINDS, value, setKind)} onClick={() => setKind(value)}>{t(`control.${value}`)}</button>)}</div>
        <ControlRecordTable key={kind} boardId={boardId} project={project} data={data} kind={kind} readOnly={readOnly} />
    </section>;
}

function ControlRecordTable({ boardId, project, data, kind, readOnly }: { boardId: string; project: string; data: BoardData; kind: ControlKind; readOnly: boolean }) {
    const { t, language } = useI18n();
    const today = useLocalToday();
    const scope = `control-${kind}`;
    const preferenceScope = `${data.extensions.project?.id || boardId}.${scope}`;
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [sort, setSort] = useState<{ key: ControlColumn; desc: boolean }>({ key: 'id', desc: false });
    const [columns, setColumns] = useState(() => normalizeControlColumns(kind, readTableColumnPreferences(preferenceScope) ?? readTableColumnPreferences(scope)));
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const records = useMemo(() => controlRecords(data).filter(record => record.kind === kind), [data, kind]);
    const elements = projectElementOptions(data);
    const label = (key: ControlColumn | string) => key === 'assignees' || key === 'tags' ? t(`task.${key}`) : t(`control.${key}` as TranslationKey);
    const setFilter = (key: string, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(0); };
    const clearFilters = () => { setFilters({}); setPage(0); };
    const clearQuery = () => { clearFilters(); setSearch(''); };
    const choices = (key: keyof ControlRecord) => [...new Set(records.map(record => String(record[key])).filter(Boolean))].sort();
    const field = (key: string, options: { value: string; label: string }[], inputType?: 'date'): AdditionalPortfolioFilter => ({
        key, id: `${scope}-filter-${key}`, label: label(key), value: filters[key] || '', changed: Boolean(filters[key]),
        options: [{ value: '', label: t('common.all') }, ...options], inputType,
        onChange: value => setFilter(key, String(value)), reset: () => setFilter(key, '')
    });
    const textField = (key: keyof ControlRecord) => field(key, choices(key).map(value => ({ value, label: value })));
    const fields = [
        field('status', CONTROL_STATUSES[kind].map(value => ({ value, label: label(value) }))), textField('owner'),
        field('related', elements.map(element => ({ value: `${element.key}:${element.id}`, label: `${label(element.key)} · ${element.label}` }))),
        ...(kind === 'risks' ? ['probability', 'impact', 'riskLevel'].map(key => field(key, ASSESSMENTS.map(value => ({ value, label: label(value) })))) : []),
        ...(kind === 'decisions' ? [textField('decisionMaker'), field('decisionDate', [], 'date')] : []),
        ...(kind === 'deliverables' ? [textField('validator'), field('dueDate', [], 'date')] : []),
        ...['pending', ...(kind === 'deliverables' ? ['overdue', 'awaitingAcceptance'] : [])].map(key => field(key, [{ value: 'yes', label: t('common.yes') }]))
    ];
    const active = fields.filter(entry => entry.changed);
    const shown = useMemo(() => sortControlRecords(filterControlRecords(records, search, filters, today, data), sort.key, sort.desc, data, language), [records, search, filters, today, data, sort, language]);
    const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
    const currentPage = Math.min(page, pageCount - 1);
    const pageRows = shown.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
    const selectedCount = records.filter(record => selected.has(record.id)).length;
    const allPageSelected = pageRows.length > 0 && pageRows.every(record => selected.has(record.id));
    const open = (record?: ControlRecord, event?: MouseEvent<HTMLElement>) => {
        const target = event?.currentTarget;
        (target?.matches('button') ? target : target?.querySelector<HTMLButtonElement>('.table-item-link'))?.focus({ preventScroll: true });
        openDialog('projectControl', { boardId, recordId: record?.id, kind });
    };
    const toggleSelection = (ids: string[], checked: boolean) => setSelected(previous => {
        const next = new Set(previous);
        ids.forEach(id => { if (checked) next.add(id); else next.delete(id); });
        return next;
    });
    const changeColumns = (next: ControlColumn[]) => {
        const normalized = normalizeControlColumns(kind, next);
        setColumns(normalized);
        saveTableColumnPreferences(normalized, preferenceScope);
    };
    const cellText = (record: ControlRecord, column: ControlColumn) => {
        const value = controlCellValue(record, column, data);
        if (!value) return t('table.notDefined');
        if (['status', 'probability', 'impact', 'riskLevel'].includes(column)) return label(value);
        if (column.endsWith('Date')) return formatDate(value);
        if (column === 'createdAt' || column === 'updatedAt') return formatTableTimestamp(value) || t('table.notDefined');
        return value;
    };
    async function exportCsv() {
        const separator = await showChoice<',' | ';'>(t('table.separatorHint'), [
            { value: ',', label: t('table.comma') }, { value: ';', label: t('table.semicolon') }
        ], { title: t('table.export'), selectionLabel: t('table.separator'), requiredSelection: true });
        if (separator === null) return;
        const csv = buildCsv([columns.map(label), ...shown.map(record => columns.map(column => cellText(record, column)))], separator);
        const name = project.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'project';
        downloadCsv(csv, `${name}-${kind}.csv`);
    }
    const hintId = `${scope}-hint`;
    return <div className="table-panel" role="tabpanel" id="control-table-panel" aria-labelledby={`control-${kind}-tab`}>
        <div className="table-heading">
            <div className="table-counts">
                <p role="status" aria-live="polite">{t('control.visibleCount', { visible: shown.length, total: records.length })}</p>
                {selectedCount > 0 && <span role="status">{t('table.selected', { count: selectedCount })}</span>}
                {selectedCount > 0 && <button className="btn-text" type="button" onClick={() => setSelected(new Set())}>{t('table.clearSelection')}</button>}
            </div>
            <div className="table-tools">
                <div className="portfolio-query-fields">
                    <div className="portfolio-query-controls">
                        <div className="section-search"><WorkspaceIcon name="search" />
                            <input id={`${scope}-search`} type="search" aria-label={t('control.search')} placeholder={t('control.search')} value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
                            {search && <button className="section-search-clear" type="button" aria-label={t('palette.clearSearch')} title={t('palette.clearSearch')} onClick={() => { setSearch(''); setPage(0); }}><WorkspaceIcon name="close" /></button>}
                        </div>
                        <FilterMenu scope={scope} fields={fields} activeCount={active.length} onClear={clearFilters} iconOnly dismissOnBlur />
                    </div>
                    <ActiveFilterTags fields={active} onClear={clearFilters} scope={scope} />
                </div>
                <TableColumnMenu columns={columns} available={CONTROL_TABLE_COLUMNS[kind]} defaults={DEFAULT_CONTROL_COLUMNS[kind]} required={['id', 'title']} label={label} onChange={changeColumns} scope={scope} />
                <button className="btn icon-btn" type="button" id={`tableExportCsv-${scope}`} aria-label={t('table.export')} title={t('table.export')} disabled={!shown.length} onClick={() => void exportCsv()}><WorkspaceIcon name="export" /></button>
                <div className="table-management-actions"><span className="toolbar-divider" aria-hidden="true" />
                    <button className="btn btn-primary icon-btn" type="button" id={`tableCreateRecord-${scope}`} aria-label={t('control.new')} title={t('control.new')} disabled={readOnly} onClick={() => open()}><WorkspaceIcon name="plus" /></button>
                </div>
            </div>
        </div>
        <p className="sr-only" id={hintId}>{t(kind === 'risks' ? 'control.riskRule' : kind === 'deliverables' ? 'control.acceptanceGate' : 'control.selectRecords')}</p>
        {!shown.length ? <div role="status" className="table-empty control-empty"><p>{t('control.empty')}</p>
            {(search || active.length > 0) && <button type="button" className="btn" onClick={clearQuery}>{t('control.clear')}</button>}
        </div> : <>
            <div className="table-scroll control-table-scroll" tabIndex={0} role="region" aria-label={t(`control.${kind}`)} aria-describedby={hintId}>
                <table className="workitems-table control-table">
                    <caption className="sr-only">{project} · {t(`control.${kind}`)}</caption>
                    <thead><tr>
                        <th scope="col"><input type="checkbox" aria-label={t('table.selectPage')} checked={allPageSelected} onChange={event => toggleSelection(pageRows.map(record => record.id), event.target.checked)} /></th>
                        {columns.map(column => <th scope="col" key={column} data-column={column} aria-sort={sort.key === column ? sort.desc ? 'descending' : 'ascending' : 'none'}>
                            <button type="button" onClick={() => { setSort({ key: column, desc: sort.key === column && !sort.desc }); setPage(0); }}>{label(column)}<span aria-hidden="true"><WorkspaceIcon name={sort.key === column ? sort.desc ? 'arrowDown' : 'arrowUp' : 'sort'} size={12} /><span className="sr-only">{sort.key === column ? sort.desc ? ' ↓' : ' ↑' : ' ↕'}</span></span></button>
                        </th>)}
                    </tr></thead>
                    <tbody>{pageRows.map(record => <tr key={record.id} data-control-id={record.id} onClick={event => { if (!(event.target as HTMLElement).closest('button,input,a,label')) open(record, event); }}>
                        <td><input type="checkbox" aria-label={t('task.select', { title: record.title })} checked={selected.has(record.id)} onChange={event => toggleSelection([record.id], event.target.checked)} /></td>
                        {columns.map(column => <td key={column} data-column={column}>
                            {column === 'id' || column === 'title' ? <button className="table-item-link" type="button" title={cellText(record, column)} onClick={event => open(record, event)}>{cellText(record, column)}</button>
                                : ['status', 'probability', 'impact', 'riskLevel'].includes(column) ? <ControlBadge value={controlCellValue(record, column, data)} />
                                : <span className={`table-cell-text${!controlCellValue(record, column, data) ? ' table-not-defined' : ''}`} title={cellText(record, column)}>{cellText(record, column)}</span>}
                            {column === 'dueDate' && record.dueDate && record.dueDate < today && controlPending(record) && <small className="control-overdue">{t('control.overdue')}</small>}
                        </td>)}
                    </tr>)}</tbody>
                </table>
            </div>
            <TablePagination page={currentPage} pageCount={pageCount} pageSize={pageSize} scope={scope} onPage={setPage} onPageSize={size => { setPageSize(size); setPage(0); }} />
        </>}
    </div>;
}
