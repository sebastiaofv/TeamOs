import { formatDate } from '@/domain/dates';
import { useMemo, useState, type CSSProperties } from 'react';
import type { BoardData, RoadmapItem, Task } from '@/domain/types';
import { dashboardMetrics, dashboardSprints, dashboardTasks } from '@/domain/dashboard';
import { dashboardControl, dashboardOverviewPlanning, dashboardPeriodWorkitems, dashboardReportable, dashboardStatistics, type DashboardSection } from '@/domain/dashboardOverview';
import { riskLevel, type ControlRecord } from '@/domain/projectControl';
import { getWorkflow, statusCategory } from '@/domain/workflow';
import { workitemLabel } from '@/domain/taskIdentity';
import { isPlanningUnit } from '@/domain/workitems';
import { ControlBadge } from '@/features/portfolio/control/ControlBadge';
import { ControlRecordDialog } from '@/features/portfolio/control/ControlRecordDialog';
import { WorkflowStateBadge } from '@/features/portfolio/task/WorkflowStateBadge';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

type Props = { boardId: string; data: BoardData; source: BoardData; phaseId: string; start: string; end: string; visible: DashboardSection[]; inspect: (name: string, tasks: Task[], data?: BoardData) => void; openRoadmap: (kind: 'phases' | 'milestones' | 'sprints', item: RoadmapItem) => void };
const COLORS = { completed: '#22a56a', 'in-progress': '#3985ff', pending: '#949dab', cancelled: '#ba7899' };

