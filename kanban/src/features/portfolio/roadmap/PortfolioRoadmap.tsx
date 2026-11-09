import { createPortal } from 'react-dom';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { DeleteMenu } from '@/shared/ui/DeleteMenu';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { SprintAction } from './SprintAction';
import { SprintPoints } from './SprintPoints';
import { getSprintStatus } from '@/domain/roadmap';
import * as Dialog from '@radix-ui/react-dialog';
import { useShallow } from 'zustand/react/shallow';
import type { PortfolioRoadmapViewModel, RoadmapMilestoneMarker, RoadmapPlanningRow, RoadmapWorkScope } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { buildPortfolioRoadmapView } from '@/features/portfolio/queries';
import { formatRoadmapDateRange, getRoadmapAxisTicks, getRoadmapYearTicks, getRoadmapTimelinePlacement, getRoadmapTodayMarker } from '@/domain/roadmap';
import { formatDueDateForUi } from '@/domain/calendar';
import { selectRoadmapMilestone } from '@/features/portfolio/commands/roadmapNavigation';
import { ROADMAP_TABLE_COLUMNS } from '@/features/portfolio/table/tableModel';
import { formatClosureDate, WorkitemTable } from '@/features/portfolio/table/PortfolioTable';
import { useI18n } from '@/shared/i18n';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { layoutMilestones, MILESTONE_LANE_HEIGHT } from '@/domain/milestonePresentation';

const domId = (value: string) => encodeURIComponent(value);

function useElementSize<T extends HTMLElement>(initial = 0) {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(initial);
    const [height, setHeight] = useState(0);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => { setWidth(entry.contentRect.width); setHeight(element.getBoundingClientRect().height); });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return { ref, width, height };
}

function ProgressBar({ row, left, width }: { row: RoadmapPlanningRow; left: number; width: number }) {
    const { language } = useI18n(); const percent = useProgressText();
    const bar = useElementSize<HTMLDivElement>();
    const value = percent(row);
    const progress = row.progress.percent || 0;
    const inside = bar.width * progress / 100 >= value.length * 6.6 + 12;
    return <div ref={bar.ref} role="img" className={`roadmap-row-timeline-bar${row.kind === 'phases' && row.item!.color ? ' roadmap-custom-phase-color' : ''}`} data-progress={row.progress.percent ?? 'na'} data-start={row.item!.startDate} data-end={row.item!.endDate}
        style={{ left: `${left}%`, width: `${width}%`, ...(row.kind === 'phases' && row.item!.color ? { '--phase-color': row.item!.color } : {}) } as CSSProperties} title={`${row.item!.title} · ${formatRoadmapDateRange(row.item!, language)} · ${value}`} aria-label={`${row.item!.title} · ${value}`}>
        <span className="roadmap-bar-fill" style={{ width: `${progress}%` }} /><span className={`roadmap-bar-value${inside ? ' roadmap-value-inside' : ''}`} style={{ left: `${progress}%` }}>{value}</span>
    </div>;
}

function useProgressText(maximumFractionDigits = 1) {
    const { t, language } = useI18n();
    return (scope: RoadmapWorkScope) => scope.progress.percent === null ? t('roadmap.notApplicable')
        : `${new Intl.NumberFormat(language === 'pt' ? 'pt-PT' : 'en', { maximumFractionDigits }).format(scope.progress.percent)}%`;
}

function ScopeTable({ scope, view, scopeId }: { scope: RoadmapWorkScope; view: PortfolioRoadmapViewModel; scopeId: string }) {
    const { t } = useI18n();
    if (!view.boardData) return null;
    const closure = /^sprints?:/.test(scope.key) && scope.item ? view.boardData.extensions.sprintResults?.closures.find((entry) => entry.sprintId === scope.item!.id) : undefined;
    return <div className="roadmap-scope-table">
        <WorkitemTable selectable={false} fixedColumns={ROADMAP_TABLE_COLUMNS} bare nested hidden={false} boardId={view.boardId} project={`${view.boardTitle}${scope.item ? ` · ${scope.item.title}` : ''}`} boardData={scope.boardData}
            sourceRows={scope.rows} canCreate={false} scope={domId(scopeId)} emptyLabel={t('roadmap.noTasksAssigned')} />
        {closure && <p className="table-sprint-note table-sprint-frozen-note" data-sprint-closure-note>{t('sprint.frozenNote', { date: formatClosureDate(closure.closedAt) })}</p>}
    </div>;
}

