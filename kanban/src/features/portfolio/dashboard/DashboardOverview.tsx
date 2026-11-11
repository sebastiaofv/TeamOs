import { DashboardActivity, type DashboardInspect } from './DashboardActivity';
import { isActivityWidget, type ActivityWidget } from '@/domain/dashboardActivityLayout';
import { formatDate } from '@/domain/dates';
import { useMemo, useState } from 'react';
import type { BoardData, RoadmapItem } from '@/domain/types';
import { dashboardMetrics, dashboardTasks } from '@/domain/dashboard';
import { dashboardActiveSprints, dashboardEpics, dashboardControl, dashboardOverviewPlanning, dashboardMilestones, dashboardStatistics, type DashboardSection } from '@/domain/dashboardOverview';
import { riskLevel, type ControlRecord } from '@/domain/projectControl';
import { getWorkflow } from '@/domain/workflow';
import { workitemLabel } from '@/domain/taskIdentity';
import { ControlBadge } from '@/features/portfolio/control/ControlBadge';
import { ControlRecordDialog } from '@/features/portfolio/control/ControlRecordDialog';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { useI18n } from '@/shared/i18n';

type Props = { historyEventIndex?: number; dependencyBlockedIds: ReadonlySet<number>; boardId: string; data: BoardData; source: BoardData; start: string; end: string; visible: DashboardSection[]; activityOrder: ActivityWidget[]; inspect: DashboardInspect; openRoadmap: (kind: 'phases' | 'milestones' | 'sprints', item: RoadmapItem) => void };
function Progress({ value, label }: { value: number | null; label: string }) {
    return <progress className={`dashboard-progress${value === 100 ? ' dashboard-progress-completed' : ''}`} max={100} value={value ?? 0} aria-label={label} />;
}

