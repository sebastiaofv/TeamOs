import { useId, useState, type CSSProperties } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useShallow } from 'zustand/react/shallow';
import type { PortfolioRoadmapViewModel, RoadmapMilestoneMarker, RoadmapPlanningRow, RoadmapWorkScope } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { buildPortfolioRoadmapView } from '@/features/portfolio/queries';
import { formatRoadmapDateRange, getRoadmapTimelinePlacement, getRoadmapTodayMarker } from '@/domain/roadmap';
import { planningTaskCategory } from '@/domain/phaseTree';
import { formatDueDateForUi } from '@/domain/calendar';
import { setPortfolioFilter } from '@/features/portfolio/commands/portfolioControls';
import { WorkitemTable } from '@/features/portfolio/table/PortfolioTable';
import { useI18n } from '@/shared/i18n';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';

type Perspective = 'workitems' | 'sprints' | 'milestones';
const MILESTONE_LANE_HEIGHT = 48;
const domId = (value: string) => encodeURIComponent(value);

function useProgressText() {
    const { t, language } = useI18n();
    return (scope: RoadmapWorkScope) => scope.progress.percent === null ? t('roadmap.notApplicable')
        : `${new Intl.NumberFormat(language === 'pt' ? 'pt-PT' : 'en', { maximumFractionDigits: 1 }).format(scope.progress.percent)}%`;
}

function ArchiveControl() {
    const { t } = useI18n(); const id = useId();
    const archive = useAppStore((state) => state.portfolioFilters.archive);
    return <label className="roadmap-archive-control" htmlFor={id}>{t('toolbar.archive').replace(/:$/, '')}
        <select id={id} aria-label={t('roadmap.archiveVisibility')} value={archive} onChange={(event) => setPortfolioFilter('archive', event.target.value)}>
            <option value="active">{t('toolbar.activeOnly')}</option><option value="all">{t('toolbar.activeAndArchived')}</option><option value="archived">{t('toolbar.archivedOnly')}</option>
        </select>
    </label>;
}

function CompletionControl({ view }: { view: PortfolioRoadmapViewModel }) {
    const { t } = useI18n();
    const selected = useAppStore((state) => state.portfolioFilters.statuses);
    const choices = [
        { key: 'all', label: t('common.all'), ids: [] as string[] },
        { key: 'open', label: t('roadmap.notCompleted'), ids: view.boardData?.board.columns.filter((column) => !['completed', 'cancelled'].includes(planningTaskCategory({ status: column.status }, view.boardData))).map((column) => column.status) || [] },
        { key: 'completed', label: t('roadmap.completed'), ids: view.boardData?.board.columns.filter((column) => planningTaskCategory({ status: column.status }, view.boardData) === 'completed').map((column) => column.status) || [] },
        { key: 'cancelled', label: t('roadmap.cancelled'), ids: view.boardData?.board.columns.filter((column) => planningTaskCategory({ status: column.status }, view.boardData) === 'cancelled').map((column) => column.status) || [] }
    ];
    return <div className="roadmap-completion-controls" role="group" aria-label={t('roadmap.completionFilter')}>
        {choices.filter((choice) => choice.key !== 'cancelled' || choice.ids.length).map((choice) => <button className="btn" type="button" key={choice.key}
            aria-pressed={selected.length === choice.ids.length && selected.every((id) => choice.ids.includes(id))} onClick={() => setPortfolioFilter('statuses', choice.ids)}>{choice.label}</button>)}
    </div>;
}

function ScopeSummary({ scope }: { scope: RoadmapWorkScope }) {
    const { t } = useI18n();
    return <div className="roadmap-scope-summary"><span>{t('roadmap.visibleAssociated', { visible: scope.visibleCount, total: scope.progress.associated })}</span>
        <span>{t('roadmap.progressCounts', { done: scope.progress.completed, eligible: scope.progress.eligible, cancelled: scope.progress.cancelled })}</span>
    </div>;
}