function WorkArea({ row, view }: { row: RoadmapPlanningRow; view: PortfolioRoadmapViewModel }) {
    return <div className="roadmap-work-area" data-roadmap-task-list={row.key} id={`roadmap-tasks-${domId(row.key)}`}>
        <ScopeTable scope={row} view={view} scopeId={`roadmap-${row.key}`} />
    </div>;
}

function PlanningRow({ row, view, canEdit }: { row: RoadmapPlanningRow; view: PortfolioRoadmapViewModel; canEdit: boolean }) {
    const actions = usePortfolioActions();
    const { t } = useI18n();
    const item = row.item!;
    const singular = row.kind === 'phases' ? 'phase' : 'sprint';
    const rowId = `roadmap-row-${singular}-${domId(item.id)}`;
    const placement = getRoadmapTimelinePlacement(item, view.range);
    const width = Math.max(placement?.width || 0, 5);
    const left = Math.min(placement?.left || 0, 100 - width);
    const toggleWorkitems = () => actions.togglePortfolioRoadmapRowExpanded(view.boardId, row.key);
    return <div className={`roadmap-row${row.hasChildren ? ' roadmap-parent-row' : ' roadmap-leaf-row'}`} id={rowId} data-roadmap-kind={singular} data-roadmap-id={item.id} data-depth={row.depth}
        role="group" aria-labelledby={`${rowId}-title`}>
        <div className="roadmap-row-main">
            <div className="roadmap-row-labels" style={{ paddingInlineStart: 12 + Math.min(row.depth, 12) * 14 }}>
                {row.hasChildren ? <button className="roadmap-action-btn roadmap-tree-toggle" type="button" aria-expanded={!row.treeCollapsed} aria-label={t('roadmap.toggleSubphases', { title: item.title })} onClick={() => actions.togglePortfolioRoadmapRowExpanded(view.boardId, `tree:${item.id}`)}>{row.treeCollapsed ? '▸' : '▾'}</button>
                    : <span className="roadmap-tree-spacer" aria-hidden="true" />}
                <button type="button" className="roadmap-row-title roadmap-edit-name" title={item.title} id={`${rowId}-title`} onClick={() => actions.openRoadmapEntityModal(row.kind, item.id, { boardId: view.boardId })}>{item.title}</button>
                <button className="roadmap-disclosure-btn" type="button" aria-expanded={row.expanded} aria-controls={`roadmap-tasks-${domId(row.key)}`} aria-label={`${t(row.expanded ? 'roadmap.hideTasksFor' : 'roadmap.showTasksFor', { title: item.title })}: ${row.visibleCount}/${row.progress.associated}`} title={t('roadmap.visibleAssociated', { visible: row.visibleCount, total: row.progress.associated })} onClick={toggleWorkitems}><WorkspaceIcon name="table" /> {row.visibleCount}/{row.progress.associated}</button>
                {row.kind === 'sprints' && <div className="roadmap-row-actions">{view.boardData && <SprintPoints data={view.boardData} sprintId={item.id} />}<span className={`table-status-badge sprint-status-${getSprintStatus(item)}`}>{t(`table.sprintStatus.${getSprintStatus(item)}`)}</span><SprintAction compact sprint={item} boardId={view.boardId} disabled={!canEdit} /></div>}

            </div>
            <div className="roadmap-row-track">
                <ProgressBar row={row} left={left} width={width} />
            </div>
        </div>
        {row.expanded && <WorkArea row={row} view={view} />}
    </div>;
}

function MilestoneDiamond({ marker }: { marker: RoadmapMilestoneMarker }) {
    return <span className="milestone-diamond" data-progress={marker.progress.percent ?? 'na'} style={{ '--milestone-color': marker.item!.color, '--milestone-progress': `${marker.progress.percent ?? 0}%` } as CSSProperties}><span className="milestone-progress-fill" /></span>;
}

