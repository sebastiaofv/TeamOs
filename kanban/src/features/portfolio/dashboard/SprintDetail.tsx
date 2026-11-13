import { useMemo, useState } from 'react';
import type { BoardData, Task } from '@/domain/types';
import { allSprintAnalytics, sprintStartWorkitems } from '@/domain/sprintAnalytics';
import { sprintExecution, sprintTaskKey, type SprintCycle } from '@/domain/sprintExecution';
import { statusCategory } from '@/domain/workflow';
import { sprintPointSummary, developmentCompleted } from '@/domain/sprintResults';
import { ActivityWorkitems } from './DashboardActivity';
import { CycleChart, formatSprintMetric as format, type AnalyticsLabel } from './SprintExecutionCharts';
import { WorkspaceIcon, type WorkspaceIconName } from '@/shared/ui/WorkspaceIcon';
import { portfolioActions as actions } from '@/features/portfolio/commands/portfolioCommands';
import { useI18n } from '@/shared/i18n';

type Props = { data: BoardData; selected: string; boardId: string; analytics: ReturnType<typeof allSprintAnalytics>; execution: ReturnType<typeof sprintExecution> };
export function SprintDetail({ data, selected, boardId, analytics, execution }: Props) {
    const { t } = useI18n();
    const [selection, setSelection] = useState<{ title: string; tasks: Task[] } | null>(null);
    const row = analytics.rows.find(row => row.id === selected);
    const closure = data.extensions.sprintResults?.closures.find(closure => closure.sprintId === selected);
    const sprint = closure?.sprint || data.extensions.roadmap?.sprints.find(sprint => sprint.id === selected);
    const detail = execution.sprints.get(selected)!;
    const context = detail?.context || data, tasks = detail?.tasks || [];
    const scopes = useMemo(() => sprintStartWorkitems(data, new Map((data.extensions.sprintResults?.closures || []).map(closure => [closure.sprintId, closure.closedAt]))), [data]);
    const initial = scopes.get(selected);
    const initialKeys = new Set(initial?.tasks.map(sprintTaskKey));
    const points = sprintPointSummary(data, selected);
    const planned = row ? row.planned : points.planned;
    const completed = row ? row.completed : tasks.filter(task => developmentCompleted(context, task)).reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
    const carryover = closure ? tasks.filter(task => closure.carryOverIds.includes(task.id)) : tasks.filter(task => !developmentCompleted(context, task));
    const metrics: { key: string; title: AnalyticsLabel; icon: WorkspaceIconName; value: number | null; percent?: boolean; secondary?: string; members?: Task[] }[] = [
        { key: 'planned', title: 'planned', icon: 'story', value: planned, secondary: 'SP' },
        { key: 'completed', title: 'completed', icon: 'completed', value: completed, secondary: 'SP' },
        { key: 'predictability', title: 'sprintPredictability', icon: 'progress', value: row?.predictability ?? null, percent: true },
        { key: 'utilization', title: 'capacityUtilization', icon: 'gauge', value: row ? row.utilization : points.capacity ? points.planned / points.capacity * 100 : null, percent: true },
        { key: 'carryover', title: 'carryover', icon: 'move', value: row ? row.carryover : carryover.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0), secondary: 'SP', members: carryover },
        { key: 'workitems', title: 'totalWorkitems', icon: 'task', value: row && !closure ? null : tasks.length, members: row && !closure ? undefined : tasks },
        { key: 'cycleTime', title: 'medianCycle', icon: 'clock', value: detail?.medianCycleTime ?? null, secondary: t('dashboard.analytics.businessDays') },
        { key: 'rework', title: 'rework', icon: 'rework', value: detail?.rework?.length ?? null, secondary: `${format(detail?.reworkPercent ?? null, true)} · ${t('dashboard.analytics.workitems')}`, members: detail?.rework ?? undefined }
    ];
    const select = (title: string, members: Task[]) => setSelection({ title, tasks: members });
    const groups: { title: AnalyticsLabel; icon: WorkspaceIconName; entries: { title: AnalyticsLabel; tasks: Task[] | null }[] }[] = [
        { title: 'scopeChanges', icon: 'move' as const, entries: [
            { title: 'initialScope', tasks: initial?.tasks ?? null },
            { title: 'added', tasks: initial ? tasks.filter(task => !initialKeys.has(sprintTaskKey(task))) : null },
            { title: 'removed', tasks: initial ? initial.tasks.filter(task => !tasks.some(member => sprintTaskKey(member) === sprintTaskKey(task))) : null }
        ] },
        { title: 'outcomes', icon: 'completed' as const, entries: [
            { title: 'completedWorkitems', tasks: tasks.filter(task => closure ? closure.completedIds.includes(task.id) : developmentCompleted(context, task)) },
            { title: 'testing', tasks: tasks.filter(task => statusCategory(task.status, context, task) === 'testing') },
            { title: 'carryover', tasks: carryover }
        ] }
    ];
    const open = (cycle: SprintCycle) => {
        const current = data.board.tasks.find(task => sprintTaskKey(task) === cycle.key);
        actions.openPortfolioTaskDetails(boardId, cycle.task.id, current ? {} : { boardData: context, readOnly: true });
    };
    return <div className="sprint-analytics">
        <h2 className="dashboard-section-heading"><WorkspaceIcon name="runner" />{sprint?.title}</h2>
        <div className="sprint-summary-grid sprint-individual-summary">{metrics.map(metric => <section key={metric.key} className={`dashboard-panel sprint-summary${metric.key === 'utilization' && (metric.value ?? 0) > 100 ? ' sprint-over-capacity' : ''}`} data-sprint-summary={metric.key}>
            <h3><WorkspaceIcon name={metric.icon} />{t(`dashboard.analytics.${metric.title}`)}</h3>
            <div className="sprint-summary-value">{metric.members ? <button type="button" className="dashboard-link" onClick={() => select(t(`dashboard.analytics.${metric.title}`), metric.members!)}><strong>{format(metric.value, metric.percent)}</strong></button> : <strong>{format(metric.value, metric.percent)}</strong>}{metric.secondary && <span>{metric.secondary}</span>}</div>
        </section>)}</div>
        {!closure && <p className="dashboard-note">{t('dashboard.analytics.openSprint')}</p>}
        <div className="sprint-performance-grid sprint-detail-grid">
            {groups.map(group => <section key={group.title} className="dashboard-panel sprint-trend" data-sprint-widget={group.title}>
                <h3><WorkspaceIcon name={group.icon} />{t(`dashboard.analytics.${group.title}`)}</h3>
                <div className="sprint-detail-counts">{group.entries.map(entry => <button type="button" className="btn" key={entry.title} disabled={!entry.tasks} onClick={() => select(`${t(`dashboard.analytics.${group.title}`)} · ${t(`dashboard.analytics.${entry.title}`)}`, entry.tasks!)}><span>{t(`dashboard.analytics.${entry.title}`)}</span><strong>{entry.tasks?.length ?? 'N/A'}</strong></button>)}</div>
            </section>)}
            <section className="dashboard-panel sprint-trend sprint-scatter" data-sprint-widget="execution"><h3><WorkspaceIcon name="scatter" />{t('dashboard.analytics.executionBySP')}</h3><CycleChart cycles={detail?.cycles || []} onOpen={open} /></section>
            <section className="dashboard-panel sprint-trend" data-sprint-widget="rework"><h3><WorkspaceIcon name="rework" />{t('dashboard.analytics.rework')}</h3><button type="button" className="sprint-rework-total" disabled={!detail?.rework} onClick={() => select(t('dashboard.analytics.rework'), detail!.rework!)}><strong>{format(detail?.rework?.length ?? null)}</strong><span>{t('dashboard.analytics.workitems')} · {format(detail?.reworkPercent ?? null, true)}</span></button></section>
            <section className="dashboard-panel dashboard-activity-detail sprint-workitems-detail" data-sprint-widget="details"><h3><WorkspaceIcon name="search" />{selection?.title || t('dashboard.analytics.workitemsDetail')}</h3>
                {selection ? <ActivityWorkitems boardId={boardId} data={context} tasks={selection.tasks} details={{ label: selection.title, contexts: new Map(initial?.tasks.map(task => [task.id, initial.context])) }} /> : <p className="dashboard-activity-empty">{t('dashboard.detailHint')}</p>}
            </section>
        </div>
    </div>;
}
