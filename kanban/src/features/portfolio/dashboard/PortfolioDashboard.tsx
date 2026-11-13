import type { DashboardInspect, DashboardSelection } from './DashboardActivity';
import { dashboardActivityLayout, type DashboardActivityLayout } from '@/domain/dashboardActivityLayout';
import { permanentBlockedIds } from '@/domain/permanentRelations';
import { formatDate } from '@/domain/dates';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { FloatingPanel, Popover } from '@/shared/ui/FloatingPanel';
import { DateInput } from '@/shared/ui/DateInput';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { RoadmapItem } from '@/domain/types';
import { SprintAnalytics } from './SprintAnalytics';
import { getSprintCatalog } from '@/domain/sprintCatalog';
import { dashboardSnapshot } from '@/domain/dashboardOverview';
import { DashboardOverview } from './DashboardOverview';
import { DashboardWidgetMenu } from './DashboardWidgetMenu';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries/portfolioTimelineViews';
import { navigateToRoadmapItem } from '@/features/portfolio/commands/roadmapNavigation';
import { portfolioActions as actions } from '@/features/portfolio/commands/portfolioCommands';
import { useI18n } from '@/shared/i18n';
import { useLocalToday } from '@/shared/hooks/useLocalToday';

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
    const [tab, setTab] = useState<'overview' | 'sprintAnalytics'>('overview');
    const [datesOpen, setDatesOpen] = useState(false);
    const [selectedSprint, setSelectedSprint] = useState('');
    const sprintOptions = useMemo(() => {
        if (!data || tab !== 'sprintAnalytics') return [];
        const items = new Map((data.extensions.roadmap?.sprints || []).map(sprint => [sprint.id, sprint]));
        for (const closure of data.extensions.sprintResults?.closures || []) items.set(closure.sprintId, closure.sprint);
        const numbers = new Map(getSprintCatalog(data).entries.map(entry => [entry.sprintId, entry.number]));
        return [...items.values()].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '') || (numbers.get(b.id) || 0) - (numbers.get(a.id) || 0));
    }, [data, tab]);
    const selectedSprintId = sprintOptions.some(sprint => sprint.id === selectedSprint) ? selectedSprint : '';
    const [drill, setDrill] = useState<DashboardSelection>(null);
    const [from, setFrom] = useState(() => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 7); return date.toISOString().slice(0, 10); });
    const [to, setTo] = useState('');
    const [localActivityLayout, setLocalActivityLayout] = useState<DashboardActivityLayout | null>(null);
    const activityLayout = localActivityLayout || dashboardActivityLayout(board?.data.extensions.dashboardActivity);
    const shown = activityLayout.order.filter((key) => !activityLayout.hidden.includes(key));
    const canSaveLayout = Boolean(board?.handle && !timeline?.isPreview);
    const changeActivityLayout = (layout: DashboardActivityLayout) => {
        setDrill(null);
        if (canSaveLayout) { setLocalActivityLayout(null); void actions.saveDashboardActivityLayout(boardId, layout); }
        else setLocalActivityLayout(layout);
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
    useEffect(() => { if (source.current !== displayData) { source.current = displayData; setDrill(current => current && 'kind' in current ? current : null); } }, [displayData]);
    if (hidden) return null;
    if (historyUnavailable) return <section className="dashboard-panel"><p>{t('dashboard.noHistoryBaseline')}</p><button type="button" className="btn" onClick={() => actions.movePortfolioTimelineToLatest(boardId)}>{t('dashboard.current')}</button></section>;
    if (!board || !data || !timeline) return null;
    const inspect: DashboardInspect = (name, members, context = displayData || data) => setDrill({ name, tasks: members, data: context, historyEventIndex: context === displayData ? snapshot?.index ?? undefined : undefined });
    const openRoadmap = (kind: 'phases' | 'milestones' | 'sprints', item: RoadmapItem) => {
        if (snapshot?.index !== null && snapshot?.index !== undefined) actions.setPortfolioTimelineSelection(boardId, snapshot.index);
        navigateToRoadmapItem(boardId, kind, item.id, displayData || data);
    };
    return <>
        <p className="sr-only dashboard-context" role="status">{timeline.isPreview ? t('dashboard.historical', { at: timeline.selectedEvent!.at }) : tab === 'overview' && end < today ? t('dashboard.asOf', { date: end }) : t('dashboard.current')}</p>
        <div className="dashboard-toolbar">
        <div className="dashboard-tabs" role="group" aria-label={t('dashboard.title')}>
            {(['overview', 'sprintAnalytics'] as const).map((value) => <button type="button" className={`btn${tab === value ? ' active' : ''}`} key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setDatesOpen(false); setDrill(null); }}>{t(`dashboard.${value}`)}</button>)}
        </div>
        <div className="dashboard-controls dashboard-filters">
            {tab === 'overview' ? <><DashboardWidgetMenu layout={activityLayout} onChange={changeActivityLayout} shared={canSaveLayout} hidden={hidden} />
            <div className="dashboard-date-range"><span id="dashboardDatesLabel" className="sr-only">{t('dashboard.dateRange')}</span>
                <Popover.Root open={datesOpen && !hidden} onOpenChange={setDatesOpen}>
                    <Popover.Trigger asChild><button type="button" className="btn dashboard-range-field" aria-labelledby="dashboardDatesLabel dashboardDatesValue"><WorkspaceIcon name="planner" /><span id="dashboardDatesValue">{formatDate(from) || t('dashboard.na')} – {formatDate(end)}</span><WorkspaceIcon name="chevronDown" /></button></Popover.Trigger>
                    <FloatingPanel className="dashboard-range-panel" data-table-panel aria-labelledby="dashboardDatesLabel">
                        <label>{t('dashboard.startDate')}<DateInput aria-label={t('dashboard.startDate')} value={from} max={end} onChange={(event) => { setFrom(event.target.value); setDrill(current => current && 'kind' in current ? current : null); }} /></label>
                        <label>{t('dashboard.endDate')}<DateInput aria-label={t('dashboard.endDate')} value={end} min={from} max={referenceDate} onChange={(event) => { setTo(event.target.value); setDrill(current => current && 'kind' in current ? current : null); }} /></label>
                    </FloatingPanel>
                </Popover.Root>
            </div></> : <label className="dashboard-sprint-picker"><span className="sr-only">{t('roadmap.sprint')}</span><WorkspaceIcon name="runner" /><select aria-label={t('roadmap.sprint')} value={selectedSprintId} onChange={event => setSelectedSprint(event.target.value)}><option value="">{t('dashboard.allSprints')}</option>{sprintOptions.map(sprint => <option key={sprint.id} value={sprint.id}>{sprint.title}</option>)}</select></label>}
        </div></div>
        {tab === 'sprintAnalytics' ? <SprintAnalytics data={data} selected={selectedSprintId} /> : invalidPeriod ? <p role="alert">{t('dashboard.invalidPeriod')}</p> : !displayData ? <p role="status">{t('dashboard.noHistoryBaseline')}</p> : <>
            <details className="dashboard-reporting-info"><summary aria-label={t('dashboard.reportingInfo')} title={t('dashboard.reportingInfo')}><WorkspaceIcon name="info" /></summary><p className="dashboard-note">{t('dashboard.periodNote', { date: end })}</p></details>
            <DashboardOverview historyEventIndex={snapshot?.index ?? undefined} dependencyBlockedIds={dependencyBlockedIds} boardId={boardId} data={displayData} source={data} start={from} end={end} visible={shown} selection={drill} onSelect={setDrill} inspect={inspect} openRoadmap={openRoadmap} />
        </>}

    </>;
}

export function PortfolioDashboard({ hidden }: { hidden: boolean }) {
    const boardId = useAppStore((state) => state.selectedPortfolioBoardId);
    return <section id="portfolioDashboard" className={`portfolio-dashboard${hidden ? ' hidden' : ''}`} aria-label="Dashboard">{boardId && <Dashboard key={boardId} boardId={boardId} hidden={hidden} />}</section>;
}