function ScopeTable({ scope, view, scopeId, emptyLabel }: { scope: RoadmapWorkScope; view: PortfolioRoadmapViewModel; scopeId: string; emptyLabel?: string }) {
    const { t } = useI18n();
    if (!view.boardData) return null;
    return <div className="roadmap-scope-table">
        <ScopeSummary scope={scope} />
        <WorkitemTable compact hidden={false} boardId={view.boardId} project={`${view.boardTitle}${scope.item ? ` · ${scope.item.title}` : ''}`} boardData={view.boardData}
            sourceRows={scope.rows} canCreate={false} scope={domId(scopeId)} emptyLabel={emptyLabel || t('roadmap.noTasksAssigned')} />
    </div>;
}

function WorkArea({ row, view, canEdit, perspective, setPerspective }: { row: RoadmapPlanningRow; view: PortfolioRoadmapViewModel; canEdit: boolean; perspective: Perspective; setPerspective: (value: Perspective) => void }) {
    const { t, language } = useI18n();
    const actions = usePortfolioActions();
    const groups = perspective === 'sprints' ? row.sprintGroups : row.milestoneGroups;
    return <div className="roadmap-work-area" data-roadmap-task-list={row.key} id={`roadmap-tasks-${domId(row.key)}`}>
        {row.kind === 'phases' && <div className="roadmap-perspectives" role="group" aria-label={t('roadmap.workPerspectives')}>
            {(['workitems', 'sprints', 'milestones'] as const).map((value) => <button className="btn" type="button" key={value} aria-pressed={perspective === value} onClick={() => setPerspective(value)}>{t(`roadmap.perspective.${value}`)}</button>)}
        </div>}
        {row.kind === 'sprints' || perspective === 'workitems' || !row.tasks.length ? <ScopeTable scope={row} view={view} scopeId={`roadmap-${row.key}`} />
            : groups.map((group) => <section className="roadmap-work-group" data-roadmap-group={group.referenceId || 'none'} key={group.key}>
                <header><h5>{group.item?.title || (group.referenceId ? t('roadmap.missingReference', { id: group.referenceId }) : t(perspective === 'sprints' ? 'roadmap.noSprint' : 'roadmap.noMilestone'))}</h5>
                    {group.item && <><span>{formatRoadmapDateRange(group.item, language)}</span><button className="btn" type="button" disabled={!canEdit} aria-label={`${t('common.edit')} ${group.item.title}`} onClick={() => actions.openRoadmapEntityModal(perspective === 'sprints' ? 'sprints' : 'milestones', group.item!.id)}>{t('common.edit')}</button></>}
                </header>
                <ScopeTable scope={group} view={view} scopeId={`roadmap-${row.key}-${group.key}`} />
            </section>)}
    </div>;
}

