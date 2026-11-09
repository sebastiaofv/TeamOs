import { formatDate } from '@/domain/dates';
import { useMemo, useState } from 'react';
import type { BoardData, RoadmapItem, Task } from '@/domain/types';
import { dashboardMetrics, dashboardTasks } from '@/domain/dashboard';
import { dashboardActiveSprints, dashboardEpics, dashboardControl, dashboardOverviewPlanning, dashboardPeriodWorkitems, dashboardReportable, dashboardStatistics, type DashboardSection } from '@/domain/dashboardOverview';
import { riskLevel, type ControlRecord } from '@/domain/projectControl';
import { getWorkflow, statusCategory } from '@/domain/workflow';
import { workitemLabel } from '@/domain/taskIdentity';
import { ControlBadge } from '@/features/portfolio/control/ControlBadge';
import { ControlRecordDialog } from '@/features/portfolio/control/ControlRecordDialog';
import { WorkflowStateBadge } from '@/features/portfolio/task/WorkflowStateBadge';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

type Props = { dependencyBlockedIds: ReadonlySet<number>; boardId: string; data: BoardData; source: BoardData; start: string; end: string; visible: DashboardSection[]; inspect: (name: string, tasks: Task[], data?: BoardData) => void; openRoadmap: (kind: 'phases' | 'milestones' | 'sprints', item: RoadmapItem) => void };
function Progress({ value, label }: { value: number | null; label: string }) {
    return <progress className="dashboard-progress" max={100} value={value ?? 0} aria-label={label} />;
}

function Workitems({ tasks, data, boardId, contexts }: { tasks: Task[]; data: BoardData; boardId: string; contexts?: Map<number, BoardData> }) {
    const { t } = useI18n();
    const actions = usePortfolioActions();
    return !tasks.length ? <p>{t('dashboard.noWorkitems')}</p> : <div className="dashboard-scroll"><table className="dashboard-table"><thead><tr><th>ID</th><th>{t('task.title')}</th><th>{t('task.status')}</th><th>{t('task.responsible')}</th></tr></thead><tbody>
        {tasks.map((task) => {
            const context = data.board.tasks.some((row) => row.id === task.id && row.createdAt === task.createdAt) ? data : contexts?.get(task.id) || data;
            const open = () => actions.openPortfolioTaskDetails(boardId, task.id, { boardData: context, readOnly: true });
            return <tr key={task.id}><td><button className="dashboard-link" onClick={open}>{workitemLabel(task)}</button></td><td><button className="dashboard-link" onClick={open}>{task.title}</button></td><td><WorkflowStateBadge state={getWorkflow(context, task).states.find((state) => state.id === task.status) || { id: task.status, name: task.status, category: 'to-do', color: '#949dab' }} /></td><td>{task.responsible || t('dashboard.na')}</td></tr>;
        })}
    </tbody></table></div>;
}