export function DashboardOverview({ historyEventIndex, dependencyBlockedIds, boardId, data, source, start, end, visible, activityOrder, inspect, openRoadmap }: Props) {
    const { t, language } = useI18n();
    const actions = usePortfolioActions();
    const [control, setControl] = useState<ControlRecord | null>(null);
    const { metrics, planning, milestones, statistics, controls, sprints, epics } = useMemo(() => {
        const tasks = dashboardTasks(data);
        const metrics = dashboardMetrics(data, tasks, end, dependencyBlockedIds);
        const planning = dashboardOverviewPlanning(data, '', end);
        const statistics = dashboardStatistics(data, '');
        const controls = dashboardControl(data, '', start, end);
        const sprints = dashboardActiveSprints(data, end);
        return { metrics, planning, milestones: dashboardMilestones(data, end, planning.milestones), statistics, controls, sprints, epics: dashboardEpics(data) };
    }, [data, start, end, dependencyBlockedIds]);
    const percent = (value: number | null) => value === null ? t('dashboard.na') : `${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value)}%`;
    const situation = (value: 'overdue' | 'late' | 'onTarget' | 'completed') => <span className={`dashboard-badge dashboard-situation-${value}`}>{t(`dashboard.${value}`)}</span>;
    const legend = [...new Map(statistics.flatMap((group) => group.states.map((state) => [`${state.name}:${state.color}`, state] as const))).values()];
    return <div className="dashboard-overview-sections">
    {visible.some((key) => ['projectProgress', 'activePhases', 'milestones', 'activeSprint', 'workitemStatus', 'epics'].includes(key)) && <section className="dashboard-project-overview" aria-labelledby="dashboardOverviewTitle">
    <h2 id="dashboardOverviewTitle" className="dashboard-section-heading"><WorkspaceIcon name="dashboard" />{t('dashboard.section.projectOverview')}</h2>
    <div className="dashboard-section-grid dashboard-overview-grid">
        {visible.includes('projectProgress') && <section className="dashboard-panel dashboard-third dashboard-project-progress" data-dashboard-section="projectProgress"><h3><WorkspaceIcon name="progress" />{t('dashboard.projectProgress')}</h3>
            <button type="button" className="dashboard-progress-button" data-dashboard-kpi="progress" onClick={() => inspect(t('dashboard.progress'), metrics.eligible)}>
                <span className="dashboard-progress-summary"><span className="dashboard-progress-ring" role="progressbar" aria-label={t('dashboard.projectProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={metrics.progress.percent ?? undefined} aria-valuetext={percent(metrics.progress.percent)}><svg viewBox="0 0 120 120" aria-hidden="true"><circle className="dashboard-ring-track" cx="60" cy="60" r="50" /><circle className="dashboard-ring-value" cx="60" cy="60" r="50" pathLength="100" opacity={(metrics.progress.percent ?? 0) > 0 ? 1 : 0} strokeDasharray={`${metrics.progress.percent ?? 0} 100`} /></svg><strong>{percent(metrics.progress.percent)}</strong></span><span className="dashboard-progress-count" title={t('dashboard.progressRule', { done: metrics.completed.length, total: metrics.eligible.length })}>{metrics.completed.length} / {metrics.eligible.length}<small>{t('dashboard.workitems')}</small></span></span>
            </button>
        </section>}
        {visible.includes('activePhases') && <section className="dashboard-panel dashboard-third dashboard-phases" data-dashboard-section="activePhases"><h3><WorkspaceIcon name="phases" />{t('dashboard.section.activePhases')}</h3>
            {!planning.phases.length ? <p>{t('dashboard.noOpenPhases')}</p> : <div className="dashboard-phase-scroll"><ol className="dashboard-phase-sequence">{planning.phases.map((group) => {
                const delayed = group.situation === 'overdue' || group.situation === 'late';
                const state = delayed ? group.situation : group.progress.percent === 100 ? 'completed' : (group.progress.percent ?? 0) > 0 ? 'inProgress' : 'future';
                return <li key={group.item.id} data-dashboard-planning={group.item.id} data-phase-state={state}>
                    <button type="button" className={`dashboard-phase-circle dashboard-phase-${state}`} aria-label={`${group.item.title}: ${t(`dashboard.${delayed ? group.situation : state}`)}`} title={t(`dashboard.${delayed ? group.situation : state}`)} onClick={() => openRoadmap('phases', group.item)}>{delayed ? <WorkspaceIcon name="alert" /> : state === 'completed' ? <WorkspaceIcon name="check" /> : state === 'inProgress' ? <span /> : null}</button>
                    <button className="dashboard-link dashboard-phase-name" type="button" title={group.item.title} onClick={() => openRoadmap('phases', group.item)}>{group.item.title}</button>
                    <button className="dashboard-link" type="button" onClick={() => inspect(group.item.title, group.tasks)}>{percent(group.progress.percent)}</button>
                    <small className={group.situation === 'late' ? 'dashboard-missed-date' : ''}>{formatDate(group.item.startDate || '') || t('dashboard.na')}</small>
                    <small className={group.situation === 'overdue' ? 'dashboard-missed-date' : ''}>{formatDate(group.item.endDate || '') || t('dashboard.na')}</small>
                </li>;
            })}</ol></div>}
        </section>}
        {visible.includes('milestones') && <section className="dashboard-panel dashboard-third" data-dashboard-section="milestones"><h3><WorkspaceIcon name="finish" />{t('dashboard.section.milestones')}</h3>
            <div className="dashboard-milestone-summary" aria-label={t('dashboard.milestoneSummary')}>
                {([{ key: 'completed', icon: 'check', label: 'completed' }, { key: 'delayed', icon: 'alert', label: 'delayedMilestones' }, { key: 'remaining', icon: 'finish', label: 'remainingMilestones' }] as const).map(({ key, icon, label }) => <span key={key} className={`dashboard-milestone-total dashboard-milestone-${key}`} role="img" aria-label={`${t(`dashboard.${label}`)}: ${milestones.summary[key]}`} title={`${t(`dashboard.${label}`)}: ${milestones.summary[key]}`}><WorkspaceIcon name={icon} /><strong>{milestones.summary[key]}</strong></span>)}
            </div>
            {!milestones.visible.length ? <p className="dashboard-secondary">{t('dashboard.noRelevantMilestones')}</p> : <ul className="dashboard-milestone-list dashboard-widget-list">{milestones.visible.map((group) => <li key={group.item.id} data-dashboard-planning={group.item.id}>
                <button type="button" className="dashboard-link dashboard-truncate dashboard-milestone-name" title={group.item.title} onClick={() => openRoadmap('milestones', group.item)}>{group.item.title}</button>
                <span className="dashboard-milestone-date dashboard-secondary"><span className="dashboard-milestone-alert">{group.overdue && group.progress.percent !== 100 && <span role="img" aria-label={t('dashboard.overdue')} title={t('dashboard.overdue')}><WorkspaceIcon name="alert" /></span>}</span>{formatDate(group.item.dueDate || '') || t('dashboard.na')}</span>
                <button type="button" className="dashboard-link dashboard-inline-progress" aria-label={`${group.item.title}: ${percent(group.progress.percent)}`} onClick={() => inspect(group.item.title, group.tasks)}><Progress value={group.progress.percent} label={`${group.item.title}: ${percent(group.progress.percent)}`} />{group.progress.percent !== 100 && <span>{percent(group.progress.percent)}</span>}</button>
            </li>)}</ul>}
        </section>}
        {visible.includes('activeSprint') && <section className="dashboard-panel dashboard-third dashboard-active-sprint" data-dashboard-section="activeSprint"><h3><WorkspaceIcon name="runner" />{t('dashboard.section.activeSprint')}</h3>
            {!sprints.length ? <p>{t('dashboard.noActiveSprint')}</p> : <div className="dashboard-widget-list">{sprints.map((sprint) => <article className="dashboard-sprint-summary" key={sprint.item.id} data-dashboard-active-sprint={sprint.item.id}>
                <div className="dashboard-sprint-header"><div><button type="button" className="dashboard-link" onClick={() => openRoadmap('sprints', sprint.item)}>{t('table.sprintIdentity', { number: sprint.number || t('dashboard.na'), name: sprint.item.title })}</button><p>{formatDate(sprint.item.startDate || '') || t('dashboard.na')} – {formatDate(sprint.item.endDate || '') || t('dashboard.na')}</p></div>{situation(sprint.overdue ? 'overdue' : 'onTarget')}</div>
                <button type="button" className="dashboard-sprint-indicators" onClick={() => inspect(sprint.item.title, sprint.units, sprint.data)}>
                    <span><strong>{sprint.units.length}</strong><small>{t('dashboard.workitems')}</small></span>
                    <span><strong>{sprint.points.completed} / {sprint.points.planned}</strong><small>{t('dashboard.storyPoints')}</small></span>
                    <span><strong>{percent(sprint.percent)}</strong><small>{t('dashboard.completion')}</small></span>
                </button>
            </article>)}</div>}
        </section>}
        {visible.includes('workitemStatus') && <section className="dashboard-panel dashboard-third dashboard-statistics" data-dashboard-section="workitemStatus"><h3><WorkspaceIcon name="chart" />{t('dashboard.section.workitemStatus')}</h3><div className="dashboard-statistics-grid">{statistics.map((group) => {
            const title = t(group.type === 'task' ? 'dashboard.independentTasks' : group.type === 'story' ? 'dashboard.userStories' : 'dashboard.bugs');
            return <article className="dashboard-status-row" key={group.type} data-dashboard-statistics={group.type}>
                <h4>{title}</h4>
                <div className="dashboard-stacked-bar" role="group" aria-label={`${title}: ${group.states.map((state) => `${state.name} ${state.tasks.length} (${percent(group.tasks.length ? state.tasks.length / group.tasks.length * 100 : 0)})`).join(', ')}`}>
                    {group.states.filter((state) => state.tasks.length).map((state) => {
                        const value = state.tasks.length / group.tasks.length * 100;
                        const label = `${state.name}: ${state.tasks.length} (${percent(value)})`;
                        return <span className="dashboard-status-segment" role="img" key={state.id} title={label} aria-label={label} tabIndex={0} style={{ width: `${value}%`, background: state.color }}><span>{state.tasks.length}</span></span>;
                    })}
                    {!group.tasks.length && <small>{t('dashboard.noWorkitems')}</small>}
                </div>
            </article>;
        })}</div><div className="dashboard-state-legend">{legend.map((state) => <span key={`${state.name}:${state.color}`}><span className="dashboard-dot" style={{ background: state.color }} />{state.name}</span>)}</div></section>}
        {visible.includes('epics') && <section className="dashboard-panel dashboard-third" data-dashboard-section="epics"><h3><WorkspaceIcon name="folder" />{t('dashboard.section.epics')}</h3>
            {!epics.length ? <p>{t('dashboard.noStartedEpics')}</p> : <ul className="dashboard-epic-list dashboard-widget-list" aria-label={t('dashboard.section.epics')}>{epics.map(({ task, progress, points }) => {
                const open = () => actions.openPortfolioTaskDetails(boardId, task.id, { boardData: data, readOnly: true, historyEventIndex });
                const state = getWorkflow(data, task).states.find((state) => state.id === task.status)!;
                return <li key={task.id} data-dashboard-epic={task.id}>
                    <div className="dashboard-epic-identity"><button type="button" className="dashboard-link dashboard-epic-id" onClick={open}>{workitemLabel(task)}</button><button type="button" className="dashboard-link dashboard-truncate" title={task.title} onClick={open}>{task.title}</button></div>
                    <span className="dashboard-epic-status" title={state.name}><span className="dashboard-dot" style={{ background: state.color }} /><span>{state.name}</span></span>
                    <span className="dashboard-epic-points"><span>{points.completed} / {points.total}</span><small>{t('dashboard.storyPoints')}</small></span>
                    <span className="dashboard-inline-progress"><Progress value={progress.percent} label={`${task.title}: ${percent(progress.percent)}`} />{progress.percent !== 100 && <span>{percent(progress.percent)}</span>}</span>
                </li>;
            })}</ul>}
        </section>}
    </div></section>}
    <DashboardActivity historyEventIndex={historyEventIndex} boardId={boardId} data={data} source={source} start={start} end={end} visible={visible.filter(isActivityWidget)} order={activityOrder} inspect={inspect} />
    <div className="dashboard-section-grid">
        {(['openRisks', 'deliverables', 'decisions'] as const).filter((key) => visible.includes(key)).map((key) => {
            const records = controls[key === 'openRisks' ? 'risks' : key];
            return <section className="dashboard-panel dashboard-third" key={key} data-dashboard-section={key}><h3><WorkspaceIcon name="control" />{t(`dashboard.section.${key}`)}</h3>{!records.length ? <p>{t('dashboard.noControlRecords')}</p> : <div className="dashboard-scroll"><table className="dashboard-table"><thead><tr><th>ID</th><th>{t('control.title')}</th><th>{t('control.status')}</th><th>{t(key === 'openRisks' ? 'control.riskLevel' : key === 'deliverables' ? 'control.dueDate' : 'control.owner')}</th>{key === 'openRisks' && <th>{t('control.owner')}</th>}</tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><button type="button" className="dashboard-link" onClick={() => setControl(record)}>{record.id}</button></td><td><button type="button" className="dashboard-link" onClick={() => setControl(record)}>{record.title}</button></td><td><ControlBadge value={record.status} /></td><td>{key === 'openRisks' ? <ControlBadge value={riskLevel(record)} /> : key === 'deliverables' ? formatDate(record.deliveredDate || record.dueDate || '') || t('dashboard.na') : record.owner || t('dashboard.na')}</td>{key === 'openRisks' && <td>{record.owner || t('dashboard.na')}</td>}</tr>)}</tbody></table></div>}</section>;
        })}
        {control && <ControlRecordDialog key={control.id} boardId={boardId} recordId={control.id} kind={control.kind} data={data} readOnly onClose={() => setControl(null)} />}
    </div></div>;
}