function PlanningRow({ row, view, canEdit, perspective, setPerspective }: { row: RoadmapPlanningRow; view: PortfolioRoadmapViewModel; canEdit: boolean; perspective: Perspective; setPerspective: (value: Perspective) => void }) {
    const actions = usePortfolioActions();
    const { t, language } = useI18n(); const percent = useProgressText();
    const item = row.item!;
    const singular = row.kind === 'phases' ? 'phase' : 'sprint';
    const rowId = `roadmap-row-${singular}-${domId(item.id)}`;
    const placement = getRoadmapTimelinePlacement(item, view.range);
    const width = Math.max(placement?.width || 0, 5);
    const left = Math.min(placement?.left || 0, 100 - width);
    const toggle = () => actions.togglePortfolioRoadmapRowExpanded(view.boardId, row.key);
    return <div className={`roadmap-row${row.hasChildren ? ' roadmap-parent-row' : ' roadmap-leaf-row'}`} id={rowId} data-roadmap-kind={singular} data-roadmap-id={item.id} data-depth={row.depth}
        role="group" tabIndex={0} aria-labelledby={`${rowId}-title`} onKeyDown={(event) => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); toggle(); } }}
        onClick={(event) => { if (!(event.target as Element).closest('button, input, select, label, .roadmap-work-area')) toggle(); }}>
        <div className="roadmap-row-main">
            <div className="roadmap-row-labels" style={{ paddingInlineStart: 12 + Math.min(row.depth, 12) * 14 }}>
                {row.hasChildren ? <button className="roadmap-action-btn roadmap-tree-toggle" type="button" aria-expanded={!row.treeCollapsed} aria-label={t('roadmap.toggleSubphases', { title: item.title })} onClick={() => actions.togglePortfolioRoadmapRowExpanded(view.boardId, `tree:${item.id}`)}>{row.treeCollapsed ? '▸' : '▾'}</button> : <span className="roadmap-tree-spacer" aria-hidden="true" />}
                <h4 className="roadmap-row-title" title={`${item.title} · ${t(row.hasChildren ? 'roadmap.parentPhase' : 'roadmap.leafPhase')}`} id={`${rowId}-title`}>{item.title}</h4>
                <span className="roadmap-row-meta">{formatRoadmapDateRange(item, language)}</span>
                <button className="roadmap-disclosure-btn" type="button" aria-expanded={row.expanded} aria-controls={`roadmap-tasks-${domId(row.key)}`} aria-label={t(row.expanded ? 'roadmap.hideTasksFor' : 'roadmap.showTasksFor', { title: item.title })} title={t('roadmap.visibleAssociated', { visible: row.visibleCount, total: row.progress.associated })} onClick={toggle}>▤ {row.visibleCount}/{row.progress.associated}</button>
                <div className="roadmap-row-actions"><button className="roadmap-action-btn" type="button" disabled={!canEdit} aria-label={`${t('common.edit')} ${item.title}`} onClick={() => actions.openRoadmapEntityModal(row.kind, item.id)}>✎</button>
                    <button className="roadmap-action-btn" type="button" disabled={!canEdit} aria-label={`${t('common.delete')} ${item.title}`} onClick={() => actions.deleteRoadmapEntity(row.kind, item.id)}>×</button>
                </div>
            </div>
            <div className="roadmap-row-track">
                <button className="roadmap-row-timeline-bar" type="button" data-progress={row.progress.percent ?? 'na'} data-start={item.startDate} data-end={item.endDate}
                    style={{ left: `${left}%`, width: `${width}%` }} title={`${item.title} · ${formatRoadmapDateRange(item, language)} · ${percent(row)}`} aria-label={t('roadmap.openBar', { title: item.title, percent: percent(row) })} onClick={toggle}>
                    <span className="roadmap-bar-fill" style={{ width: `${row.progress.percent || 0}%` }} /><span className="roadmap-bar-value">{percent(row)}</span>
                </button>
            </div>
        </div>
        {row.expanded && <WorkArea row={row} view={view} canEdit={canEdit} perspective={perspective} setPerspective={setPerspective} />}
    </div>;
}

function MilestoneDiamond({ marker }: { marker: RoadmapMilestoneMarker }) {
    const percent = useProgressText();
    return <span className="milestone-diamond"><span>{percent(marker)}</span></span>;
}

function MilestoneDialog({ marker, view, canEdit, close }: { marker?: RoadmapMilestoneMarker; view: PortfolioRoadmapViewModel; canEdit: boolean; close: () => void }) {
    const { t } = useI18n(); const percent = useProgressText(); const actions = usePortfolioActions();
    const returnFocus = useReturnFocus();
    const anotherDialog = useAppStore((state) => Boolean(state.activeDialog || state.appMessage));
    return <Dialog.Root open={Boolean(marker)} onOpenChange={(open) => { if (!open && !anotherDialog) close(); }}><Dialog.Portal><Dialog.Overlay className="modal active milestone-modal" id="milestoneWorkitemsModal">
        <Dialog.Content className="modal-content milestone-modal-content" aria-describedby={undefined} onKeyDown={(event) => event.stopPropagation()} onEscapeKeyDown={(event) => { if (anotherDialog) { event.preventDefault(); return; } event.preventDefault(); close(); }} {...returnFocus}>
            {marker && <><div className="modal-header"><div className="milestone-modal-heading"><MilestoneDiamond marker={marker} /><div><Dialog.Title className="modal-title">{marker.item!.title}</Dialog.Title><p>{formatDueDateForUi(marker.item!.dueDate)} · {percent(marker)}</p></div></div><Dialog.Close className="modal-close" aria-label={t('common.close')}>×</Dialog.Close></div>
                <div className="modal-body"><div className="roadmap-modal-filters"><ArchiveControl /><CompletionControl view={view} /></div><ScopeTable scope={marker} view={view} scopeId={`roadmap-modal-${marker.key}`} /></div>
                <div className="modal-footer"><button className="btn" disabled={!canEdit} onClick={() => actions.openRoadmapEntityModal('milestones', marker.item!.id)}>{t('common.edit')}</button>
                    <button className="btn" disabled={!canEdit} onClick={() => actions.deleteRoadmapEntity('milestones', marker.item!.id, { onApplied: close })}>{t('common.delete')}</button><Dialog.Close className="btn">{t('common.close')}</Dialog.Close></div>
            </>}
        </Dialog.Content>
    </Dialog.Overlay></Dialog.Portal></Dialog.Root>;
}