function MilestoneButton({ marker, select }: { marker: RoadmapMilestoneMarker & { lane: number }; select: () => void }) {
    const id = useId();
    const percent = useProgressText(0);
    const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
    const name = `${marker.item!.title} · ${formatDueDateForUi(marker.item!.dueDate)}`;
    useEffect(() => {
        if (!anchor) return;
        const hide = () => setAnchor(null);
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); };
    }, [anchor]);
    const show = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const width = Math.min(Math.max(300, marker.item!.title.length * 7 + 24), window.innerWidth - 16);
        setAnchor({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: rect.bottom + 64 < window.innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - 64), width });
    };
    return <><button className="milestone-annotation" type="button" data-roadmap-kind="milestone" data-roadmap-id={marker.item!.id}
        aria-label={`${name} · ${percent(marker)}`} aria-describedby={anchor ? id : undefined} style={{ left: `${marker.position}%`, top: marker.lane * MILESTONE_LANE_HEIGHT }} onClick={select}
        onMouseEnter={event => show(event.currentTarget)} onMouseLeave={() => setAnchor(null)} onFocus={event => show(event.currentTarget)} onBlur={() => setAnchor(null)} onKeyDown={event => { if (event.key === 'Escape') setAnchor(null); }}>
        <MilestoneDiamond marker={marker} />
    </button>{anchor && createPortal(<div id={id} role="tooltip" className="milestone-tooltip" style={anchor}><span title={marker.item!.title}>{marker.item!.title}</span><span>{formatDueDateForUi(marker.item!.dueDate)} · {percent(marker)}</span></div>, document.body)}</>;
}

function MilestoneGuide({ marker, markers, top, local = false }: { marker: RoadmapMilestoneMarker; markers: RoadmapMilestoneMarker[]; top: number; local?: boolean }) {
    const coincident = markers.filter((other) => other.position === marker.position);
    const index = coincident.findIndex((other) => other.key === marker.key);
    // Interleave coloured dashes for milestones on the same day rather than hiding one behind another.
    return <span className="milestone-date-guide" data-milestone-guide={local ? undefined : marker.item!.id} style={{ left: `${marker.position}%`, top, color: marker.item!.color }}>
        <svg width="1" height="100%" aria-hidden="true"><line x1="0.5" x2="0.5" y1="0" y2="100%" stroke="currentColor" strokeDasharray={`4 ${coincident.length * 8 - 4}`} strokeDashoffset={top + (local ? 44 : 0) - index * 8} /></svg>
    </span>;
}

function MilestoneDialog({ marker, view, canEdit, close }: { marker?: RoadmapMilestoneMarker; view: PortfolioRoadmapViewModel; canEdit: boolean; close: () => void }) {
    const { t } = useI18n(); const percent = useProgressText(0); const actions = usePortfolioActions();
    const returnFocus = useReturnFocus();
    const anotherDialog = useAppStore((state) => Boolean(state.activeDialog || state.appMessage));
    return <Dialog.Root open={Boolean(marker)} onOpenChange={(open) => { if (!open && !anotherDialog) close(); }}><Dialog.Portal><Dialog.Overlay className="modal active milestone-modal" id="milestoneWorkitemsModal">
        <Dialog.Content className="modal-content milestone-modal-content" aria-describedby={undefined} onKeyDown={(event) => event.stopPropagation()} onEscapeKeyDown={(event) => { if (anotherDialog) { event.preventDefault(); return; } event.preventDefault(); close(); }} {...returnFocus}>
            {marker && <><div className="modal-header"><div className="milestone-modal-heading"><MilestoneDiamond marker={marker} /><div><Dialog.Title className="modal-title">{marker.item!.title}</Dialog.Title><p>{formatDueDateForUi(marker.item!.dueDate)} · {percent(marker)}</p></div></div><div className="roadmap-modal-actions"><DeleteMenu disabled={!canEdit} onDelete={() => actions.deleteRoadmapEntity('milestones', marker.item!.id, { onApplied: close })} /><Dialog.Close className="modal-close" aria-label={t('common.close')}>×</Dialog.Close></div></div>
                <div className="modal-body"><ScopeTable scope={marker} view={view} scopeId={`roadmap-modal-${marker.key}`} /></div>
                <div className="modal-footer"><button className="btn" disabled={!canEdit} onClick={() => actions.openRoadmapEntityModal('milestones', marker.item!.id)}>{t('common.edit')}</button>
                    <Dialog.Close className="btn">{t('common.close')}</Dialog.Close></div>
            </>}
        </Dialog.Content>
    </Dialog.Overlay></Dialog.Portal></Dialog.Root>;
}

