import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EFFORT_BUCKETS } from '@/domain/constants';
import { getRoadmapExtension } from '@/domain/roadmap';
import { normalizeAssignee, taskAssignees } from '@/domain/task';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { FilterMenu, type FilterMenuField } from '@/features/portfolio/shell/PortfolioFilterMenu';
import { useI18n } from '@/shared/i18n';
import { clearPortfolioFilters, setPortfolioFilter } from '@/features/portfolio/commands/portfolioControls';
import { DEFAULT_PORTFOLIO_FILTERS, type PanelPortfolioFilterName } from '@/domain/portfolioFilters';
import { PRIORITY_LABELS } from '@/features/portfolio/table/tableLabels';
import { getWorkflow } from '@/domain/workflow';
import { NO_PERSON_FILTER, personFilterName, personNameFilter } from '@/domain/peopleFilters';

function usePortfolioFilterFields() {
    const { t } = useI18n();
    const state = useAppStore(useShallow((s) => ({
        portfolioBoards: s.portfolioBoards,
        selectedPortfolioBoardId: s.selectedPortfolioBoardId,
        portfolioTimelineSelection: s.portfolioTimelineSelection,
        filters: s.portfolioFilters
    })));
    const { portfolioBoards, selectedPortfolioBoardId, portfolioTimelineSelection, filters } = state;
    const sources = useMemo(() => {
        const timeline = getSelectedPortfolioTimelineView({ portfolioBoards, selectedPortfolioBoardId, portfolioTimelineSelection });
        return portfolioBoards.filter((board) => !selectedPortfolioBoardId || board.id === selectedPortfolioBoardId)
            .map((board) => ({ board, data: timeline?.isPreview && timeline.boardRecord.id === board.id ? timeline.projectedBoard : board.data }));
    }, [portfolioBoards, selectedPortfolioBoardId, portfolioTimelineSelection]);
    const assignees = useMemo(() => {
        const names = new Map<string, string>();
        sources.forEach(({ data }) => data?.board.tasks.forEach((task) => taskAssignees(task).forEach((value) => {
            const name = normalizeAssignee(value);
            if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
        })));
        return [...names.values()].sort((a, b) => a.localeCompare(b));
    }, [sources]);
    const all = { value: '', label: t('common.all') };
    function roadmapOptions(kind: 'phases' | 'milestones' | 'sprints') {
        const options = new Map<string, { value: string; label: string }>();
        sources.forEach(({ board, data }) => getRoadmapExtension(data)?.[kind].forEach((item) => {
            if (!options.has(item.id)) options.set(item.id, {
                value: item.id, label: sources.length > 1 ? `${item.title} — ${board.title || board.fileName}` : item.title
            });
        }));
        return [all, ...options.values()];
    }

    function field<K extends PanelPortfolioFilterName>(
        key: K, label: string, id: string, options: { value: string; label: string }[], multiple = false, hint?: string
    ): FilterMenuField & { key: K } {
        const selected = filters[key];
        // An assignment edit can remove the last occurrence of a filtered name.
        // Keep that explicit filter visible rather than displaying "All".
        if ((key === 'assignee' || key === 'responsible') && typeof selected === 'string' && selected
            && !options.some((option) => option.value === selected)) options = [...options, { value: selected, label: personFilterName(selected) }];
        return {
            key, id, label: label.replace(/:$/, ''), options, value: filters[key], multiple, hint,
            changed: key === 'statuses' ? filters.statuses.length > 0 : filters[key] !== DEFAULT_PORTFOLIO_FILTERS[key],
            onChange: (value) => setPortfolioFilter(key, value)
        };
    }

    // Every view shares this field list, order, options and session state.
    const fields = [
        field('archive', t('toolbar.archive'), 'portfolioArchiveFilter', [
            { value: 'active', label: t('toolbar.activeOnly') }, { value: 'all', label: t('toolbar.activeAndArchived') }, { value: 'archived', label: t('toolbar.archivedOnly') }
        ]),
        field('blocked', t('toolbar.blocked'), 'portfolioBlockedFilter', [
            { value: 'all', label: t('common.all') }, { value: 'blocked', label: t('toolbar.blockedOnly') }, { value: 'unblocked', label: t('toolbar.unblockedOnly') }
        ]),
        field('responsible', t('task.responsible'), 'portfolioResponsibleFilter', [all, { value: NO_PERSON_FILTER, label: t('task.noResponsible') }, ...assignees.map((name) => ({ value: personNameFilter(name), label: name }))]),
        field('assignee', t('toolbar.participant'), 'portfolioAssigneeFilter', [all, { value: NO_PERSON_FILTER, label: t('task.noParticipants') }, ...assignees.map((name) => ({ value: personNameFilter(name), label: name }))]),
        field('priority', t('toolbar.priority'), 'portfolioPriorityFilter', [all, ...Object.entries(PRIORITY_LABELS).map(([value, key]) => ({ value, label: t(key) }))]),
        field('effort', t('toolbar.effort'), 'portfolioEffortFilter', [all, ...EFFORT_BUCKETS.map((value) => ({ value, label: value }))]),
        field('statuses', t('task.status'), 'portfolioStatusesFilter', [...new Map(sources.flatMap(({ data }) => getWorkflow(data).states.map((s) => [s.id, { value: s.id, label: s.name }] as const))).values()], true, t('table.selectStatuses')),
        field('phaseId', t('task.phase'), 'portfolioPhaseFilter', roadmapOptions('phases')),
        field('milestoneId', t('task.milestone'), 'portfolioMilestoneFilter', roadmapOptions('milestones')),
        field('sprintId', t('task.sprint'), 'portfolioSprintFilter', roadmapOptions('sprints'))
    ];
    return { fields, active: fields.filter((entry) => entry.changed), t };
}

export function PortfolioToolbarFilters() {
    const { fields, active } = usePortfolioFilterFields();
    return <FilterMenu fields={fields} activeCount={active.length} onClear={clearPortfolioFilters} panelClassName="portfolio-filter-options" dismissOnBlur />;
}

export function PortfolioActiveFilters() {
    const { active, t } = usePortfolioFilterFields();
    if (!active.length) return null;
    return <div className="portfolio-active-filters" id="portfolioActiveFilters" role="group" aria-label={t('toolbar.activeFilters')}>
        {active.map((field) => {
            const values = Array.isArray(field.value) ? field.value : [field.value];
            const label = field.options.filter((option) => values.includes(option.value)).map((option) => option.label).join(', ') || values.join(', ');
            return <span className="portfolio-active-filter" key={field.id} data-filter={field.key}>
                <span className="portfolio-active-filter-name">{field.label}</span><span>{label}</span>
                <button type="button" aria-label={t('toolbar.removeFilter', { label: field.label, value: label })}
                    onClick={() => setPortfolioFilter(field.key, DEFAULT_PORTFOLIO_FILTERS[field.key])}>×</button>
            </span>;
        })}
        <button className="btn-text" id="portfolioClearFilters" type="button" onClick={clearPortfolioFilters}>{t('toolbar.clearAllFilters')}</button>
    </div>;
}
