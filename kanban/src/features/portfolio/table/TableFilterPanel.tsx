import { useEffect } from 'react';
import type { BoardData, Priority, TaskStatus } from '@/domain/types';
import { createEmptyRoadmapExtension, getRoadmapExtension } from '@/domain/roadmap';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import { OPEN_FILTERS_EVENT } from '@/features/portfolio/palette/openCommandPalette';
import { DEFAULT_TABLE_FILTERS, type TableFilters } from './tableModel';
import { useTableDisclosure } from './useTableDisclosure';

const STATUS_LABELS: Record<TaskStatus, TranslationKey> = {
    backlog: 'board.backlog', 'to-do': 'board.toDo', doing: 'board.doing', done: 'board.done'
};
export const PRIORITY_LABELS: Record<Priority, TranslationKey> = {
    high: 'toolbar.high', medium: 'toolbar.medium', low: 'toolbar.low'
};

export function TableFilterPanel({ filters, boardData, assignees, hidden, onChange, onClear }: {
    filters: TableFilters;
    boardData: BoardData;
    assignees: string[];
    hidden: boolean;
    onChange: <K extends keyof TableFilters>(key: K, value: TableFilters[K]) => void;
    onClear: () => void;
}) {
    const { t } = useI18n();
    const { detailsRef, summaryRef, close, onKeyDown, onToggle } = useTableDisclosure(hidden);
    const roadmap = getRoadmapExtension(boardData) || createEmptyRoadmapExtension();
    const activeCount = (Object.keys(filters) as (keyof TableFilters)[]).filter((key) => (
        key !== 'search' && (key === 'statuses' ? filters.statuses.length > 0 : filters[key] !== DEFAULT_TABLE_FILTERS[key])
    )).length;

    useEffect(() => {
        if (hidden) return;
        const open = () => {
            if (detailsRef.current) {
                detailsRef.current.open = true;
                detailsRef.current.querySelector('select')?.focus();
            }
        };
        window.addEventListener(OPEN_FILTERS_EVENT, open);
        return () => window.removeEventListener(OPEN_FILTERS_EVENT, open);
    }, [hidden, detailsRef]);

    return <details id="tableFilters" className="table-filters-menu" ref={detailsRef} onKeyDown={onKeyDown} onToggle={onToggle}>
        <summary className={`btn portfolio-filters-btn${activeCount ? ' has-active' : ''}`} ref={summaryRef}>
            <svg className="portfolio-filters-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 3h12l-4.5 5.5V13l-3-1.5v-3z" /></svg>
            {t('toolbar.filtersButton')}
            {activeCount > 0 && <span className="portfolio-filters-badge">{activeCount}</span>}
        </summary>
        <div className="table-filter-panel portfolio-filters-panel" data-table-panel role="group" aria-label={t('toolbar.filters')}>
            <div className="portfolio-filters-panel-head">
                <h3>{t('toolbar.filtersButton')}</h3>
                <button className="btn-text" type="button" onClick={onClear}>{t('toolbar.resetShort')}</button>
            </div>
            <div className="table-filters portfolio-filters-panel-body">
                <label className="table-filter-field" htmlFor="tableArchive">{t('toolbar.archive').replace(/:$/, '')}
                    <select id="tableArchive" value={filters.archive} onChange={(event) => onChange('archive', event.target.value as TableFilters['archive'])}>
                        <option value="active">{t('toolbar.activeOnly')}</option><option value="all">{t('toolbar.activeAndArchived')}</option><option value="archived">{t('toolbar.archivedOnly')}</option>
                    </select>
                </label>
                <TableSelect id="tableAssignee" label={t('task.assignees')} value={filters.assignee} options={assignees.map((name) => ({ value: name, label: name }))} onChange={(value) => onChange('assignee', value)} />
                <TableSelect id="tablePriority" label={t('task.priority')} value={filters.priority} options={(Object.keys(PRIORITY_LABELS) as Priority[]).map((priority) => ({ value: priority, label: t(PRIORITY_LABELS[priority]) }))} onChange={(value) => onChange('priority', value)} />
                <TableSelect id="tablePhase" label={t('task.phase')} value={filters.phaseId} options={roadmap.phases.map((item) => ({ value: item.id, label: item.title }))} onChange={(value) => onChange('phaseId', value)} />
                <TableSelect id="tableMilestone" label={t('task.milestone')} value={filters.milestoneId} options={roadmap.milestones.map((item) => ({ value: item.id, label: item.title }))} onChange={(value) => onChange('milestoneId', value)} />
                <TableSelect id="tableSprint" label={t('task.sprint')} value={filters.sprintId} options={roadmap.sprints.map((item) => ({ value: item.id, label: item.title }))} onChange={(value) => onChange('sprintId', value)} />
                <label className="table-filter-field" htmlFor="tableBlocked">{t('task.blocked')}
                    <select id="tableBlocked" value={filters.blocked} onChange={(event) => onChange('blocked', event.target.value as TableFilters['blocked'])}>
                        <option value="all">{t('common.all')}</option><option value="blocked">{t('common.yes')}</option><option value="unblocked">{t('common.no')}</option>
                    </select>
                </label>
                <label className="table-filter-field table-status-field" htmlFor="tableStatuses">{t('task.status')}
                    <select id="tableStatuses" multiple size={4} value={filters.statuses} aria-describedby="tableStatusesHint"
                        onChange={(event) => onChange('statuses', Array.from(event.target.selectedOptions, (option) => option.value as TaskStatus))}>
                        {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((status) => <option key={status} value={status}>{t(STATUS_LABELS[status])}</option>)}
                    </select>
                    <span id="tableStatusesHint" className="table-filter-hint">{t('table.selectStatuses')}</span>
                </label>
            </div>
            <div className="portfolio-filters-panel-foot">
                <span role="status">{activeCount === 0 ? t('toolbar.noFiltersActive') : t(activeCount === 1 ? 'toolbar.filtersActiveCount' : 'toolbar.filtersActiveCountPlural', { count: activeCount })}</span>
                <button className="btn" type="button" onClick={close}>{t('toolbar.done')}</button>
            </div>
        </div>
    </details>;
}

function TableSelect({ id, label, value, options, onChange }: {
    id: string; label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
}) {
    const { t } = useI18n();
    return <label className="table-filter-field" htmlFor={id}>{label}<select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t('common.all')}</option>
        {value && !options.some((option) => option.value === value) && <option value={value}>{value}</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>;
}
