import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { BoardData, Task } from '@/domain/types';
import { dashboardHistory, dashboardMetrics, dashboardPlanning, dashboardSprints, dashboardTasks, dashboardSprintScopeChanges } from '@/domain/dashboard';
import { getRoadmapAxisTicks, getRoadmapDatePosition, getRoadmapTimelinePlacement, getVisibleRoadmapDateRange, parseRoadmapIsoDate } from '@/domain/roadmap';
import { getWorkflow, workflowKind } from '@/domain/workflow';
import { workitemLabel } from '@/domain/taskIdentity';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries/portfolioTimelineViews';
import { navigateToRoadmapItem } from '@/features/portfolio/commands/roadmapNavigation';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';
import { useLocalToday } from '@/shared/hooks/useLocalToday';

type Metrics = ReturnType<typeof dashboardMetrics>;
type Planning = ReturnType<typeof dashboardPlanning>;
type Drill = { name: string; tasks: Task[]; data: BoardData };
type Inspect = (name: string, tasks: Task[], data?: BoardData) => void;

function MetricCards({ metrics, inspect }: { metrics: Metrics; inspect: Inspect }) {
    const { t, language } = useI18n();
    const percent = metrics.progress.percent;
    return <>
        <div className="dashboard-kpis">
            <button type="button" className="dashboard-kpi" data-dashboard-kpi="progress" onClick={() => inspect(t('dashboard.progress'), metrics.eligible)}>
                <span>{t('dashboard.progress')}</span><strong>{percent === null ? t('dashboard.na') : `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(percent)}%`}</strong>
                <small>{t('dashboard.progressRule', { done: metrics.completed.length, total: metrics.eligible.length })}</small>
            </button>
            {(['open', 'completed', 'inProgress', 'pending', 'blocked', 'overdue', 'unassigned', 'undated', 'cancelled'] as const).map((key) => <button type="button" className="dashboard-kpi" data-dashboard-kpi={key} key={key}
                disabled={metrics[key] === null} onClick={() => inspect(t(`dashboard.${key}`), metrics[key] || [])}>
                <span>{t(`dashboard.${key}`)}</span><strong>{metrics[key] === null ? t('dashboard.na') : metrics[key].length}</strong>
            </button>)}
        </div>
    </>;
}

function Distribution({ metrics, data, inspect }: { metrics: Metrics; data: BoardData; inspect: Inspect }) {
    const { t } = useI18n();
    const stateLabel = (task: Task) => `${data.extensions.functionalWorkflow ? `${t(`project.workflow.${workflowKind(task)}`)} · ` : ''}${getWorkflow(data, task).states.find((state) => state.id === task.status)?.name || task.status}`;
    return <div className="dashboard-columns">
        <section className="dashboard-panel"><h3>{t('dashboard.distribution')}</h3>
            {metrics.states.map((group) => <button className="dashboard-chart-row" type="button" key={group.id} onClick={() => inspect(stateLabel(group.tasks[0]), group.tasks)}>
                <span>{stateLabel(group.tasks[0])}</span>
                <span className="dashboard-chart-track" aria-hidden="true"><span style={{ width: `${group.tasks.length / Math.max(1, metrics.tasks.length) * 100}%` }} /></span><strong>{group.tasks.length}</strong>
            </button>)}
            {!metrics.states.length && <p>{t('dashboard.noWorkitems')}</p>}
        </section>
        <section className="dashboard-panel"><h3>{t('dashboard.typeCounts')}</h3>
            {metrics.types.map((group) => <button className="dashboard-chart-row" type="button" key={group.type} onClick={() => inspect(t(`workitems.type.${group.type}`), group.tasks)}>
                <span>{t(`workitems.type.${group.type}`)}</span><span className="dashboard-chart-track" aria-hidden="true"><span style={{ width: `${group.tasks.length / Math.max(1, metrics.tasks.length) * 100}%` }} /></span><strong>{group.tasks.length}</strong>
            </button>)}
        </section>
    </div>;
}