function Ring({ percent, label, children }: { percent: number | null; label: string; children: React.ReactNode }) {
    return <div className="dashboard-ring" role="img" aria-label={label} style={{ '--ring-fill': `${percent || 0}%`, '--ring-color': 'var(--accent)' } as CSSProperties}><div>{children}</div></div>;
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

export function DashboardOverview({ boardId, data, source, phaseId, start, end, visible, inspect, openRoadmap }: Props) {
    const { t, language } = useI18n();
    const [control, setControl] = useState<ControlRecord | null>(null);
    const { metrics, planning, statistics, period, current, controls, sprints } = useMemo(() => {
        const tasks = dashboardTasks(data, phaseId);
        const metrics = dashboardMetrics(data, tasks, end);
        const planning = dashboardOverviewPlanning(data, phaseId, end);
        const statistics = dashboardStatistics(data, phaseId);
        const period = dashboardPeriodWorkitems(source, data, phaseId, start, end);
        const current = tasks.filter((task) => dashboardReportable(data, task) && statusCategory(task.status, data, task) === 'in-progress');
        const controls = dashboardControl(data, phaseId, start, end);
        const sprints = dashboardSprints(data, phaseId, end).filter((sprint) => sprint.status === 'active' && (!phaseId || sprint.tasks.length || sprint.item.parentId === phaseId));
        return { metrics, planning, statistics, period, current, controls, sprints };
    }, [data, source, phaseId, start, end]);
    const percent = (value: number | null) => value === null ? t('dashboard.na') : `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value)}%`;
    const warning = <span className="dashboard-warning">⚠ {t('dashboard.overdue')}</span>;
    const categoryLabel = (category: string) => t(category === 'in-progress' ? 'dashboard.inProgress' : category === 'pending' ? 'dashboard.pending' : category === 'cancelled' ? 'dashboard.cancelled' : 'dashboard.completed');
    return <div className="dashboard-section-grid">
        {visible.includes('projectOverview') && <section className="dashboard-panel dashboard-overview" data-dashboard-section="projectOverview"><h3>{t('dashboard.section.projectOverview')}</h3>
            <div className="dashboard-overview-content"><button type="button" className="dashboard-progress-button" data-dashboard-kpi="progress" onClick={() => inspect(t('dashboard.progress'), metrics.eligible)}>
                <Ring percent={metrics.progress.percent} label={`${t('dashboard.progress')}: ${percent(metrics.progress.percent)}`}><strong>{percent(metrics.progress.percent)}</strong><small>{t('dashboard.projectProgress')}</small></Ring>
                <small>{t('dashboard.progressRule', { done: metrics.completed.length, total: metrics.eligible.length })}</small>
            </button><div className="dashboard-phase-summary"><h4>{t('dashboard.projectPhases')}</h4>
                {!planning.phases.length ? <p>{t('dashboard.noOpenPhases')}</p> : <div className="dashboard-scroll"><table className="dashboard-table"><thead><tr><th>{t('task.phase')}</th><th>{t('dashboard.percentComplete')}</th><th>{t('dashboard.endDate')}</th></tr></thead><tbody>{planning.phases.map((group) => <tr key={group.item.id} data-dashboard-planning={group.item.id}><td>
                    <button className="dashboard-link" type="button" onClick={() => openRoadmap('phases', group.item)}>{group.item.title}</button>{group.overdue ? warning : group.current && <span className="dashboard-badge">{t('dashboard.currentPhase')}</span>}
                </td><td><button className="dashboard-link" type="button" onClick={() => inspect(group.item.title, group.tasks)}>{percent(group.progress.percent)}</button></td><td>{formatDate(group.item.endDate || '') || t('dashboard.na')}</td></tr>)}</tbody></table></div>}
            </div><div className="dashboard-milestone-summary"><h4>{t('roadmap.milestones')}</h4>{!planning.milestones.length ? <p>{t('dashboard.noOpenMilestones')}</p> : planning.milestones.map((group) => <div className="dashboard-milestone" key={group.item.id} data-dashboard-planning={group.item.id}>
                <button type="button" className="dashboard-link" onClick={() => openRoadmap('milestones', group.item)}>{group.item.title}</button>{group.overdue ? warning : <span className="dashboard-badge">{t('dashboard.nextMilestone')}</span>}<small>{formatDate(group.item.dueDate || '')}</small>
            </div>)}</div></div>
        </section>}
        {visible.includes('activeSprint') && <section className="dashboard-panel dashboard-active-sprint" data-dashboard-section="activeSprint"><h3>{t('dashboard.section.activeSprint')}</h3>
            {!sprints.length ? <p>{t('dashboard.noActiveSprint')}</p> : sprints.map((sprint) => {
                const units = sprint.tasks.filter((task) => isPlanningUnit(sprint.data, task) && statusCategory(task.status, sprint.data, task) !== 'cancelled');
                const complete = units.filter((task) => statusCategory(task.status, sprint.data, task) === 'completed').length;
                const progress = units.length ? complete / units.length * 100 : null;
                return <div className="dashboard-sprint-summary" key={sprint.item.id} data-dashboard-active-sprint={sprint.item.id}><div><button type="button" className="dashboard-link" onClick={() => openRoadmap('sprints', sprint.item)}>{t('table.sprintIdentity', { number: sprint.number || t('dashboard.na'), name: sprint.item.title })}</button><p>{formatDate(sprint.item.startDate || '') || t('dashboard.na')} → {formatDate(sprint.item.endDate || '') || t('dashboard.na')}</p></div>
                    <button type="button" className="dashboard-progress-button" onClick={() => inspect(sprint.item.title, units, sprint.data)}><strong>{percent(progress)}</strong><small>{t('dashboard.percentComplete')}</small><progress max={100} value={progress || 0} aria-label={t('dashboard.percentComplete')} /></button></div>;
            })}
        </section>}
        {visible.includes('projectStatistics') && <section className="dashboard-panel dashboard-statistics" data-dashboard-section="projectStatistics"><h3>{t('dashboard.section.projectStatistics')}</h3><div className="dashboard-statistics-grid">{statistics.map((group) => {
            let offset = 0;
            const gradient = group.categories.map((category) => { const start = offset; offset += category.tasks.length / Math.max(1, group.tasks.length) * 100; return `${COLORS[category.category]} ${start}% ${offset}%`; }).join(', ');
            const title = t(group.type === 'task' ? 'dashboard.independentTasks' : group.type === 'story' ? 'dashboard.userStories' : 'dashboard.bugs');
            return <article key={group.type} data-dashboard-statistics={group.type}><button type="button" className="dashboard-progress-button" onClick={() => inspect(title, group.tasks)}><div className="dashboard-ring" role="img" aria-label={`${title}: ${group.categories.map((category) => `${categoryLabel(category.category)} ${category.tasks.length}`).join(', ')}`} style={{ background: group.tasks.length ? `conic-gradient(${gradient})` : 'var(--border)' }}><div><strong>{group.tasks.length}</strong><small>{title}</small></div></div></button>
                <div><h4>{title}</h4>{group.categories.filter((category) => category.category !== 'cancelled' || category.tasks.length).map((category) => <button className="dashboard-legend" type="button" key={category.category} onClick={() => inspect(`${title} · ${categoryLabel(category.category)}`, category.tasks)}><span className="dashboard-dot" style={{ background: COLORS[category.category] }} /><span>{categoryLabel(category.category)}</span><strong>{category.tasks.length}</strong><small>({group.tasks.length ? Math.round(category.tasks.length / group.tasks.length * 100) : 0}%)</small></button>)}</div>
            </article>;
        })}</div></section>}
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