function PortfolioRoadmapView({ view }: { view: PortfolioRoadmapViewModel }) {
    const { t, language } = useI18n(); const actions = usePortfolioActions();
    const canEdit = useAppStore((state) => Boolean(state.portfolioBoards.find((board) => board.id === view.boardId)?.handle)) && !view.historical;
    const milestoneId = useAppStore((state) => state.portfolioRoadmapMilestoneByBoardId[view.boardId] || '');
    const setMilestoneId = (id: string) => selectRoadmapMilestone(view.boardId, id);
    const [labelWidth, setLabelWidth] = useState<number | null>(null);
    const [zoom, setZoom] = useState(1);
    const axis = useElementSize<HTMLDivElement>(640);
    const controls = useElementSize<HTMLDivElement>();
    const axisTicks = getRoadmapAxisTicks(view.range, language, axis.width);
    const yearTicks = getRoadmapYearTicks(view.range, axis.width);
    const layout = layoutMilestones(view.milestones.map((milestone) => milestone.position), axis.width);
    const milestones = view.milestones.map((milestone, index) => ({ ...milestone, ...layout[index] }));
    const marker = getRoadmapTodayMarker(view.range);
    const annotationLanes = Math.max(0, ...milestones.map((milestone) => milestone.lane + 1));
    const annotationHeight = Math.min(2, annotationLanes) * MILESTONE_LANE_HEIGHT;
    const style = { '--roadmap-label-width': `${labelWidth ?? view.labelWidth}px`, '--roadmap-temporal-min': `${640 * zoom}px`, '--roadmap-axis-width': `${axis.width}px` } as CSSProperties;
    const selected = milestones.find((item) => item.item?.id === milestoneId);
    return <div className="roadmap-workspace" style={{ '--roadmap-controls-height': `${controls.height}px` } as CSSProperties}>
        <div ref={controls.ref} className="roadmap-view-controls">
            <label>{t('roadmap.labelWidth')}<input aria-label={t('roadmap.labelWidth')} type="range" min="280" max="720" step="10" value={labelWidth ?? view.labelWidth} onChange={(event) => setLabelWidth(Number(event.target.value))} /></label>
            <label>{t('roadmap.zoom')}<select aria-label={t('roadmap.zoom')} value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>{[1, 1.25, 1.5, 2].map((value) => <option value={value} key={value}>{value * 100}%</option>)}</select></label>
            <button className="btn btn-primary roadmap-create-btn" type="button" disabled={!canEdit} aria-label={t('roadmap.addAria', { label: t('roadmap.milestone') })} onClick={() => actions.openRoadmapEntityModal('milestones')}><WorkspaceIcon name="plus" />{t('roadmap.milestone')}</button>
            <button className="btn btn-primary roadmap-create-btn" type="button" disabled={!canEdit} aria-label={t('roadmap.addAria', { label: t('roadmap.phase') })} onClick={() => actions.openRoadmapEntityModal('phases')}><WorkspaceIcon name="plus" />{t('roadmap.phase')}</button>
        </div>
        <div className="portfolio-roadmap-timeline surface-page surface-border" style={style}>
            <div className="roadmap-temporal-overlay" aria-hidden="true">
                {axisTicks.map((tick) => <span className="roadmap-grid-guide" key={tick.position} style={{ left: `${tick.position}%`, top: 18 }} />)}
            </div>
            <div className="roadmap-date-overlay" aria-hidden="true">
                {yearTicks.slice(1).map((tick) => <span className="roadmap-grid-guide roadmap-year-guide" key={tick.label} style={{ left: `${tick.position}%`, top: 0 }} />)}
                {milestones.map((milestone) => <MilestoneGuide marker={milestone} markers={milestones} key={milestone.key} top={44 + Math.min(milestone.lane * MILESTONE_LANE_HEIGHT + MILESTONE_LANE_HEIGHT / 2, annotationHeight)} />)}
                {marker && <span className="roadmap-today-marker" style={{ left: `${marker.position}%` }} />}
            </div>
            <div className="roadmap-axis-shell"><div className="roadmap-axis-label">{t('roadmap.timeline')}<span>{formatDueDateForUi(view.range.start.toISOString().slice(0, 10))} — {formatDueDateForUi(view.range.end.toISOString().slice(0, 10))}</span></div>
                <div ref={axis.ref} className="roadmap-axis" data-roadmap-axis="shared">
                    {marker && <span className="roadmap-today-axis-line" style={{ left: `${marker.position}%` }} aria-hidden="true" />}
                    <div className="roadmap-axis-line">
                        <div className="roadmap-axis-years">{yearTicks.map((tick) => <span className="roadmap-axis-year" key={tick.label} style={{ left: `${tick.position}%`, ...(tick.position > 95 ? { transform: 'translateX(-100%)' } : {}) }}>{tick.label}</span>)}</div>
                        {marker && <span className="roadmap-today-marker-label" style={{ left: `${marker.position}%` }} aria-label={t('roadmap.todayAria', { date: marker.iso })}>T</span>}
                        <div className="roadmap-axis-ticks">{axisTicks.map((tick) => <span className={`roadmap-axis-tick${tick.position === 0 ? ' roadmap-tick-first' : tick.position === 100 ? ' roadmap-tick-last' : ''}`} key={tick.position} style={{ left: `${tick.position}%` }}><span className="roadmap-axis-date-label">{tick.label}</span></span>)}</div>
                    </div>
                    {milestones.length > 0 && <div className="milestone-annotations" role="region" aria-label={t('roadmap.milestones')} tabIndex={0} style={{ height: annotationHeight }}><div className="milestone-annotation-canvas" style={{ height: annotationLanes * MILESTONE_LANE_HEIGHT }}>
                        {milestones.map((milestone) => <MilestoneGuide marker={milestone} markers={milestones} key={`guide-${milestone.key}`} local top={milestone.lane * MILESTONE_LANE_HEIGHT + MILESTONE_LANE_HEIGHT / 2} />)}
                        {milestones.map(milestone => <MilestoneButton key={milestone.key} marker={milestone} select={() => setMilestoneId(milestone.item!.id)} />)}
                    </div></div>}
                </div>
            </div>
            {(['phases', 'sprints'] as const).map((kind) => {
                const rows = kind === 'phases' ? view.phaseRows : view.sprintRows;
                const label = t(kind === 'phases' ? 'roadmap.phase' : 'roadmap.sprint');
                return <section className="roadmap-section" data-roadmap-kind={kind} key={kind} aria-label={t(kind === 'phases' ? 'roadmap.phases' : 'roadmap.sprints')}>
                    {kind === 'sprints' && <header className="roadmap-section-header"><h3>{t('roadmap.sprints')}</h3></header>}
                    <div className="roadmap-list">{!rows.length ? <p className="roadmap-empty">{t('roadmap.noItems', { label: label.toLowerCase() })}</p> : rows.map((row) => <PlanningRow key={row.key} row={row} view={view} canEdit={canEdit} />)}</div>
                </section>;
            })}
        </div>
        <MilestoneDialog marker={selected} view={view} canEdit={canEdit} close={() => setMilestoneId('')} />
    </div>;
}

function ConnectedRoadmap() {
    const state = useAppStore(useShallow((value) => ({ portfolioBoards: value.portfolioBoards, selectedPortfolioBoardId: value.selectedPortfolioBoardId,
        portfolioTimelineSelection: value.portfolioTimelineSelection, portfolioRoadmapExpandedRowsByBoardId: value.portfolioRoadmapExpandedRowsByBoardId,
        activeLanguage: value.activeLanguage })));
    const view = buildPortfolioRoadmapView(state);
    return view ? <PortfolioRoadmapView key={view.boardId} view={view} /> : null;
}

export function PortfolioRoadmap({ hidden }: { hidden: boolean }) {
    return <div className={`portfolio-roadmap-view${hidden ? ' hidden' : ''}`} id="portfolioRoadmapView">{!hidden && <ConnectedRoadmap />}</div>;
}