function PlanningChart({ planning, asOf, today, inspect, openRoadmap }: { planning: Planning; asOf: string; today: string; inspect: Inspect; openRoadmap: (group: Planning[number]) => void }) {
    const { t, language } = useI18n();
    const roadmap = { version: 4, phases: planning.filter((row) => row.kind === 'phases').map((row) => row.item), milestones: planning.filter((row) => row.kind === 'milestones').map((row) => row.item), sprints: [] };
    const range = getVisibleRoadmapDateRange(roadmap);
    const marker = (date: string) => {
        const parsed = parseRoadmapIsoDate(date);
        return parsed && parsed >= range.start && parsed <= range.end ? getRoadmapDatePosition(parsed, range) : null;
    };
    const todayPosition = marker(today);
    const asOfPosition = asOf !== today ? marker(asOf) : null;
    return <section className="dashboard-panel"><h3>{t('dashboard.roadmap')}</h3>
        {!planning.length ? <p>{t('dashboard.noPlanning')}</p> : <div className="dashboard-scroll" role="region" tabIndex={0} aria-label={t('dashboard.roadmap')}>
            <div className="dashboard-gantt">
                <div className="dashboard-gantt-axis"><span>{t('dashboard.dates')}</span><div>{getRoadmapAxisTicks(range, language).map((tick) => <span key={tick.position} style={{ left: `${tick.position}%` }}>{tick.label}</span>)}</div></div>
                {planning.map((group) => {
                    const placement = getRoadmapTimelinePlacement(group.item, range);
                    const progress = group.progress.percent === null ? t('dashboard.na') : `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(group.progress.percent)}%`;
                    return <div className="dashboard-gantt-row" key={`${group.kind}:${group.item.id}`} data-dashboard-planning={group.item.id}>
                        <div className="dashboard-gantt-label"><button type="button" className="dashboard-link" onClick={() => inspect(group.item.title, group.tasks)}>{group.item.title} · {progress}</button>
                            <small>{group.item.startDate || group.item.dueDate || t('dashboard.na')} {group.item.endDate ? `→ ${group.item.endDate}` : ''}</small>
                            {group.current && <span className="dashboard-badge">{t('dashboard.scheduled')}</span>}{group.executing && <span className="dashboard-badge">{t('dashboard.executing')}</span>}
                            {group.overdue && <span className="dashboard-late">{t('dashboard.overdue')}</span>}
                            <button type="button" className="dashboard-link" onClick={() => openRoadmap(group)}>{t('dashboard.roadmapLink')}</button>
                        </div>
                        <div className="dashboard-gantt-track">
                            {todayPosition !== null && <span className="dashboard-date-line" style={{ left: `${todayPosition}%` }} title={t('dashboard.today', { date: today })} />}
                            {asOfPosition !== null && <span className="dashboard-date-line snapshot" style={{ left: `${asOfPosition}%` }} title={t('dashboard.asOf', { date: asOf })} />}
                            {placement ? <button type="button" className={`dashboard-gantt-bar${group.kind === 'milestones' ? ' milestone' : ''}${group.current ? ' current' : ''}`} style={{ left: `${placement.left}%`, width: group.kind === 'milestones' ? undefined : `${Math.max(placement.width, 1)}%` }}
                                aria-label={`${group.item.title} · ${progress} · ${t('dashboard.progressRule', { done: group.progress.completed, total: group.progress.eligible })}`} onClick={() => inspect(group.item.title, group.tasks)}>
                                {group.kind === 'milestones' ? '◆' : progress}
                            </button> : <span>{t('dashboard.na')}</span>}
                        </div>
                    </div>;
                })}
            </div>
        </div>}
        <p className="dashboard-note">{t('dashboard.today', { date: today })}{asOf !== today ? ` · ${t('dashboard.asOf', { date: asOf })}` : ''} · {t('dashboard.noBaseline')}</p>
    </section>;
}

function Team({ metrics, inspect }: { metrics: Metrics; inspect: Inspect }) {
    const { t } = useI18n();
    return <section className="dashboard-panel"><h3>{t('dashboard.team')}</h3>
        <div className="dashboard-scroll"><table className="dashboard-table"><thead><tr><th>{t('task.responsible')}</th><th>{t('dashboard.participation')}</th><th>{t('dashboard.inProgress')}</th><th>{t('dashboard.completed')}</th><th>{t('dashboard.pending')}</th></tr></thead>
            <tbody>{metrics.team.map((group) => <tr key={group.name}><th>{group.name || t('dashboard.unassigned')}</th>
                {(['tasks', 'inProgress', 'completed', 'pending'] as const).map((key) => <td key={key}><button type="button" className="dashboard-link" onClick={() => inspect(group.name || t('dashboard.unassigned'), group[key])}>{group[key].length}</button></td>)}
            </tr>)}</tbody></table></div>
        {!metrics.team.length && <p>{t('dashboard.noWorkitems')}</p>}
    </section>;
}

