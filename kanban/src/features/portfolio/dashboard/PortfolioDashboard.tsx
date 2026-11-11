import { ActivityWorkitems, type ActivityDetails, type DashboardInspect } from './DashboardActivity';
import { ACTIVITY_WIDGETS, dashboardActivityLayout, isActivityWidget, type ActivityWidget, type DashboardActivityLayout } from '@/domain/dashboardActivityLayout';
import { permanentBlockedIds } from '@/domain/permanentRelations';
import { formatDate } from '@/domain/dates';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { useTableDisclosure } from '@/features/portfolio/table/useTableDisclosure';
import { DateInput } from '@/shared/ui/DateInput';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { BoardData, RoadmapItem, Task } from '@/domain/types';
import { dashboardMetrics, dashboardSprints, dashboardSprintScopeChanges } from '@/domain/dashboard';
import { DASHBOARD_SECTIONS, dashboardSnapshot, type DashboardSection } from '@/domain/dashboardOverview';
import { DashboardOverview } from './DashboardOverview';
import { getWorkflow, workflowKind } from '@/domain/workflow';
import { workitemLabel } from '@/domain/taskIdentity';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries/portfolioTimelineViews';
import { navigateToRoadmapItem } from '@/features/portfolio/commands/roadmapNavigation';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';
import { useLocalToday } from '@/shared/hooks/useLocalToday';

type Metrics = ReturnType<typeof dashboardMetrics>;
type Drill = { name: string; tasks: Task[]; data: BoardData; historyEventIndex?: number; activity?: ActivityDetails };
type Inspect = DashboardInspect;

