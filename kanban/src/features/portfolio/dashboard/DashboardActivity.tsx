import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { useMemo } from 'react';
import type { BoardData, Task } from '@/domain/types';
import { dashboardInProgress, dashboardPeriodWorkitems } from '@/domain/dashboardOverview';
import type { ActivityWidget } from '@/domain/dashboardActivityLayout';
import { workitemType } from '@/domain/workitems';
import { workitemLabel } from '@/domain/taskIdentity';
import { getWorkflow } from '@/domain/workflow';
import { portfolioActions as actions } from '@/features/portfolio/commands/portfolioCommands';
import { useAppStore } from '@/features/portfolio/state/store';
import { useI18n } from '@/shared/i18n';

export type ActivityKind = Exclude<ActivityWidget, 'activitySummary' | 'activityDetails'> | 'userStoriesCreated';
export type ActivityDetails = { kind?: ActivityKind; label?: string; historyEventIndex?: number; contexts: Map<number, BoardData>; dates?: Map<number, string> };
export type DashboardInspect = (name: string, tasks: Task[], data?: BoardData) => void;
export type DashboardSelection = { kind: ActivityKind } | { name: string; tasks: Task[]; data: BoardData; historyEventIndex?: number } | null;
const icons = { started: 'play', completedInPeriod: 'check', currentlyInProgress: 'runner', testing: 'testing', userStoriesCreated: 'story' } as const;

export function ActivityWorkitems({ tasks, data, boardId, details }: {
    tasks: Task[]; data: BoardData; boardId: string; details: ActivityDetails;
}) {
    const { t } = useI18n();
    const current = useAppStore(state => state.portfolioBoards.find(board => board.id === boardId)?.data);
    return !tasks.length ? <p className="dashboard-activity-empty">{t('dashboard.noActivity')}</p> : <ul className="dashboard-activity-list dashboard-widget-list" aria-label={details.label || t(`dashboard.section.${details.kind || 'activityDetails'}`)}>
        {tasks.map((task) => {
            const context = data.board.tasks.some((row) => row.id === task.id && row.createdAt === task.createdAt) ? data : details.contexts.get(task.id) || data;
            const state = getWorkflow(context, task).states.find((state) => state.id === task.status);
            const type = workitemType(task);
            const responsible = task.responsible?.trim();
            const initials = responsible?.split(/\s+/u).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase();
            return <li key={task.id} data-dashboard-workitem={task.id}>
                <div className="dashboard-activity-identity"><button type="button" className="dashboard-link dashboard-activity-id" onClick={() => actions.openPortfolioTaskDetails(boardId, task.id, current?.board.tasks.some(row => row.id === task.id && row.createdAt === task.createdAt) ? {} : { boardData: context, readOnly: true, historyEventIndex: details.historyEventIndex })}>{workitemLabel(task)}</button><span className="dashboard-truncate" title={task.title}>{task.title}</span></div>
                <span className="workitem-type dashboard-activity-type" data-workitem-type={type} title={t(`workitems.type.${type}`)}><span className="dashboard-dot" /><span>{t(`workitems.type.${type}`)}</span></span>
                <span className="dashboard-activity-status" title={state?.name || task.status}><span className="dashboard-dot" style={{ background: state?.color || '#949dab' }} /><span>{state?.name || task.status}</span></span>
                <span className="dashboard-activity-avatar" role="img" aria-label={responsible || t('dashboard.unassigned')} title={responsible || t('dashboard.unassigned')}>{initials || '–'}</span>
            </li>;
        })}
    </ul>;
}

export function DashboardActivity({ historyEventIndex, boardId, data, source, start, end, visible, order, selection, onSelect }: {
    historyEventIndex?: number; boardId: string; data: BoardData; source: BoardData; start: string; end: string;
    visible: readonly ActivityWidget[]; order: readonly ActivityWidget[]; selection: DashboardSelection; onSelect: (selection: DashboardSelection) => void;
}) {
    const { t } = useI18n();
    const { period, current } = useMemo(() => ({ period: dashboardPeriodWorkitems(source, data, '', start, end), current: dashboardInProgress(data) }), [source, data, start, end]);
    const selected = selection && 'kind' in selection ? selection.kind : null;
    const groups = {
        started: { tasks: period.started, dates: period.startedAt },
        completedInPeriod: { tasks: period.completed, dates: period.completedAt },
        currentlyInProgress: { tasks: current, dates: undefined },
        testing: { tasks: period.testing, dates: period.testingAt },
        userStoriesCreated: { tasks: period.created, dates: undefined }
    };
    const available = (kind: ActivityKind) => ['currentlyInProgress', 'userStoriesCreated'].includes(kind) || period.available;
    if (!visible.length) return null;
    return <>{order.filter((key) => visible.includes(key)).map((key) => {
        if (key === 'activitySummary') return <section key={key} className="dashboard-panel dashboard-activity-summary" data-dashboard-section={key}>
            <h3><WorkspaceIcon name="chart" />{t('dashboard.section.activitySummary')}</h3>
            <div className="dashboard-activity-totals">{(['started', 'completedInPeriod', 'currentlyInProgress', 'testing', 'userStoriesCreated'] as const).map((kind) => <button key={kind} type="button" className={`dashboard-activity-total dashboard-activity-${kind}`} aria-pressed={selected === kind} disabled={!available(kind)} onClick={() => onSelect({ kind })}>
                <span className="dashboard-activity-icon" aria-hidden="true"><WorkspaceIcon name={icons[kind]} /></span><span>{t(`dashboard.activity.${kind}`)}<strong>{available(kind) ? groups[kind].tasks.length : t('dashboard.na')}</strong></span>
            </button>)}</div>
        </section>;
        const kind = key === 'activityDetails' ? selected : key;
        const drill = key === 'activityDetails' && selection && 'tasks' in selection ? selection : null;
        const title = drill?.name || (key === 'activityDetails' && kind ? t(`dashboard.activity.${kind}`) : t(`dashboard.section.${kind || 'activityDetails'}`));
        return <section key={key} className={`dashboard-panel dashboard-activity-detail${kind ? ` dashboard-activity-${kind}` : ''}`} data-dashboard-section={key}>
            <h3><span className="dashboard-activity-icon" aria-hidden="true"><WorkspaceIcon name={kind ? icons[kind] : 'search'} /></span>{title}</h3>
            {drill ? <ActivityWorkitems tasks={drill.tasks} data={drill.data} boardId={boardId} details={{ label: title, contexts: new Map() }} />
                : !kind ? <p className="dashboard-activity-empty">{t('dashboard.detailHint')}</p>
                : !available(kind) ? <p className="dashboard-note">{t('dashboard.noHistoryBaseline')}</p> : <ActivityWorkitems tasks={groups[kind].tasks} data={kind === 'testing' ? source : data} boardId={boardId} details={{ kind, historyEventIndex: kind === 'testing' ? undefined : historyEventIndex, contexts: period.contexts, dates: groups[kind].dates }} />}
        </section>;
    })}</>;
}