function PortfolioRoadmapView({ view, expanded }: { view: PortfolioRoadmapViewModel; expanded: Record<string, boolean> }) {
    const { t } = useI18n(); const percent = useProgressText(); const actions = usePortfolioActions();
    const canEdit = useAppStore((state) => Boolean(state.portfolioBoards.find((board) => board.id === view.boardId)?.handle)) && !view.historical;
    const [milestoneId, setMilestoneId] = useState('');
    const [perspectives, setPerspectives] = useState<Record<string, Perspective>>({});
    const [labelWidth, setLabelWidth] = useState<number | null>(null);
    const [zoom, setZoom] = useState(1);
    const marker = getRoadmapTodayMarker(view.range);
    const annotationHeight = view.milestones.length ? Math.min(160, Math.max(MILESTONE_LANE_HEIGHT, view.annotationLanes * MILESTONE_LANE_HEIGHT)) : 0;
    const style = { '--roadmap-label-width': `${labelWidth ?? view.labelWidth}px`, '--roadmap-temporal-min': `${640 * zoom}px` } as CSSProperties;
    const selected = view.milestones.find((item) => item.item?.id === milestoneId);
    return <div className="roadmap-workspace">
        <div className="roadmap-view-controls"><ArchiveControl /><CompletionControl view={view} />
            <label>{t('roadmap.labelWidth')}<input aria-label={t('roadmap.labelWidth')} type="range" min="280" max="720" step="10" value={labelWidth ?? view.labelWidth} onChange={(event) => setLabelWidth(Number(event.target.value))} /></label>
            <label>{t('roadmap.zoom')}<select aria-label={t('roadmap.zoom')} value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>{[1, 1.25, 1.5, 2].map((value) => <option value={value} key={value}>{value * 100}%</option>)}</select></label>
            <button className="btn" type="button" disabled={!canEdit} aria-label={t('roadmap.addAria', { label: t('roadmap.milestone') })} onClick={() => actions.openRoadmapEntityModal('milestones')}>{t('roadmap.add', { label: t('roadmap.milestone') })}</button>
        </div>
        <div className="portfolio-roadmap-timeline surface-page surface-border" style={style}>
            <div className="roadmap-temporal-overlay" aria-hidden="true">
                {view.axisTicks.map((tick) => <span className="roadmap-grid-guide" key={tick.label} style={{ left: `${tick.position}%`, top: annotationHeight + 18 }} />)}
                {view.milestones.map((milestone) => <span className="milestone-date-guide" data-milestone-guide={milestone.item!.id} key={milestone.key} style={{ left: `${milestone.position}%`, top: annotationHeight }} />)}
                {marker && <span className="roadmap-today-marker" style={{ left: `${marker.position}%`, top: annotationHeight + 18 }} />}
            </div>
            <div className="roadmap-axis-shell"><div className="roadmap-axis-label">{t('roadmap.timeline')}<span>{view.range.start.toISOString().slice(0, 10)} — {view.range.end.toISOString().slice(0, 10)}</span></div>
                <div className="roadmap-axis" data-roadmap-axis="shared">
                    {view.milestones.length > 0 && <div className="milestone-annotations" role="region" aria-label={t('roadmap.milestones')} tabIndex={0} style={{ height: annotationHeight }}><div className="milestone-annotation-canvas" style={{ height: view.annotationLanes * MILESTONE_LANE_HEIGHT }}>
                        {view.milestones.map((milestone) => <button className={`milestone-annotation${milestone.labelAtEnd ? ' milestone-at-end' : ''}`} type="button" key={milestone.key} data-roadmap-kind="milestone" data-roadmap-id={milestone.item!.id}
                            style={{ left: `${milestone.position}%`, top: milestone.lane * MILESTONE_LANE_HEIGHT + 8 }} aria-label={t('roadmap.openMilestone', { title: milestone.item!.title, date: milestone.item!.dueDate || '', percent: percent(milestone) })} onClick={() => setMilestoneId(milestone.item!.id)}>
                            <MilestoneDiamond marker={milestone} /><span className="milestone-annotation-label" title={`${milestone.item!.title} · ${milestone.item!.dueDate}`}><strong>{milestone.item!.title}</strong><span>{formatDueDateForUi(milestone.item!.dueDate)}</span></span>
                        </button>)}
                    </div></div>}
                    <div className="roadmap-axis-line">{marker && <span className="roadmap-today-marker-label" style={{ left: `${marker.position}%` }} aria-label={t('roadmap.todayAria', { date: marker.iso })}>{t('common.today')}</span>}<div className="roadmap-axis-ticks">{view.axisTicks.map((tick) => <span className="roadmap-axis-tick" key={tick.label} style={{ left: `${tick.position}%` }}>{tick.label}</span>)}</div></div>
                </div>
            </div>
            {(['phases', 'sprints'] as const).map((kind) => {
                const rows = kind === 'phases' ? view.phaseRows : view.sprintRows;
                const label = t(kind === 'phases' ? 'roadmap.phase' : 'roadmap.sprint');
                return <section className="roadmap-section" data-roadmap-kind={kind} key={kind} aria-label={t(kind === 'phases' ? 'roadmap.phases' : 'roadmap.sprints')}>
                    <header className="roadmap-section-header"><h3>{t(kind === 'phases' ? 'roadmap.phases' : 'roadmap.sprints')}</h3><button className="roadmap-section-btn" type="button" disabled={!canEdit} aria-label={t('roadmap.addAria', { label })} onClick={() => actions.openRoadmapEntityModal(kind)}>{t('roadmap.add', { label })}</button></header>
                    <div className="roadmap-list">{!rows.length ? <p className="roadmap-empty">{t('roadmap.noItems', { label: label.toLowerCase() })}</p> : rows.map((row) => <PlanningRow key={row.key} row={row} view={view} canEdit={canEdit} perspective={perspectives[row.key] || 'workitems'} setPerspective={(value) => setPerspectives((current) => ({ ...current, [row.key]: value }))} />)}</div>
                </section>;
            })}
            <section className="roadmap-unclassified" aria-labelledby="roadmapUnclassifiedHeading"><header><h3 id="roadmapUnclassifiedHeading">{t('roadmap.unclassified')}</h3><ScopeSummary scope={view.unclassified} /><button className="btn" type="button" aria-expanded={Boolean(expanded.unclassified)} onClick={() => actions.togglePortfolioRoadmapRowExpanded(view.boardId, 'unclassified')}>{t(expanded.unclassified ? 'roadmap.hideTasks' : 'roadmap.showTasks')}</button></header>
                {expanded.unclassified && <ScopeTable scope={view.unclassified} view={view} scopeId="roadmap-unclassified" emptyLabel={t('roadmap.emptyUnclassified')} />}
            </section>
        </div>
        <MilestoneDialog marker={selected} view={view} canEdit={canEdit} close={() => setMilestoneId('')} />
    </div>;
}

function ConnectedRoadmap() {
    const state = useAppStore(useShallow((value) => ({ portfolioBoards: value.portfolioBoards, selectedPortfolioBoardId: value.selectedPortfolioBoardId,
        portfolioTimelineSelection: value.portfolioTimelineSelection, portfolioRoadmapExpandedRowsByBoardId: value.portfolioRoadmapExpandedRowsByBoardId,
        portfolioFilters: value.portfolioFilters, activeLanguage: value.activeLanguage })));
    const view = buildPortfolioRoadmapView(state);
    return view ? <PortfolioRoadmapView key={view.boardId} view={view} expanded={state.portfolioRoadmapExpandedRowsByBoardId[view.boardId] || {}} /> : null;
}

export function PortfolioRoadmap({ hidden }: { hidden: boolean }) {
    return <div className={`portfolio-roadmap-view${hidden ? ' hidden' : ''}`} id="portfolioRoadmapView">{!hidden && <ConnectedRoadmap />}</div>;
}