function SprintAnalytics({ data, phaseId, asOf, inspect }: { data: BoardData; phaseId: string; asOf: string; inspect: Inspect }) {
    const { t } = useI18n();
    const sprints = useMemo(() => dashboardSprints(data, phaseId, asOf), [data, phaseId, asOf]);
    const [selected, setSelected] = useState<string[]>([]);
    const selectedIds = selected.filter((id) => sprints.some((sprint) => sprint.item.id === id));
    const visible = selectedIds.length ? sprints.filter((sprint) => selectedIds.includes(sprint.item.id)) : sprints;
    const single = selectedIds.length === 1 ? visible[0] : null;
    const scopeChanges = useMemo(() => single ? dashboardSprintScopeChanges(data, single.item.id, phaseId) : [], [data, single, phaseId]);
    return <>
        <section className="dashboard-panel"><h3>{t('dashboard.sprints')}</h3>
            <fieldset className="dashboard-sprint-selection"><legend className="sr-only">{t('dashboard.sprints')}</legend>
                <label><input type="checkbox" checked={!selectedIds.length} onChange={() => setSelected([])} />{t('dashboard.allSprints')}</label>
                {sprints.map((sprint) => <label key={sprint.item.id}><input type="checkbox" checked={selectedIds.includes(sprint.item.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, sprint.item.id] : ids.filter((id) => id !== sprint.item.id))} />
                    {t('table.sprintIdentity', { number: sprint.number || t('dashboard.na'), name: sprint.item.title })}
                </label>)}
            </fieldset>
            <p className="dashboard-note">{t('dashboard.sprintNote')}</p>
            {!sprints.length ? <p>{t('dashboard.noSprints')}</p> : <div className="dashboard-scroll"><table className="dashboard-table"><thead><tr><th>{t('roadmap.sprint')}</th><th>{t('dashboard.dates')}</th><th>{t('task.status')}</th><th>{t('dashboard.participation')}</th><th>{t('dashboard.completed')}</th><th>{t('dashboard.open')}</th></tr></thead>
                <tbody>{visible.map((sprint) => <tr key={sprint.item.id} data-dashboard-sprint={sprint.item.id}>
                    <th>{t('table.sprintIdentity', { number: sprint.number || t('dashboard.na'), name: sprint.item.title })}</th><td>{sprint.item.startDate || t('dashboard.na')} → {sprint.item.endDate || t('dashboard.na')}</td><td>{t(`table.sprintStatus.${sprint.status}`)}</td>
                    <td><button type="button" className="dashboard-link" onClick={() => inspect(sprint.item.title, sprint.tasks, sprint.data)}>{sprint.tasks.length}</button></td>
                    <td><button type="button" className="dashboard-link" onClick={() => inspect(`${sprint.item.title} · ${t('dashboard.completed')}`, sprint.metrics.completed, sprint.data)}>{sprint.metrics.completed.length}</button></td>
                    <td><button type="button" className="dashboard-link" onClick={() => inspect(`${sprint.item.title} · ${t('dashboard.open')}`, sprint.metrics.open, sprint.data)}>{sprint.metrics.open.length}</button></td>
                </tr>)}</tbody></table></div>}
        </section>
        <section className="dashboard-panel"><h3>{t('dashboard.sprintMetrics')}</h3><div className="dashboard-kpis">
            {(['sprintCapacity', 'plannedSp', 'completedSp', 'completionRate', 'velocity'] as const).map((key) => <div className="dashboard-kpi" key={key}><span>{t(`dashboard.${key}`)}</span><strong>{t('dashboard.na')}</strong></div>)}
        </div><p className="dashboard-note">{t('dashboard.noSp')}</p></section>
        <div className="dashboard-columns">{(['plannedChart', 'burndown', 'carryOver'] as const).map((key) => <section className="dashboard-panel" key={key}><h3>{t(`dashboard.${key}`)}</h3><p>{t(key === 'carryOver' ? 'dashboard.noClosure' : 'dashboard.noSp')}</p></section>)}</div>
        {single && <section className="dashboard-panel"><h3>{t('table.sprintIdentity', { number: single.number || t('dashboard.na'), name: single.item.title })}</h3>
            <Distribution metrics={single.metrics} data={single.data} inspect={(name, tasks) => inspect(name, tasks, single.data)} />
            <h4>{t('dashboard.scopeChanges')}</h4>
            {!scopeChanges.length ? <p>{t('dashboard.noScopeChanges')}</p> : <ul className="dashboard-scope-changes">{scopeChanges.map((change, index) => <li key={index}>
                <button type="button" className="dashboard-link" onClick={() => inspect(`${t(`dashboard.${change.kind}`)} · ${change.at}`, change.tasks, change.data)}>{change.at} · {t(`dashboard.${change.kind}`)} · {change.tasks.length}</button>
            </li>)}</ul>}
            <dl className="dashboard-details"><dt>{t('dashboard.sprintGoal')}</dt><dd>{t('dashboard.notRecorded')}</dd><dt>{t('dashboard.review')}</dt><dd>{t('dashboard.notRecorded')}</dd></dl>
        </section>}
    </>;
}

