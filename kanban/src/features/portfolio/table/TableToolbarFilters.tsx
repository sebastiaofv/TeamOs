import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EFFORT_BUCKETS } from '@/domain/constants';
import { getRoadmapExtension, createEmptyRoadmapExtension } from '@/domain/roadmap';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { FilterMenu, type FilterMenuField } from '@/features/portfolio/shell/PortfolioFilterMenu';
import { useI18n } from '@/shared/i18n';
import { clearTableFilters, setTableFilter } from './tableControls';
import { DEFAULT_TABLE_FILTERS, type TableFilters } from './tableModel';
import { STATUS_LABELS, PRIORITY_LABELS } from './tableLabels';
import { WORKITEM_TYPES } from '@/domain/workitems';
import { getProjectInfo } from '@/domain/project';
import { getTaskWorkflow } from '@/domain/workflow';

function useTableFilterFields() {
    const { t } = useI18n();
    const state = useAppStore(useShallow((s) => ({
        portfolioBoards: s.portfolioBoards,
        selectedPortfolioBoardId: s.selectedPortfolioBoardId,
        portfolioTimelineSelection: s.portfolioTimelineSelection,
        workContext: s.selectedWorkContext,
        filters: s.portfolioTableFiltersByBoardId[s.selectedPortfolioBoardId] || DEFAULT_TABLE_FILTERS
    })));
    const { portfolioBoards, selectedPortfolioBoardId, portfolioTimelineSelection, filters } = state;
    const boardData = useMemo(() => {
        const timeline = getSelectedPortfolioTimelineView({ portfolioBoards, selectedPortfolioBoardId, portfolioTimelineSelection });
        return timeline?.isPreview ? timeline.projectedBoard : portfolioBoards.find((board) => board.id === selectedPortfolioBoardId)?.data;
    }, [portfolioBoards, selectedPortfolioBoardId, portfolioTimelineSelection]);
    const assignees = useMemo(() => [...new Set((boardData?.board.tasks || []).flatMap((task) => task.assignees))].sort((a, b) => a.localeCompare(b)), [boardData]);
    const roadmap = getRoadmapExtension(boardData) || createEmptyRoadmapExtension();
    const all = { value: '', label: t('common.all') };

    function field<K extends Exclude<keyof TableFilters, 'search'>>(
        key: K, label: string, id: string, options: { value: string; label: string }[], multiple = false, hint?: string
    ): FilterMenuField & { key: K } {
        return {
            key, id, label: label.replace(/:$/, ''), options, value: filters[key] ?? '', multiple, hint,
            changed: key === 'statuses' ? filters.statuses.length > 0 : filters[key] !== DEFAULT_TABLE_FILTERS[key],
            onChange: (value) => setTableFilter(key, value as TableFilters[K])
        };
    }

    // Keep the original fields and order; story-specific fields use that same layout.
    const fields = [
        field('workitemType', t('workitem.type'), 'tableType', [all, ...WORKITEM_TYPES.map((value) => ({ value, label: t(`workitem.${value}`) }))]),
        field('archive', t('toolbar.archive'), 'tableArchive', [
            { value: 'active', label: t('toolbar.activeOnly') }, { value: 'all', label: t('toolbar.activeAndArchived') }, { value: 'archived', label: t('toolbar.archivedOnly') }
        ]),
        field('blocked', t('toolbar.blocked'), 'tableBlocked', [
            { value: 'all', label: t('common.all') }, { value: 'blocked', label: t('toolbar.blockedOnly') }, { value: 'unblocked', label: t('toolbar.unblockedOnly') }
        ]),
        field('assignee', t('toolbar.assignee'), 'tableAssignee', [all, ...assignees.map((name) => ({ value: name, label: name })), ...(boardData ? getProjectInfo(boardData).team.map((member) => ({ value: member.id, label: `${member.name} · ${member.id}` })) : [])]),
        field('priority', t('toolbar.priority'), 'tablePriority', [all, ...Object.entries(PRIORITY_LABELS).map(([value, key]) => ({ value, label: t(key) }))]),
        field('effort', t('toolbar.effort'), 'tableEffort', [all, ...EFFORT_BUCKETS.map((value) => ({ value, label: value }))]),
        field('statuses', t('task.status'), 'tableStatuses', (boardData ? getTaskWorkflow(boardData, { workContext: state.workContext }).states : []).map((column) => ({ value: column.id, label: STATUS_LABELS[column.id] && !boardData?.extensions.workflow && state.workContext !== 'maintenance' ? t(STATUS_LABELS[column.id]) : column.name })), true, t('table.selectStatuses')),
        field('phaseId', t('task.phase'), 'tablePhase', [all, ...roadmap.phases.map((item) => ({ value: item.id, label: item.title }))]),
        field('milestoneId', t('task.milestone'), 'tableMilestone', [all, ...roadmap.milestones.map((item) => ({ value: item.id, label: item.title }))]),
        field('sprintId', t('task.sprint'), 'tableSprint', [all, ...roadmap.sprints.map((item) => ({ value: item.id, label: item.title }))])
    ];
    return { fields, active: fields.filter((entry) => entry.changed), t };
}

export function TableToolbarFilters() {
    const { fields, active } = useTableFilterFields();
    return <FilterMenu fields={fields} activeCount={active.length} onClear={() => clearTableFilters(true)} panelClassName="table-filter-options" dismissOnBlur />;
}

export function TableActiveFilters() {
    const { active, t } = useTableFilterFields();
    if (!active.length) return null;
    return <div className="portfolio-active-filters" id="portfolioActiveFilters" role="group" aria-label={t('toolbar.activeFilters')}>
        {active.map((field) => {
            const values = Array.isArray(field.value) ? field.value : [field.value];
            const label = field.options.filter((option) => values.includes(option.value)).map((option) => option.label).join(', ') || values.join(', ');
            return <span className="portfolio-active-filter" key={field.id} data-filter={field.key}>
                <span className="portfolio-active-filter-name">{field.label}</span><span>{label}</span>
                <button type="button" aria-label={t('toolbar.removeFilter', { label: field.label, value: label })}
                    onClick={() => setTableFilter(field.key, field.key === 'statuses' ? [] : DEFAULT_TABLE_FILTERS[field.key])}>×</button>
            </span>;
        })}
        <button className="btn-text" id="tableClearFilters" type="button" onClick={() => clearTableFilters()}>{t('toolbar.clearAllFilters')}</button>
    </div>;
}