export function DashboardOverview({ dependencyBlockedIds, boardId, data, source, start, end, visible, inspect, openRoadmap }: Props) {
    const { t, language } = useI18n();
    const actions = usePortfolioActions();
    const [control, setControl] = useState<ControlRecord | null>(null);
    const { metrics, planning, statistics, period, current, controls, sprints, epics } = useMemo(() => {
        const tasks = dashboardTasks(data);
        const metrics = dashboardMetrics(data, tasks, end, dependencyBlockedIds);
        const planning = dashboardOverviewPlanning(data, '', end);
        const statistics = dashboardStatistics(data, '');
        const period = dashboardPeriodWorkitems(source, data, '', start, end);
        const current = tasks.filter((task) => dashboardReportable(data, task) && statusCategory(task.status, data, task) === 'in-progress');
        const controls = dashboardControl(data, '', start, end);
        const sprints = dashboardActiveSprints(data, end);
        return { metrics, planning, statistics, period, current, controls, sprints, epics: dashboardEpics(data) };
    }, [data, source, start, end, dependencyBlockedIds]);
    const percent = (value: number | null) => value === null ? t('dashboard.na') : `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value)}%`;
    const warning = <span className="dashboard-warning">⚠ {t('dashboard.overdue')}</span>;
    const situation = (value: 'overdue' | 'late' | 'onTarget') => <span className={`dashboard-badge dashboard-situation-${value}`}>{t(`dashboard.${value}`)}</span>;
    return <div className="dashboard-section-grid">
        {visible.includes('projectProgress') && <section className="dashboard-panel dashboard-third dashboard-project-progress" data-dashboard-section="projectProgress"><h3>{t('dashboard.projectProgress')}</h3>
            <div className="dashboard-progress-summary"><button type="button" className="dashboard-progress-button" data-dashboard-kpi="progress" onClick={() => inspect(t('dashboard.progress'), metrics.eligible)}>
                <strong>{percent(metrics.progress.percent)}</strong>
                <Progress value={metrics.progress.percent} label={t('dashboard.projectProgress')} />
                <small>{t('dashboard.progressRule', { done: metrics.completed.length, total: metrics.eligible.length })}</small>
            </button><button type="button" className="dashboard-progress-button" data-dashboard-kpi="blocked" onClick={() => inspect(t('dashboard.blockedWorkitems'), metrics.blocked)}><strong>{metrics.blocked.length}</strong><small>{t('dashboard.blockedWorkitems')}</small></button></div>
        </section>}
        {visible.includes('activePhases') && <section className="dashboard-panel dashboard-third" data-dashboard-section="activePhases"><h3>{t('dashboard.section.activePhases')}</h3>
            {!planning.phases.length ? <p>{t('dashboard.noOpenPhases')}</p> : <div className="dashboard-widget-list">{planning.phases.map((group) => <article className="dashboard-planning-row" key={group.item.id} data-dashboard-planning={group.item.id}>
                <div><button className="dashboard-link" type="button" onClick={() => openRoadmap('phases', group.item)}>{group.item.title}</button>{situation(group.situation)}</div>
                <small>{formatDate(group.item.startDate || '') || t('dashboard.na')} → {formatDate(group.item.endDate || '') || t('dashboard.na')}</small>
                <button className="dashboard-link" type="button" onClick={() => inspect(group.item.title, group.tasks)}>{percent(group.progress.percent)}</button>
            </article>)}</div>}
        </section>}
        {visible.includes('milestones') && <section className="dashboard-panel dashboard-third" data-dashboard-section="milestones"><h3>{t('dashboard.section.milestones')}</h3>
            {!planning.milestones.length ? <p>{t('dashboard.noOpenMilestones')}</p> : <div className="dashboard-widget-list">{planning.milestones.map((group) => <article className="dashboard-planning-row" key={group.item.id} data-dashboard-planning={group.item.id}>
                <div><button type="button" className="dashboard-link" onClick={() => openRoadmap('milestones', group.item)}>{group.item.title}</button>{group.overdue ? warning : <span className="dashboard-badge">{t('dashboard.nextMilestone')}</span>}</div>
                <small>{formatDate(group.item.dueDate || '')}</small><button type="button" className="dashboard-link" onClick={() => inspect(group.item.title, group.tasks)}>{percent(group.progress.percent)}</button>
            </article>)}</div>}
        </section>}
        {visible.includes('activeSprint') && <section className="dashboard-panel dashboard-third dashboard-active-sprint" data-dashboard-section="activeSprint"><h3>{t('dashboard.section.activeSprint')}</h3>
            {!sprints.length ? <p>{t('dashboard.noActiveSprint')}</p> : <div className="dashboard-widget-list">{sprints.map((sprint) => <article className="dashboard-sprint-summary" key={sprint.item.id} data-dashboard-active-sprint={sprint.item.id}>
                <div><button type="button" className="dashboard-link" onClick={() => openRoadmap('sprints', sprint.item)}>{t('table.sprintIdentity', { number: sprint.number || t('dashboard.na'), name: sprint.item.title })}</button>{situation(sprint.overdue ? 'overdue' : 'onTarget')}<p>{formatDate(sprint.item.startDate || '') || t('dashboard.na')} → {formatDate(sprint.item.endDate || '') || t('dashboard.na')}</p></div>
                <dl className="dashboard-sprint-metrics"><dt>{t('dashboard.userStories')}</dt><dd>{sprint.stories.length}</dd><dt>{t('dashboard.plannedCapacity')}</dt><dd>{sprint.points.planned} / {sprint.points.capacity ?? t('dashboard.na')}</dd><dt>{t('dashboard.completedSp')}</dt><dd>{sprint.points.completed}</dd></dl>
                <button type="button" className="dashboard-progress-button" onClick={() => inspect(sprint.item.title, sprint.units, sprint.data)}><strong>{percent(sprint.percent)}</strong><Progress value={sprint.percent} label={t('dashboard.percentComplete')} /></button>
            </article>)}</div>}
        </section>}
        {visible.includes('workitemStatus') && <section className="dashboard-panel dashboard-third dashboard-statistics" data-dashboard-section="workitemStatus"><h3>{t('dashboard.section.workitemStatus')}</h3><div className="dashboard-statistics-grid">{statistics.map((group) => {
            const title = t(group.type === 'task' ? 'dashboard.independentTasks' : group.type === 'story' ? 'dashboard.userStories' : 'dashboard.bugs');
            return <article key={group.type} data-dashboard-statistics={group.type}><div className="dashboard-status-heading"><h4>{title}</h4><button type="button" className="dashboard-link" onClick={() => inspect(title, group.tasks)}>{group.tasks.length}</button></div>
                <div className="dashboard-stacked-bar" role="img" aria-label={`${title}: ${group.states.map((state) => `${state.name} ${state.tasks.length} (${percent(group.tasks.length ? state.tasks.length / group.tasks.length * 100 : 0)})`).join(', ')}`}>
                    {group.states.filter((state) => state.tasks.length).map((state) => <span key={state.id} style={{ width: `${state.tasks.length / group.tasks.length * 100}%`, background: state.color }} />)}
                </div>
                <div className="dashboard-state-legend">{group.states.filter((state) => state.tasks.length).map((state) => <button className="dashboard-legend" type="button" key={state.id} onClick={() => inspect(`${title} · ${state.name}`, state.tasks)}><span className="dashboard-dot" style={{ background: state.color }} /><span>{state.name}</span><strong>{state.tasks.length}</strong><small>({percent(group.tasks.length ? state.tasks.length / group.tasks.length * 100 : 0)})</small></button>)}</div>
            </article>;
        })}</div></section>}
        {visible.includes('epics') && <section className="dashboard-panel dashboard-third" data-dashboard-section="epics"><h3>{t('dashboard.section.epics')}</h3>
            {!epics.length ? <p>{t('dashboard.noStartedEpics')}</p> : <div className="dashboard-widget-list dashboard-scroll"><table className="dashboard-table"><thead><tr><th>ID</th><th>{t('task.title')}</th><th>{t('task.status')}</th><th>{t('dashboard.percentComplete')}</th></tr></thead><tbody>{epics.map(({ task, progress }) => {
                const open = () => actions.openPortfolioTaskDetails(boardId, task.id, { boardData: data, readOnly: true });
                return <tr key={task.id}><td><button type="button" className="dashboard-link" onClick={open}>{workitemLabel(task)}</button></td><td><button type="button" className="dashboard-link" onClick={open}>{task.title}</button></td><td><WorkflowStateBadge state={getWorkflow(data, task).states.find((state) => state.id === task.status)!} /></td><td><span>{percent(progress.percent)}</span><Progress value={progress.percent} label={`${task.title}: ${percent(progress.percent)}`} /></td></tr>;
            })}</tbody></table></div>}
        </section>}
        {(['started', 'completedInPeriod', 'currentlyInProgress'] as const).filter((key) => visible.includes(key)).map((key) => <section className="dashboard-panel dashboard-third" key={key} data-dashboard-section={key}><h3>{t(`dashboard.section.${key}`)}</h3>
            {key !== 'currentlyInProgress' && (!period.available ? <p>{t('dashboard.noHistoryBaseline')}</p> : period.availableFrom && start < period.availableFrom && <p className="dashboard-note">{t('dashboard.partialHistory', { date: formatDate(period.availableFrom) })}</p>)}
            {(key === 'currentlyInProgress' || period.available) && <Workitems boardId={boardId} data={data} contexts={period.contexts} tasks={key === 'started' ? period.started : key === 'completedInPeriod' ? period.completed : current} />}
        </section>)}
        {(['openRisks', 'deliverables', 'decisions'] as const).filter((key) => visible.includes(key)).map((key) => {
            const records = controls[key === 'openRisks' ? 'risks' : key];
            return <section className="dashboard-panel dashboard-third" key={key} data-dashboard-section={key}><h3>{t(`dashboard.section.${key}`)}</h3>{!records.length ? <p>{t('dashboard.noControlRecords')}</p> : <div className="dashboard-scroll"><table className="dashboard-table"><thead><tr><th>ID</th><th>{t('control.title')}</th><th>{t('control.status')}</th><th>{t(key === 'openRisks' ? 'control.riskLevel' : key === 'deliverables' ? 'control.dueDate' : 'control.owner')}</th>{key === 'openRisks' && <th>{t('control.owner')}</th>}</tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><button type="button" className="dashboard-link" onClick={() => setControl(record)}>{record.id}</button></td><td><button type="button" className="dashboard-link" onClick={() => setControl(record)}>{record.title}</button></td><td><ControlBadge value={record.status} /></td><td>{key === 'openRisks' ? <ControlBadge value={riskLevel(record)} /> : key === 'deliverables' ? formatDate(record.deliveredDate || record.dueDate || '') || t('dashboard.na') : record.owner || t('dashboard.na')}</td>{key === 'openRisks' && <td>{record.owner || t('dashboard.na')}</td>}</tr>)}</tbody></table></div>}</section>;
        })}
        {control && <ControlRecordDialog key={control.id} boardId={boardId} recordId={control.id} kind={control.kind} data={data} readOnly onClose={() => setControl(null)} />}
    </div>;
}
