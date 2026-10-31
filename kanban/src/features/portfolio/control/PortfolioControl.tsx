import { navigateControlTabs } from './controlTabNavigation';
import { useState } from 'react';
import { CONTROL_KINDS, CONTROL_STATUSES, ASSESSMENTS, controlPending, controlRecords, riskLevel, type ControlKind, type ControlRecord } from '@/domain/projectControl';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries/portfolioTimelineViews';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import { useLocalToday } from '@/shared/hooks/useLocalToday';
import { openDialog } from '@/app/overlays/dialogs';
import { projectElementOptions } from './ControlRelated';

type SortKey = 'id' | 'title' | 'status' | 'owner' | 'probability' | 'impact' | 'riskLevel' | 'decisionMaker' | 'decisionDate' | 'validator' | 'dueDate';
export function PortfolioControl({ hidden }: { hidden: boolean }) {
    const state = useAppStore();
    const timeline = getSelectedPortfolioTimelineView(state);
    const board = state.portfolioBoards.find((item) => item.id === state.selectedPortfolioBoardId);
    const data = timeline?.isPreview ? timeline.projectedBoard : board?.data;
    if (hidden || !board || !data) return null;
    return <ControlTable key={board.id} boardId={board.id} data={data} readOnly={!board.handle || Boolean(timeline?.isPreview)} />;
}
function ControlTable({ boardId, data, readOnly }: { boardId: string; data: NonNullable<ReturnType<typeof getSelectedPortfolioTimelineView>>['boardRecord']['data']; readOnly: boolean }) {
    const { t, language } = useI18n();
    const today = useLocalToday();
    const [kind, setKind] = useState<ControlKind>('risks');
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'id', desc: false });
    const records = controlRecords(data).filter((record) => record.kind === kind);
    const elements = projectElementOptions(data);
    const setFilter = (key: string, value: string) => setFilters((current) => ({ ...current, [key]: value }));
    const choices = (key: keyof ControlRecord) => [...new Set(records.map((record) => String(record[key])).filter(Boolean))].sort();
    const filter = (key: string, values: { value: string; label: string }[]) => <label key={key}>{t(`control.${key}` as TranslationKey)}<select aria-label={t(`control.${key}` as TranslationKey)} value={filters[key] || ''} onChange={(event) => setFilter(key, event.target.value)}><option value="">{t('control.all')}</option>{values.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>;
    const textFilter = (key: keyof ControlRecord) => filter(key, choices(key).map((value) => ({ value, label: value })));
    const assessmentFilter = (key: string) => filter(key, ASSESSMENTS.map((value) => ({ value, label: t(`control.${value}`) })));
    const valueOf = (record: ControlRecord, key: SortKey) => key === 'riskLevel' ? riskLevel(record) : record[key];
    const shown = records.filter((record) => {
        if (!`${record.id} ${record.title}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) return false;
        for (const [key, value] of Object.entries(filters)) {
            if (!value) continue;
            if (key === 'pending' && !controlPending(record)) return false;
            else if (key === 'overdue' && !(record.dueDate && record.dueDate < today && controlPending(record))) return false;
            else if (key === 'awaitingAcceptance' && record.status !== 'delivered') return false;
            else if (key === 'related' && !elements.some((element) => `${element.key}:${element.id}` === value && (record.related[element.key] as (number | string)[]).includes(element.id))) return false;
            else if (key === 'riskLevel' && riskLevel(record) !== value) return false;
            else if (key in record && String(record[key as keyof ControlRecord]) !== value) return false;
        }
        return true;
    }).sort((a, b) => {
        const x = valueOf(a, sort.key), y = valueOf(b, sort.key);
        const diff = ['probability', 'impact', 'riskLevel'].includes(sort.key) ? ASSESSMENTS.indexOf(x as typeof ASSESSMENTS[number]) - ASSESSMENTS.indexOf(y as typeof ASSESSMENTS[number]) : String(x).localeCompare(String(y), language, { numeric: true });
        return (diff || a.id.localeCompare(b.id, language, { numeric: true })) * (sort.desc ? -1 : 1);
    });
    const columns: SortKey[] = ['id', 'title', 'status', 'owner', ...(kind === 'risks' ? ['probability', 'impact', 'riskLevel'] as SortKey[] : kind === 'decisions' ? ['decisionMaker', 'decisionDate'] as SortKey[] : ['validator'] as SortKey[]), 'dueDate'];
    const open = (record?: ControlRecord) => openDialog('projectControl', { boardId, recordId: record?.id, kind });
    return <section className="portfolio-control portfolio-table" aria-label={t('control.view')}>
        <div className="table-heading"><h2>{t('control.view')}</h2><button type="button" className="btn btn-primary" disabled={readOnly} onClick={() => open()}>{t('control.new')}</button></div>
        <div role="tablist" className="control-tabs" aria-label={t('control.view')}>{CONTROL_KINDS.map((value) => <button key={value} type="button" className={`btn${kind === value ? ' active' : ''}`} role="tab" id={`control-${value}-tab`} aria-controls="control-table-panel" aria-selected={kind === value} tabIndex={kind === value ? 0 : -1} onKeyDown={(event) => navigateControlTabs(event, CONTROL_KINDS, value, (next) => { setKind(next); setFilters({}); setSearch(''); setSort({ key: 'id', desc: false }); })} onClick={() => { setKind(value); setFilters({}); setSearch(''); setSort({ key: 'id', desc: false }); }}>{t(`control.${value}`)}</button>)}</div>
        <div role="tabpanel" id="control-table-panel" aria-labelledby={`control-${kind}-tab`}>
            <div className="control-filters"><label>{t('control.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                {filter('status', CONTROL_STATUSES[kind].map((value) => ({ value, label: t(`control.${value}`) })))}{textFilter('owner')}
                {filter('related', elements.map((element) => ({ value: `${element.key}:${element.id}`, label: `${t(`control.${element.key}`)} · ${element.label}` })))}
                {kind === 'risks' && <>{assessmentFilter('probability')}{assessmentFilter('impact')}{assessmentFilter('riskLevel')}</>}
                {kind === 'decisions' && <>{textFilter('decisionMaker')}<label>{t('control.decisionDate')}<input type="date" value={filters.decisionDate || ''} onChange={(event) => setFilter('decisionDate', event.target.value)} /></label></>}
                {kind === 'deliverables' && <>{textFilter('validator')}<label>{t('control.dueDate')}<input type="date" value={filters.dueDate || ''} onChange={(event) => setFilter('dueDate', event.target.value)} /></label></>}
                {(['pending', ...(kind === 'deliverables' ? ['overdue', 'awaitingAcceptance'] : [])]).map((key) => <label className="control-check" key={key}><input type="checkbox" checked={Boolean(filters[key])} onChange={(event) => setFilter(key, event.target.checked ? 'yes' : '')} />{t(`control.${key}` as TranslationKey)}</label>)}
                <button type="button" className="btn" onClick={() => { setSearch(''); setFilters({}); }}>{t('control.clear')}</button>
            </div>
            <p className="field-hint">{t(kind === 'risks' ? 'control.riskRule' : kind === 'deliverables' ? 'control.acceptanceGate' : 'control.selectRecords')}</p>
            <p aria-live="polite">{shown.length} / {records.length}</p>
            {!shown.length ? <p role="status" className="control-empty">{t('control.empty')}</p> : <div className="control-table-scroll"><table className="control-table"><thead><tr>{columns.map((key) => <th key={key} aria-sort={sort.key === key ? sort.desc ? 'descending' : 'ascending' : 'none'}><button type="button" onClick={() => setSort({ key, desc: sort.key === key && !sort.desc })}>{t(`control.${key}`)}{sort.key === key ? sort.desc ? ' ↓' : ' ↑' : ''}</button></th>)}<th>{t('control.related')}</th></tr></thead><tbody>{shown.map((record) => <tr key={record.id}>{columns.map((key) => <td key={key}>{key === 'title' || key === 'id' ? <button className="control-link" type="button" onClick={() => open(record)}>{record[key]}</button> : ['status', 'probability', 'impact', 'riskLevel'].includes(key) ? <span className={key === 'riskLevel' ? `control-risk ${riskLevel(record)}` : ''}>{t(`control.${valueOf(record, key)}` as TranslationKey)}</span> : valueOf(record, key) || '—'}{key === 'status' && controlPending(record) && <small className="control-pending">{t('control.pending')}</small>}{key === 'dueDate' && record.dueDate && record.dueDate < today && controlPending(record) && <small className="control-overdue">{t('control.overdue')}</small>}{key === 'status' && record.status === 'delivered' && <small>{t('control.awaitingAcceptance')}</small>}</td>)}<td>{elements.filter((element) => (record.related[element.key] as (number | string)[]).includes(element.id)).map((element) => <span className="control-related-tag" key={`${element.key}:${element.id}`}>{element.label}</span>)}</td></tr>)}</tbody></table></div>}
        </div>
    </section>;
}
