import type { WorkflowKind } from '@/domain/types';
import { BoardColumnOptions } from '@/features/portfolio/board/BoardColumnOptions';
import { PortfolioSortControl } from '@/features/portfolio/board/BoardSortControl';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EFFORT_BUCKETS } from '@/domain/constants';
import { getRoadmapExtension } from '@/domain/roadmap';
import { normalizeAssignee, taskAssignees } from '@/domain/task';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { FilterMenu, type FilterMenuField } from '@/features/portfolio/shell/PortfolioFilterMenu';
import { useI18n } from '@/shared/i18n';
import { useQueryFilters } from './QueryFilterContext';
import { workitemType } from '@/domain/workitems';
import { workitemLabel } from '@/domain/taskIdentity';
import { DEFAULT_PORTFOLIO_FILTERS, type PanelPortfolioFilterName } from '@/domain/portfolioFilters';
import { PRIORITY_LABELS } from '@/features/portfolio/table/tableLabels';
import { allWorkflowStates } from '@/domain/workflow';
import { NO_PERSON_FILTER, personFilterName, personNameFilter } from '@/domain/peopleFilters';

export type AdditionalPortfolioFilter = FilterMenuField & { key: string; reset: () => void };

function usePortfolioFilterFields() {
    const { t } = useI18n();
    const { filters, setFilter, clearPanel, isBoard } = useQueryFilters();
    const state = useAppStore(useShallow((s) => ({
        portfolioBoards: s.portfolioBoards,
        selectedPortfolioBoardId: s.selectedPortfolioBoardId,
        portfolioTimelineSelection: s.portfolioTimelineSelection
    })));
    const { portfolioBoards, selectedPortfolioBoardId, portfolioTimelineSelection } = state;
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
        return [all, ...(kind === 'sprints' ? [] : [{ value: '__none__', label: t(kind === 'phases' ? 'roadmap.noPhase' : 'roadmap.noMilestone') }]), ...options.values()];
    }

    function field<K extends PanelPortfolioFilterName>(
        key: K, label: string, id: string, options: { value: string; label: string }[], multiple = false, hint?: string
    ): AdditionalPortfolioFilter & { key: K } {
        const selected = filters[key];
        // An assignment edit can remove the last occurrence of a filtered name.
        // Keep that explicit filter visible rather than displaying "All".
        if ((key === 'assignee' || key === 'responsible') && typeof selected === 'string' && selected
            && !options.some((option) => option.value === selected)) options = [...options, { value: selected, label: personFilterName(selected) }];
        return {
            reset: () => setFilter(key, DEFAULT_PORTFOLIO_FILTERS[key]),
            key, id, label: label.replace(/:$/, ''), options, value: filters[key], multiple, hint,
            changed: key === 'statuses' ? filters.statuses.length > 0 : filters[key] !== DEFAULT_PORTFOLIO_FILTERS[key],
            onChange: (value) => { if (isBoard && key === 'sprintId') useAppStore.setState({ portfolioBoardActiveSprintsOnly: false }); setFilter(key, value); }
        };
    }

    function hierarchyOptions(type: 'epic' | 'story') {
        return [all, ...sources.flatMap(({ board, data }) => (data?.board.tasks || []).filter(task => workitemType(task) === type).map(task => ({ value: String(task.id), label: `${workitemLabel(task)} ${task.title}${sources.length > 1 ? ` — ${board.title}` : ''}` })))];
    }

    // Reuse field semantics while each view owns its selections.
    const fields = [
        field('blocked', t('toolbar.blocked'), 'portfolioBlockedFilter', [
            { value: 'all', label: t('common.all') }, { value: 'blocked', label: t('toolbar.blockedOnly') }, { value: 'unblocked', label: t('toolbar.unblockedOnly') }
        ]),
        ...(['manuallyBlocked', 'dependencyBlocked'] as const).map(key => field(key, t(`table.${key}`), `portfolio${key === 'manuallyBlocked' ? 'Manually' : 'Dependency'}BlockedFilter`, [
            { value: 'all', label: t('common.all') }, { value: 'blocked', label: t('common.yes') }, { value: 'unblocked', label: t('common.no') }
        ])),
        field('responsible', t('task.responsible'), 'portfolioResponsibleFilter', [all, { value: NO_PERSON_FILTER, label: t('task.noResponsible') }, ...assignees.map((name) => ({ value: personNameFilter(name), label: name }))]),
        field('assignee', t('toolbar.participant'), 'portfolioAssigneeFilter', [all, { value: NO_PERSON_FILTER, label: t('task.noParticipants') }, ...assignees.map((name) => ({ value: personNameFilter(name), label: name }))]),
        field('priority', t('toolbar.priority'), 'portfolioPriorityFilter', [all, ...Object.entries(PRIORITY_LABELS).map(([value, key]) => ({ value, label: t(key) }))]),
        field('effort', t('toolbar.effort'), 'portfolioEffortFilter', [all, ...EFFORT_BUCKETS.map((value) => ({ value, label: value }))]),
        field('statuses', t('task.status'), 'portfolioStatusesFilter', [...new Map(sources.flatMap(({ data }) => allWorkflowStates(data).map((s) => [s.id, { value: s.id, label: s.name }] as const))).values()], true, t('table.selectStatuses')),
        field('phaseId', t('task.phase'), 'portfolioPhaseFilter', roadmapOptions('phases')),
        field('milestoneId', t('task.milestone'), 'portfolioMilestoneFilter', roadmapOptions('milestones')),
        field('sprintId', t('task.sprint'), 'portfolioSprintFilter', roadmapOptions('sprints')),
        field('epicId', t('workitems.type.epic'), 'tableHierarchy-epic', hierarchyOptions('epic')),
        field('storyId', t('workitems.type.story'), 'tableHierarchy-story', hierarchyOptions('story'))
    ];
    return { fields, t, clearPanel };
}

export function PortfolioToolbarFilters({ boardMode, scope = '', additionalFields = [], iconOnly = false }: { boardMode?: WorkflowKind; scope?: string; additionalFields?: AdditionalPortfolioFilter[]; iconOnly?: boolean }) {
    const { fields, t, clearPanel } = usePortfolioFilterFields();
    const combined = [...fields.map(field => ({ ...field, id: scope ? `${field.id}-${scope}` : field.id })), ...additionalFields];
    const clear = () => { clearPanel(); additionalFields.forEach(field => field.reset()); };
    return <FilterMenu showClearAll iconOnly={iconOnly} scope={scope} fields={combined} activeCount={combined.filter(field => field.changed).length} onClear={clear} panelClassName="portfolio-filter-options" dismissOnBlur title={boardMode ? t('toolbar.filtersView') : undefined}>
        {boardMode && <><PortfolioSortControl /><BoardColumnOptions mode={boardMode} /></>}
    </FilterMenu>;
}