function Drilldown({ drill, boardId }: { drill: Drill | null; boardId: string }) {
    const { t } = useI18n();
    const actions = usePortfolioActions();
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => { if (drill) heading.current?.focus(); }, [drill]);
    return <section className="dashboard-panel dashboard-drilldown" id="dashboardSources" aria-labelledby="dashboardSourcesTitle">
        <h3 id="dashboardSourcesTitle" ref={heading} tabIndex={-1}>{drill ? t('dashboard.drilldown', { name: drill.name }) : t('dashboard.drillHint')}</h3>
        {drill && <><p>{t('dashboard.sourceCount', { count: drill.tasks.length })}</p>
            {!drill.tasks.length ? <p>{t('dashboard.noSources')}</p> : <div className="dashboard-scroll"><table className="dashboard-table"><thead><tr><th>ID</th><th>{t('task.title')}</th><th>{t('task.status')}</th><th>{t('task.responsible')}</th><th>{t('dashboard.dates')}</th></tr></thead>
                <tbody>{drill.tasks.map((task) => <tr key={task.id}><td>{workitemLabel(task)}</td><td><button type="button" className="dashboard-link" onClick={() => actions.openPortfolioTaskDetails(boardId, task.id, { boardData: drill.data, readOnly: true })}>{task.title}</button></td>
                    <td>{getWorkflow(drill.data, task).states.find((state) => state.id === task.status)?.name || task.status}</td><td>{task.responsible || t('dashboard.na')}</td><td>{task.dueDate || t('dashboard.na')}</td>
                </tr>)}</tbody></table></div>}
        </>}
    </section>;
}