function Distribution({ metrics, data, inspect }: { metrics: Metrics; data: BoardData; inspect: Inspect }) {
    const { t } = useI18n();
    const stateLabel = (task: Task) => `${data.extensions.functionalWorkflow ? `${t(`project.workflow.${workflowKind(task)}`)} · ` : ''}${getWorkflow(data, task).states.find((state) => state.id === task.status)?.name || task.status}`;
    return <div className="dashboard-columns">
        <section className="dashboard-panel"><h3><WorkspaceIcon name="chart" />{t('dashboard.distribution')}</h3>
            {metrics.states.map((group) => <button className="dashboard-chart-row" type="button" key={group.id} onClick={() => inspect(stateLabel(group.tasks[0]), group.tasks)}>
                <span>{stateLabel(group.tasks[0])}</span>
                <span className="dashboard-chart-track" aria-hidden="true"><span style={{ width: `${group.tasks.length / Math.max(1, metrics.tasks.length) * 100}%` }} /></span><strong>{group.tasks.length}</strong>
            </button>)}
            {!metrics.states.length && <p>{t('dashboard.noWorkitems')}</p>}
        </section>
        <section className="dashboard-panel"><h3><WorkspaceIcon name="folder" />{t('dashboard.typeCounts')}</h3>
            {metrics.types.map((group) => <button className="dashboard-chart-row" type="button" key={group.type} onClick={() => inspect(t(`workitems.type.${group.type}`), group.tasks)}>
                <span>{t(`workitems.type.${group.type}`)}</span><span className="dashboard-chart-track" aria-hidden="true"><span style={{ width: `${group.tasks.length / Math.max(1, metrics.tasks.length) * 100}%` }} /></span><strong>{group.tasks.length}</strong>
            </button>)}
        </section>
    </div>;
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
        <section className="dashboard-panel"><h3><WorkspaceIcon name="runner" />{t('dashboard.sprints')}</h3>
            <fieldset className="dashboard-sprint-selection"><legend className="sr-only">{t('dashboard.sprints')}</legend>
                <label><input type="checkbox" checked={!selectedIds.length} onChange={() => setSelected([])} />{t('dashboard.allSprints')}</label>
                {sprints.map((sprint) => <label key={sprint.item.id}><input type="checkbox" checked={selectedIds.includes(sprint.item.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, sprint.item.id] : ids.filter((id) => id !== sprint.item.id))} />
                    {t('table.sprintIdentity', { number: sprint.number || t('dashboard.na'), name: sprint.item.title })}
                </label>)}
            </fieldset>
            <p className="dashboard-note">{t('dashboard.sprintNote')}</p>
            {!sprints.length ? <p>{t('dashboard.noSprints')}</p> : <div className="dashboard-scroll"><table className="dashboard-table"><thead><tr><th>{t('roadmap.sprint')}</th><th>{t('dashboard.dates')}</th><th>{t('task.status')}</th><th>{t('dashboard.participation')}</th><th>{t('dashboard.completed')}</th><th>{t('dashboard.open')}</th></tr></thead>
                <tbody>{visible.map((sprint) => <tr key={sprint.item.id} data-dashboard-sprint={sprint.item.id}>
                    <th>{t('table.sprintIdentity', { number: sprint.number || t('dashboard.na'), name: sprint.item.title })}</th><td>{formatDate(sprint.item.startDate || '') || t('dashboard.na')} → {formatDate(sprint.item.endDate || '') || t('dashboard.na')}</td><td>{t(`table.sprintStatus.${sprint.status}`)}</td>
                    <td><button type="button" className="dashboard-link" onClick={() => inspect(sprint.item.title, sprint.tasks, sprint.data)}>{sprint.tasks.length}</button></td>
                    <td><button type="button" className="dashboard-link" onClick={() => inspect(`${sprint.item.title} · ${t('dashboard.completed')}`, sprint.metrics.completed, sprint.data)}>{sprint.metrics.completed.length}</button></td>
                    <td><button type="button" className="dashboard-link" onClick={() => inspect(`${sprint.item.title} · ${t('dashboard.open')}`, sprint.metrics.open, sprint.data)}>{sprint.metrics.open.length}</button></td>
                </tr>)}</tbody></table></div>}
        </section>
        <section className="dashboard-panel"><h3><WorkspaceIcon name="progress" />{t('dashboard.sprintMetrics')}</h3><div className="dashboard-kpis">
            {(['sprintCapacity', 'plannedSp', 'completedSp', 'completionRate', 'velocity'] as const).map((key) => <div className="dashboard-kpi" key={key}><span>{t(`dashboard.${key}`)}</span><strong>{t('dashboard.na')}</strong></div>)}
        </div><p className="dashboard-note">{t('dashboard.noSp')}</p></section>
        <div className="dashboard-columns">{(['plannedChart', 'burndown', 'carryOver'] as const).map((key) => <section className="dashboard-panel" key={key}><h3><WorkspaceIcon name="chart" />{t(`dashboard.${key}`)}</h3><p>{t(key === 'carryOver' ? 'dashboard.noClosure' : 'dashboard.noSp')}</p></section>)}</div>
        {single && <section className="dashboard-panel"><h3><WorkspaceIcon name="runner" />{t('table.sprintIdentity', { number: single.number || t('dashboard.na'), name: single.item.title })}</h3>
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
        <h3 id="dashboardSourcesTitle" ref={heading} tabIndex={-1}><WorkspaceIcon name="search" />{drill ? t('dashboard.drilldown', { name: drill.name }) : t('dashboard.drillHint')}</h3>
        {drill && <><p>{t('dashboard.sourceCount', { count: drill.tasks.length })}</p>
            {drill.activity ? <ActivityWorkitems tasks={drill.tasks} data={drill.data} boardId={boardId} details={drill.activity} /> : !drill.tasks.length ? <p>{t('dashboard.noSources')}</p> : <div className="dashboard-scroll"><table className="dashboard-table"><thead><tr><th>ID</th><th>{t('task.title')}</th><th>{t('task.status')}</th><th>{t('task.responsible')}</th><th>{t('dashboard.dates')}</th></tr></thead>
                <tbody>{drill.tasks.map((task) => <tr key={task.id}><td>{workitemLabel(task)}</td><td><button type="button" className="dashboard-link" onClick={() => actions.openPortfolioTaskDetails(boardId, task.id, { boardData: drill.data, readOnly: true, historyEventIndex: drill.historyEventIndex })}>{task.title}</button></td>
                    <td>{getWorkflow(drill.data, task).states.find((state) => state.id === task.status)?.name || task.status}</td><td>{task.responsible || t('dashboard.na')}</td><td>{formatDate(task.dueDate || '') || t('dashboard.na')}</td>
                </tr>)}</tbody></table></div>}
        </>}
    </section>;
}

