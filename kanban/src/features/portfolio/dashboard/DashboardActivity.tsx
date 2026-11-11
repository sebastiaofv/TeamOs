import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { useMemo } from 'react';
import type { BoardData, Task } from '@/domain/types';
import { dashboardInProgress, dashboardPeriodWorkitems } from '@/domain/dashboardOverview';
import type { ActivityWidget } from '@/domain/dashboardActivityLayout';
import { formatDate } from '@/domain/dates';
import { workitemType } from '@/domain/workitems';
import { workitemLabel } from '@/domain/taskIdentity';
import { getWorkflow } from '@/domain/workflow';
import { WorkflowStateBadge } from '@/features/portfolio/task/WorkflowStateBadge';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

export type ActivityKind = Exclude<ActivityWidget, 'activitySummary'>;
export type ActivityDetails = { kind: ActivityKind; contexts: Map<number, BoardData>; dates?: Map<number, string> };
export type DashboardInspect = (name: string, tasks: Task[], data?: BoardData, activity?: ActivityDetails) => void;
const PREVIEW_LIMIT = 5;
const icons = { started: 'play', completedInPeriod: 'check', currentlyInProgress: 'runner' } as const;

export function ActivityWorkitems({ tasks, data, boardId, details, limit }: {
    tasks: Task[]; data: BoardData; boardId: string; details: ActivityDetails; limit?: number;
}) {
    const { t } = useI18n();
    const actions = usePortfolioActions();
    return !tasks.length ? <p className="dashboard-activity-empty">{t('dashboard.noActivity')}</p> : <div className="dashboard-scroll"><table className="dashboard-table dashboard-activity-table">
        <thead><tr><th>{t('workitems.type')}</th><th>ID</th><th>{t('task.title')}</th><th>{t('task.responsible')}</th><th>{t(details.kind === 'currentlyInProgress' ? 'task.status' : details.kind === 'started' ? 'dashboard.startedDate' : 'dashboard.completedDate')}</th></tr></thead>
        <tbody>{tasks.slice(0, limit).map((task) => {
            const context = data.board.tasks.some((row) => row.id === task.id && row.createdAt === task.createdAt) ? data : details.contexts.get(task.id) || data;
            const open = () => actions.openPortfolioTaskDetails(boardId, task.id, { boardData: context, readOnly: true });
            const state = getWorkflow(context, task).states.find((state) => state.id === task.status);
            return <tr key={task.id} onClick={open}>
                <td><span className={`dashboard-type dashboard-type-${workitemType(task)}`}>{t(`workitems.type.${workitemType(task)}`)}</span></td>
                <td><button type="button" className="dashboard-link" onClick={(event) => { event.stopPropagation(); open(); }}>{workitemLabel(task)}</button></td>
                <td className="dashboard-activity-title"><button type="button" className="dashboard-link" title={task.title} onClick={(event) => { event.stopPropagation(); open(); }}>{task.title}</button></td>
                <td title={task.responsible || undefined}>{task.responsible || t('dashboard.na')}</td>
                <td>{details.kind === 'currentlyInProgress' ? <WorkflowStateBadge state={state || { id: task.status, name: task.status, category: 'to-do', color: '#949dab' }} /> : formatDate(details.dates?.get(task.id)?.slice(0, 10) || '') || t('dashboard.na')}</td>
            </tr>;
        })}</tbody>
    </table></div>;
}

export function DashboardActivity({ boardId, data, source, start, end, visible, order, inspect }: {
    boardId: string; data: BoardData; source: BoardData; start: string; end: string;
    visible: readonly ActivityWidget[]; order: readonly ActivityWidget[]; inspect: DashboardInspect;
}) {
    const { t } = useI18n();
    const { period, current } = useMemo(() => ({ period: dashboardPeriodWorkitems(source, data, '', start, end), current: dashboardInProgress(data) }), [source, data, start, end]);
    const groups = {
        started: { tasks: period.started, dates: period.startedAt },
        completedInPeriod: { tasks: period.completed, dates: period.completedAt },
        currentlyInProgress: { tasks: current, dates: undefined }
    };
    const available = (kind: ActivityKind) => kind === 'currentlyInProgress' || period.available;
    const open = (kind: ActivityKind) => inspect(t(`dashboard.section.${kind}`), groups[kind].tasks, data, { kind, contexts: period.contexts, dates: groups[kind].dates });
    if (!visible.length) return null;
    return <section className="dashboard-activity" aria-labelledby="dashboardActivityTitle">
        <h2 id="dashboardActivityTitle" className="dashboard-activity-heading"><WorkspaceIcon name="chart" />{t('dashboard.progressSinceReview')}</h2>
        <div className="dashboard-activity-grid">{order.filter((key) => visible.includes(key)).map((key) => key === 'activitySummary' ?
            <section key={key} className="dashboard-panel dashboard-activity-summary" data-dashboard-section={key}>
                <h3><WorkspaceIcon name="chart" />{t('dashboard.section.activitySummary')}</h3>
                <div className="dashboard-activity-totals">{(['started', 'completedInPeriod', 'currentlyInProgress'] as const).map((kind) => <button key={kind} type="button" className={`dashboard-activity-total dashboard-activity-${kind}`} disabled={!available(kind)} onClick={() => open(kind)}>
                    <span className="dashboard-activity-icon" aria-hidden="true"><WorkspaceIcon name={icons[kind]} /></span><span>{t(`dashboard.activity.${kind}`)}<strong>{available(kind) ? groups[kind].tasks.length : t('dashboard.na')}</strong></span>
                </button>)}</div>
                {!period.available && <p className="dashboard-note">{t('dashboard.noHistoryBaseline')}</p>}
                {period.available && period.availableFrom && start < period.availableFrom && <p className="dashboard-note">{t('dashboard.partialHistory', { date: formatDate(period.availableFrom) })}</p>}
            </section> :
            <section key={key} className={`dashboard-panel dashboard-activity-detail dashboard-activity-${key}`} data-dashboard-section={key}>
                <h3><span className="dashboard-activity-icon" aria-hidden="true"><WorkspaceIcon name={icons[key]} /></span>{t(`dashboard.section.${key}`)}<span className="dashboard-activity-count">{available(key) ? groups[key].tasks.length : t('dashboard.na')}</span></h3>
                {!available(key) ? <p className="dashboard-note">{t('dashboard.noHistoryBaseline')}</p> : <>
                    {key !== 'currentlyInProgress' && period.availableFrom && start < period.availableFrom && <p className="dashboard-note">{t('dashboard.partialHistory', { date: formatDate(period.availableFrom) })}</p>}
                    <ActivityWorkitems tasks={groups[key].tasks} data={data} boardId={boardId} details={{ kind: key, contexts: period.contexts, dates: groups[key].dates }} limit={PREVIEW_LIMIT} />
                    {groups[key].tasks.length > PREVIEW_LIMIT && <button type="button" className="dashboard-link dashboard-activity-view-all" onClick={() => open(key)}>{t('dashboard.viewAll', { count: groups[key].tasks.length })}<span aria-hidden="true"> →</span></button>}
                </>}
            </section>
        )}</div>
    </section>;
}