function Dashboard({ boardId }: { boardId: string }) {
    const state = useAppStore(useShallow((value) => ({ portfolioBoards: value.portfolioBoards, selectedPortfolioBoardId: value.selectedPortfolioBoardId, portfolioTimelineSelection: value.portfolioTimelineSelection })));
    const timeline = useMemo(() => getSelectedPortfolioTimelineView(state), [state]);
    const board = timeline?.boardRecord;
    const historyUnavailable = timeline?.isPreview && !timeline.timeline?.events[0]?.snapshot?.board;
    const data = useMemo(() => {
        if (historyUnavailable) return null;
        if (timeline?.isPreview && timeline.projectedBoard && timeline.timeline) return {
            ...timeline.projectedBoard,
            extensions: { ...timeline.projectedBoard.extensions, timeline: { ...timeline.timeline, events: timeline.timeline.events.slice(0, timeline.selectedIndex! + 1) } }
        };
        return board?.data;
    }, [historyUnavailable, timeline, board]);
    const today = useLocalToday();
    const { t } = useI18n();
    const actions = usePortfolioActions();
    const [tab, setTab] = useState<'overview' | 'sprintAnalytics'>('overview');
    const [phaseId, setPhaseId] = useState('');
    const [drill, setDrill] = useState<Drill | null>(null);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const activePhase = data?.extensions.roadmap?.phases.some((phase) => phase.id === phaseId) ? phaseId : '';
    const asOf = timeline?.isPreview ? timeline.selectedEvent!.at.slice(0, 10) : today;
    const tasks = useMemo(() => data ? dashboardTasks(data, activePhase) : [], [data, activePhase]);
    const metrics = useMemo(() => data ? dashboardMetrics(data, tasks, asOf) : null, [data, tasks, asOf]);
    const planning = useMemo(() => data ? dashboardPlanning(data, activePhase, asOf) : [], [data, activePhase, asOf]);
    const invalidPeriod = Boolean(from && to && from > to);
    const observations = useMemo(() => board && !invalidPeriod ? dashboardHistory(board.data, activePhase, from, to).filter((point) => !timeline?.isPreview || point.index <= timeline.selectedIndex!) : [], [board, activePhase, from, to, invalidPeriod, timeline]);
    // Changing source state invalidates a drilldown so old rows cannot masquerade as current data.
    const source = useRef(data);
    useEffect(() => { if (source.current !== data) { source.current = data; setDrill(null); } }, [data]);
    if (historyUnavailable) return <section className="dashboard-panel"><p>{t('dashboard.noHistoryBaseline')}</p><button type="button" className="btn" onClick={() => actions.movePortfolioTimelineToLatest(boardId)}>{t('dashboard.current')}</button></section>;
    if (!board || !data || !metrics || !timeline) return null;
    const inspect: Inspect = (name, members, context = data) => setDrill({ name, tasks: members, data: context });
    const openRoadmap = (group: Planning[number]) => navigateToRoadmapItem(boardId, group.kind, group.item.id, data);
    return <>
        <header className="dashboard-heading"><div><h2>{t('dashboard.title')} · {board.title || board.fileName}</h2><p role="status">{timeline.isPreview ? t('dashboard.historical', { at: timeline.selectedEvent!.at }) : t('dashboard.current')}</p></div>
            <div className="dashboard-controls"><label>{t('dashboard.snapshot')}<select aria-label={t('dashboard.snapshot')} value={timeline.isPreview ? String(timeline.selectedIndex) : 'current'} onChange={(event) => event.target.value === 'current' ? actions.movePortfolioTimelineToLatest(boardId) : actions.setPortfolioTimelineSelection(boardId, Number(event.target.value))}>
                <option value="current">{t('dashboard.current')}</option>{timeline.timeline?.events[0]?.snapshot?.board && timeline.timeline.events.slice(0, -1).map((event, index) => <option value={index} key={event.id}>{event.at} · {event.summary}</option>)}
            </select></label>
            <label>{t('dashboard.scope')}<select aria-label={t('dashboard.scope')} value={activePhase} onChange={(event) => { setPhaseId(event.target.value); setDrill(null); }}><option value="">{t('dashboard.allPhases')}</option>{data.extensions.roadmap?.phases.map((phase) => <option value={phase.id} key={phase.id}>{phase.title}</option>)}</select></label></div>
        </header>
        <p className="dashboard-note">{t('dashboard.scopeNote')}</p><p className="dashboard-note">{t('dashboard.noWorkstreams')}</p>
        <div className="dashboard-tabs" role="group" aria-label={t('dashboard.title')}>
            {(['overview', 'sprintAnalytics'] as const).map((value) => <button type="button" className={`btn${tab === value ? ' active' : ''}`} key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setDrill(null); }}>{t(`dashboard.${value}`)}</button>)}
        </div>
        <div hidden={tab !== 'overview'}>
            <section className="dashboard-panel"><h3>{t('dashboard.projectProgress')}</h3><MetricCards metrics={metrics} inspect={inspect} /></section>
            <Distribution metrics={metrics} data={data} inspect={inspect} />
            <PlanningChart planning={planning} asOf={asOf} today={today} inspect={inspect} openRoadmap={openRoadmap} />
            <Team metrics={metrics} inspect={inspect} />
            <section className="dashboard-panel"><h3>{t('dashboard.projectControl')}</h3><p>{t('dashboard.noControl')}</p></section>
        </div>
        <div hidden={tab !== 'sprintAnalytics'}><SprintAnalytics data={data} phaseId={activePhase} asOf={asOf} inspect={inspect} /></div>
        <Drilldown drill={drill} boardId={boardId} />
        <section className="dashboard-panel"><h3>{t('dashboard.history')}</h3><p className="dashboard-note">{t('dashboard.historyNote')}</p>
            <div className="dashboard-controls"><label>{t('dashboard.from')}<input aria-label={t('dashboard.from')} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>{t('dashboard.to')}<input aria-label={t('dashboard.to')} type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label></div>
            {invalidPeriod ? <p role="alert">{t('dashboard.invalidPeriod')}</p> : !observations.length ? <p>{t('dashboard.noHistory')}</p> : <div className="dashboard-scroll dashboard-history"><table className="dashboard-table"><thead><tr><th>{t('dashboard.observation')}</th><th>{t('dashboard.completed')}</th><th>{t('dashboard.open')}</th><th>{t('dashboard.progress')}</th></tr></thead><tbody>
                {observations.map((point) => <tr key={point.index}><td><button className="dashboard-link" type="button" onClick={() => actions.setPortfolioTimelineSelection(boardId, point.index)}>{point.at}</button></td><td>{point.metrics.completed.length}</td><td>{point.metrics.open.length}</td><td>{point.metrics.progress.percent === null ? t('dashboard.na') : `${Math.round(point.metrics.progress.percent)}%`}</td></tr>)}
            </tbody></table></div>}
        </section>
    </>;
}

export function PortfolioDashboard({ hidden }: { hidden: boolean }) {
    const boardId = useAppStore((state) => state.selectedPortfolioBoardId);
    return <section id="portfolioDashboard" className={`portfolio-dashboard${hidden ? ' hidden' : ''}`} aria-label="Dashboard">{boardId && <Dashboard key={boardId} boardId={boardId} />}</section>;
}
