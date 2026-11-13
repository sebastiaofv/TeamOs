import { useState } from 'react';
import type { BoardData, Task } from '@/domain/types';
import type { allSprintAnalytics, sprintStartWorkitems } from '@/domain/sprintAnalytics';
import { sprintTaskKey, businessDaysBetween, type sprintExecution, type SprintCycle } from '@/domain/sprintExecution';
import type { SprintBurndown } from '@/domain/sprintBurndown';
import { dashboardStatistics } from '@/domain/dashboardOverview';
import { developmentCompleted } from '@/domain/sprintResults';
import { ActivityWorkitems } from './DashboardActivity';
import { CycleChart, formatSprintMetric as format, type AnalyticsLabel } from './SprintExecutionCharts';
import { SprintBurndownChart } from './SprintBurndownChart';
import { WorkspaceIcon, type WorkspaceIconName } from '@/shared/ui/WorkspaceIcon';
import { portfolioActions as actions } from '@/features/portfolio/commands/portfolioCommands';
import { useI18n } from '@/shared/i18n';

type Props = { data: BoardData; selected: string; boardId: string; analytics: ReturnType<typeof allSprintAnalytics>; execution: ReturnType<typeof sprintExecution>; scopes: ReturnType<typeof sprintStartWorkitems>; burndown: SprintBurndown };
export function SprintDetail({ data, selected, boardId, analytics, execution, scopes, burndown }: Props) {
    const { t } = useI18n();
    const [selection, setSelection] = useState<{ title: string; tasks: Task[] } | null>(null);
    const row = analytics.rows.find(row => row.id === selected);
    const closure = data.extensions.sprintResults?.closures.find(closure => closure.sprintId === selected);
    const sprint = closure?.sprint || data.extensions.roadmap?.sprints.find(sprint => sprint.id === selected);
    const detail = execution.sprints.get(selected);
    const context = detail?.context || data, tasks = detail?.tasks || [];
    const initial = scopes.get(selected);
    const planned = row ? row.planned : initial ? initial.tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0) : null;
    const completedTasks = tasks.filter(task => closure ? closure.completedIds.includes(task.id) : developmentCompleted(context, task));
    const completed = row ? row.completed : completedTasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
    const completion = detail && tasks.length ? completedTasks.length / tasks.length * 100 : null;
    const duration = sprint?.startDate && sprint.endDate ? businessDaysBetween(sprint.startDate, `${sprint.endDate}T23:59:59Z`) : null;
    const inclusiveDuration = duration === null || !sprint?.endDate ? null : duration + ([0, 6].includes(new Date(`${sprint.endDate}T00:00:00Z`).getUTCDay()) ? 0 : 1);
    const metrics: { key: string; title: AnalyticsLabel; icon: WorkspaceIconName; value: number | null; percent?: boolean; secondary?: string; members?: Task[]; unavailable?: string }[] = [
        { key: 'duration', title: 'duration', icon: 'planner', value: inclusiveDuration, secondary: t('dashboard.analytics.workingDays') },
        { key: 'planned', title: 'planned', icon: 'story', value: planned, secondary: 'SP' },
        { key: 'completed', title: 'completed', icon: 'completed', value: completed, secondary: `SP · ${format(completed !== null && planned !== null && planned > 0 ? completed / planned * 100 : null, true)}` },
        { key: 'capacity', title: 'capacity', icon: 'gauge', value: row ? row.capacity : sprint?.capacity ?? null, secondary: 'SP' },
        { key: 'completion', title: 'completion', icon: 'progress', value: completion, percent: true },
        { key: 'workitems', title: 'completedCount', icon: 'task', value: detail ? completedTasks.length : null, members: detail ? completedTasks : undefined },
        { key: 'cycleTime', title: 'medianCycle', icon: 'clock', value: detail?.medianCycleTime ?? null, secondary: t('dashboard.analytics.workingDays') },
        { key: 'rework', title: 'rework', icon: 'rework', value: detail?.rework?.length ?? null, unavailable: !closure ? '—' : undefined, secondary: closure ? `${format(detail?.reworkPercent ?? null, true)} · ${t('dashboard.analytics.workitems')}` : undefined, members: detail?.rework ?? undefined }
    ];
    const select = (title: string, members: Task[]) => setSelection({ title, tasks: members });
    const open = (cycle: SprintCycle) => {
        const current = data.board.tasks.find(task => sprintTaskKey(task) === cycle.key);
        actions.openPortfolioTaskDetails(boardId, cycle.task.id, current ? {} : { boardData: context, readOnly: true });
    };
    const statistics = dashboardStatistics({ ...context, board: { ...context.board, tasks } }, '');
    const categories = statistics[0].states;
    return <div className="sprint-analytics">
        <h2 className="dashboard-section-heading"><WorkspaceIcon name="runner" />{sprint?.title}</h2>
        <div className="sprint-summary-grid sprint-individual-summary">{metrics.map(metric => <section key={metric.key} className="dashboard-panel sprint-summary" data-sprint-summary={metric.key}>
            <h3><WorkspaceIcon name={metric.icon} />{t(`dashboard.analytics.${metric.title}`)}</h3>
            <div className="sprint-summary-value">{metric.members ? <button type="button" className="dashboard-link" onClick={() => select(t(`dashboard.analytics.${metric.title}`), metric.members!)}><strong>{format(metric.value, metric.percent)}</strong></button> : <strong>{metric.unavailable || format(metric.value, metric.percent)}</strong>}{metric.secondary && <span>{metric.secondary}</span>}</div>
        </section>)}</div>
        {!closure && <p className="dashboard-note">{t('dashboard.analytics.openSprint')}</p>}
        <h2 className="dashboard-section-heading"><WorkspaceIcon name="chart" />{t('dashboard.analytics.performance')}</h2>
        <div className="sprint-performance-grid sprint-detail-grid">
            <section className="dashboard-panel sprint-trend" data-sprint-widget="burndown"><h3><WorkspaceIcon name="arrowDown" />{t('dashboard.analytics.burndown')}</h3><SprintBurndownChart points={burndown.points} /></section>
            <section className="dashboard-panel sprint-trend sprint-scatter" data-sprint-widget="execution"><h3><WorkspaceIcon name="scatter" />{t('dashboard.analytics.executionBySP')}</h3><CycleChart cycles={detail?.cycles || []} onOpen={open} /></section>
            <section className="dashboard-panel sprint-trend" data-sprint-widget="scopeChanges"><h3><WorkspaceIcon name="move" />{t('dashboard.analytics.scopeChanges')}</h3>
                <div className="sprint-detail-counts">{(['added', 'removed'] as const).map(kind => {
                    const members = burndown[kind];
                    return <button type="button" className="btn" key={kind} disabled={!members} onClick={() => select(`${t('dashboard.analytics.scopeChanges')} · ${t(`dashboard.analytics.${kind}`)}`, members!)}><span>{t(`dashboard.analytics.${kind}`)}</span><strong>{members?.length ?? 'N/A'}</strong><small>{members ? members.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0) : 'N/A'} SP</small></button>;
                })}</div>
            </section>
            <section className="dashboard-panel sprint-trend" data-sprint-widget="outcomes"><h3><WorkspaceIcon name="completed" />{t('dashboard.analytics.outcomes')}</h3>
                <div className="sprint-outcomes">{statistics.map(({ type, tasks: members, states }) => {
                    const title = t(type === 'story' ? 'dashboard.userStories' : type === 'task' ? 'dashboard.independentTasks' : 'dashboard.bugs');
                    return <div className="sprint-outcome-row" key={type}><div><span>{title}</span><span>{members.length}</span></div><div className="dashboard-stacked-bar" role="group" aria-label={title}>
                        {states.map(({ category, color, tasks: group }) => {
                            const label = `${t(`workflow.${category}`)}: ${group.length} (${format(group.length / members.length * 100, true)})`;
                            return group.length ? <button type="button" key={category} title={label} aria-label={label} style={{ width: `${group.length / members.length * 100}%`, background: color }} onClick={() => select(`${t('dashboard.analytics.outcomes')} · ${title} · ${t(`workflow.${category}`)}`, group)}>{group.length}</button> : null;
                        })}
                        {!members.length && <small>{t('dashboard.noWorkitems')}</small>}
                    </div></div>;
                })}</div><div className="sprint-chart-legend sprint-outcome-legend">{categories.map(({ category, color }) => <span key={category}><i style={{ background: color }} />{t(`workflow.${category}`)}</span>)}</div>
            </section>
            <section className="dashboard-panel dashboard-activity-detail sprint-workitems-detail" data-sprint-widget="details"><h3><WorkspaceIcon name="search" />{selection?.title || t('dashboard.analytics.workitemsDetail')}</h3>
                {selection ? <ActivityWorkitems boardId={boardId} data={context} tasks={selection.tasks} details={{ label: selection.title, contexts: new Map([...initial?.tasks.map(task => [task.id, initial.context] as const) || [], ...burndown.contexts]) }} /> : <p className="dashboard-activity-empty">{t('dashboard.detailHint')}</p>}
            </section>
        </div>
    </div>;
}