function Dashboard({ boardId, hidden }: { boardId: string; hidden: boolean }) {
    const state = useAppStore(useShallow((value) => ({ portfolioBoards: value.portfolioBoards, selectedPortfolioBoardId: value.selectedPortfolioBoardId, portfolioTimelineSelection: value.portfolioTimelineSelection, unloadedRelationSources: value.unloadedRelationSources })));
    const timeline = useMemo(() => hidden ? null : getSelectedPortfolioTimelineView(state), [hidden, state]);
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
    const dates = useTableDisclosure(hidden);
    const sections = useTableDisclosure(hidden);
    const [drill, setDrill] = useState<Drill | null>(null);
    const [from, setFrom] = useState(() => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 7); return date.toISOString().slice(0, 10); });
    const [to, setTo] = useState('');
    const [visible, setVisible] = useState<DashboardSection[]>([...DASHBOARD_SECTIONS]);
    const [localActivityLayout, setLocalActivityLayout] = useState<DashboardActivityLayout | null>(null);
    const activityLayout = localActivityLayout || dashboardActivityLayout(board?.data.extensions.dashboardActivity);
    const shown = [...visible.filter((key) => !isActivityWidget(key)), ...activityLayout.order.filter((key) => !activityLayout.hidden.includes(key))];
    const canSaveLayout = Boolean(board?.handle && !timeline?.isPreview);
    const changeActivityLayout = (layout: DashboardActivityLayout) => {
        setDrill(null);
        if (canSaveLayout) { setLocalActivityLayout(null); void actions.saveDashboardActivityLayout(boardId, layout); }
        else setLocalActivityLayout(layout);
    };
    const changeVisibility = (key: DashboardSection, checked: boolean) => {
        if (isActivityWidget(key)) changeActivityLayout({ ...activityLayout, hidden: checked ? activityLayout.hidden.filter((value) => value !== key) : [...activityLayout.hidden, key] });
        else setVisible((current) => checked ? [...current, key] : current.filter((value) => value !== key));
        setDrill(null);
    };
    const moveActivity = (key: ActivityWidget, delta: number) => {
        const order = [...activityLayout.order];
        const index = order.indexOf(key);
        const target = index + delta;
        if (target < 0 || target >= order.length) return;
        [order[index], order[target]] = [order[target], order[index]];
        changeActivityLayout({ ...activityLayout, order });
    };
    const referenceDate = timeline?.isPreview ? timeline.selectedEvent!.at.slice(0, 10) : today;
    const end = to || referenceDate;
    const invalidPeriod = from > end;
    const snapshot = useMemo(() => !hidden && data && !invalidPeriod ? dashboardSnapshot(data, end, today) : null, [hidden, data, end, today, invalidPeriod]);
    const displayData = snapshot?.data;
    const dependencyBlockedIds = useMemo(() => displayData ? permanentBlockedIds(displayData,
        timeline?.isPreview || end < today ? [{ id: boardId, data: displayData }] : state.portfolioBoards.map(project => project.id === boardId ? { ...project, data: displayData } : project),
        timeline?.isPreview || end < today ? [] : state.unloadedRelationSources.flatMap(entry => entry.relations)) : new Set<number>(),
    [displayData, timeline?.isPreview, end, today, state.portfolioBoards, state.unloadedRelationSources, boardId]);
    // Changing source state invalidates a drilldown so old rows cannot masquerade as current data.
    const source = useRef(displayData);
    useEffect(() => { if (source.current !== displayData) { source.current = displayData; setDrill(null); } }, [displayData]);
    if (hidden) return null;
    if (historyUnavailable) return <section className="dashboard-panel"><p>{t('dashboard.noHistoryBaseline')}</p><button type="button" className="btn" onClick={() => actions.movePortfolioTimelineToLatest(boardId)}>{t('dashboard.current')}</button></section>;
    if (!board || !data || !timeline) return null;
    const inspect: Inspect = (name, members, context = displayData || data, activity) => setDrill({ name, tasks: members, data: context, historyEventIndex: context === displayData ? snapshot?.index ?? undefined : undefined, activity });
    const openRoadmap = (kind: 'phases' | 'milestones' | 'sprints', item: RoadmapItem) => {
        if (snapshot?.index !== null && snapshot?.index !== undefined) actions.setPortfolioTimelineSelection(boardId, snapshot.index);
        navigateToRoadmapItem(boardId, kind, item.id, displayData || data);
    };
    return <>
        <p className="sr-only dashboard-context" role="status">{timeline.isPreview ? t('dashboard.historical', { at: timeline.selectedEvent!.at }) : end < today ? t('dashboard.asOf', { date: end }) : t('dashboard.current')}</p>
        <div className="dashboard-toolbar">
        <div className="dashboard-tabs" role="group" aria-label={t('dashboard.title')}>
            {(['overview', 'sprintAnalytics'] as const).map((value) => <button type="button" className={`btn${tab === value ? ' active' : ''}`} key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setDrill(null); }}>{t(`dashboard.${value}`)}</button>)}
        </div>
        <div className="dashboard-controls dashboard-filters">
            <details className="dashboard-visible-sections" ref={sections.detailsRef} onKeyDown={sections.onKeyDown} onToggle={sections.onToggle}><summary className="btn icon-btn" ref={sections.summaryRef} aria-label={t('dashboard.visibleSections')} title={t('dashboard.visibleSections')}><WorkspaceIcon name="settings" /></summary><fieldset data-table-panel><legend className="sr-only">{t('dashboard.visibleSections')}</legend>
                {DASHBOARD_SECTIONS.filter((key) => !isActivityWidget(key)).map((key) => <label key={key}><input type="checkbox" checked={shown.includes(key)} onChange={(event) => changeVisibility(key, event.target.checked)} />{t(`dashboard.section.${key}`)}</label>)}
                <p>{t('dashboard.activityLayout')}</p>
                {activityLayout.order.map((key, index) => <div className="dashboard-layout-row" key={key}>
                    <label><input type="checkbox" checked={shown.includes(key)} onChange={(event) => changeVisibility(key, event.target.checked)} />{t(`dashboard.section.${key}`)}</label>
                    <button type="button" className="btn" aria-label={t('dashboard.moveActivityUp', { name: t(`dashboard.section.${key}`) })} disabled={index === 0} onClick={() => moveActivity(key, -1)}>↑</button>
                    <button type="button" className="btn" aria-label={t('dashboard.moveActivityDown', { name: t(`dashboard.section.${key}`) })} disabled={index === activityLayout.order.length - 1} onClick={() => moveActivity(key, 1)}>↓</button>
                </div>)}
                <button className="btn" type="button" onClick={() => changeActivityLayout(dashboardActivityLayout(null))}>{t('dashboard.resetActivity')}</button>
                {canSaveLayout && <p className="dashboard-note">{t('dashboard.activityShared')}</p>}
                <div className="dashboard-visibility-actions"><button className="btn" type="button" onClick={() => { setVisible([...DASHBOARD_SECTIONS]); changeActivityLayout({ ...activityLayout, hidden: [] }); }}>{t('dashboard.selectAll')}</button><button className="btn" type="button" onClick={() => { setVisible([]); changeActivityLayout({ ...activityLayout, hidden: [...ACTIVITY_WIDGETS] }); }}>{t('dashboard.clearAll')}</button></div>
            </fieldset></details>
            <div className="dashboard-date-range"><span id="dashboardDatesLabel" className="sr-only">{t('dashboard.dateRange')}</span>
                <details ref={dates.detailsRef} onKeyDown={dates.onKeyDown} onToggle={dates.onToggle}>
                    <summary className="btn dashboard-range-field" ref={dates.summaryRef} aria-labelledby="dashboardDatesLabel dashboardDatesValue"><WorkspaceIcon name="planner" /><span id="dashboardDatesValue">{formatDate(from) || t('dashboard.na')} – {formatDate(end)}</span><WorkspaceIcon name="chevronDown" /></summary>
                    <div className="dashboard-range-panel" data-table-panel>
                        <label>{t('dashboard.startDate')}<DateInput aria-label={t('dashboard.startDate')} value={from} max={end} onChange={(event) => { setFrom(event.target.value); setDrill(null); }} /></label>
                        <label>{t('dashboard.endDate')}<DateInput aria-label={t('dashboard.endDate')} value={end} min={from} max={referenceDate} onChange={(event) => { setTo(event.target.value); setDrill(null); }} /></label>
                    </div>
                </details>
            </div>
        </div></div>
        {invalidPeriod ? <p role="alert">{t('dashboard.invalidPeriod')}</p> : !displayData ? <p role="status">{t('dashboard.noHistoryBaseline')}</p> : <>
            <details className="dashboard-reporting-info"><summary aria-label={t('dashboard.reportingInfo')} title={t('dashboard.reportingInfo')}><WorkspaceIcon name="info" /></summary><p className="dashboard-note">{t('dashboard.periodNote', { date: end })}</p></details>
            {tab === 'overview' ? <DashboardOverview historyEventIndex={snapshot?.index ?? undefined} dependencyBlockedIds={dependencyBlockedIds} boardId={boardId} data={displayData} source={data} start={from} end={end} visible={shown} activityOrder={activityLayout.order} inspect={inspect} openRoadmap={openRoadmap} /> : <SprintAnalytics data={displayData} phaseId="" asOf={end} inspect={inspect} />}
        </>}
        {displayData && drill && <Drilldown drill={drill} boardId={boardId} />}
    </>;
}

export function PortfolioDashboard({ hidden }: { hidden: boolean }) {
    const boardId = useAppStore((state) => state.selectedPortfolioBoardId);
    return <section id="portfolioDashboard" className={`portfolio-dashboard${hidden ? ' hidden' : ''}`} aria-label="Dashboard">{boardId && <Dashboard key={boardId} boardId={boardId} hidden={hidden} />}</section>;
}
