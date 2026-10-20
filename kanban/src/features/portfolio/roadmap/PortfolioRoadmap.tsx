import { useShallow } from 'zustand/react/shallow';
import type {
    BoardRecord,
    PortfolioRoadmapViewModel,
} from '@/features/portfolio/types';
import type { BoardData, RoadmapItem, RoadmapKind, RoadmapRange, RoadmapTick, Task } from '@/domain/types';
import { useAppStore, type AppState } from '@/features/portfolio/state/store';
import { PortfolioTaskCard, type TaskCardState } from '@/features/portfolio/task/TaskCard';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import {
    compareRoadmapItemsByDate,
    formatRoadmapDateRange,
    getRoadmapEntityConfig,
    getRoadmapTaskFieldTasks,
    getRoadmapTimelinePlacement,
    getRoadmapTodayMarker
} from '@/domain/roadmap';
import { normalizeTask } from '@/domain/task';
import { taskMatchesPortfolioFilters } from '@/domain/portfolioFilters';
import { buildPortfolioRoadmapView } from '@/features/portfolio/queries';
import { useI18n } from '@/shared/i18n';
import { phaseTreeRows, planningProgress, planningTaskCategory } from '@/domain/phaseTree';

type RoadmapState = TaskCardState & Pick<AppState, 'portfolioRoadmapExpandedRowsByBoardId'>;

function RoadmapTaskList({ tasks, descriptor, boardRecord, boardData, historical, state }: {
    tasks: Task[];
    descriptor: string;
    boardRecord: BoardRecord;
    boardData: BoardData | null;
    historical: boolean;
    state: RoadmapState;
}) {
    const { t } = useI18n();
    const boardIndex = state.portfolioBoards.findIndex((board) => board.id === boardRecord.id);
    if (tasks.length === 0) {
        return (
            <div className="roadmap-task-list" data-roadmap-task-list={descriptor} id={`roadmap-tasks-${descriptor.replace(/[:\s]/g, '-')}`}>
                <div className="roadmap-task-list-gutter" aria-hidden="true" />
                <div className="roadmap-task-list-track">
                        <div className="roadmap-task-empty">{t('roadmap.noTasksAssigned')}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="roadmap-task-list" data-roadmap-task-list={descriptor} id={`roadmap-tasks-${descriptor.replace(/[:\s]/g, '-')}`}>
            <div className="roadmap-task-list-gutter" aria-hidden="true" />
            <div className="roadmap-task-list-track">
                {(['open', 'completed', 'cancelled'] as const).map((category) => {
                    const members = tasks.filter((task) => {
                        const value = planningTaskCategory(task, boardData);
                        return category === 'open' ? !['completed', 'cancelled'].includes(value) : value === category;
                    });
                    return members.length > 0 && <section className="roadmap-status-group" key={category}><h5>{t(category === 'open' ? 'roadmap.notCompleted' : category === 'completed' ? 'roadmap.completed' : 'roadmap.cancelled')}</h5>
                    {members.map((task, taskIndex) => (
                    <PortfolioTaskCard
                        key={`${boardRecord.id}:${task.id}`}
                        state={state}
                        item={{
                            boardIndex,
                            boardId: boardRecord.id,
                            taskId: task.id,
                            taskIndex,
                            boardTitle: boardRecord.title,
                            boardFileName: boardRecord.fileName,
                            canMutate: false,
                            historical,
                            boardData,
                            task: normalizeTask(task)
                        }}
                    />
                    ))}</section>;
                })}
            </div>
        </div>
    );
}

function RoadmapSection({ boardId, boardData, historical, kind, items, range, axisTicks, state }: {
    boardId: string;
    boardData: BoardData | null;
    historical: boolean;
    kind: RoadmapKind;
    items: RoadmapItem[] | undefined;
    range: RoadmapRange;
    axisTicks: RoadmapTick[];
    state: RoadmapState;
}) {
    const actions = usePortfolioActions();
    const { t, language } = useI18n();
    const config = getRoadmapEntityConfig(kind);
    if (!config) return null;
    const label = kind === 'milestones' ? t('roadmap.milestone') : kind === 'phases' ? t('roadmap.phase') : t('roadmap.sprint');
    const pluralLabel = kind === 'milestones' ? t('roadmap.milestones') : kind === 'phases' ? t('roadmap.phases') : t('roadmap.sprints');
    const expandedRows = state.portfolioRoadmapExpandedRowsByBoardId?.[boardId] || {};
    const treeRows = kind === 'phases' ? phaseTreeRows(items || [], new Set((items || []).filter((item) => expandedRows[`tree:${item.id}`]).map((item) => item.id)))
        : [...(items || [])].sort(compareRoadmapItemsByDate).map((item) => ({ item, depth: 0, hasChildren: false }));
    const canEdit = Boolean(state.portfolioBoards.find((board) => board.id === boardId)?.handle) && !historical;
    const gridGuides = axisTicks
        .filter((tick) => Number.isFinite(tick?.position) && tick.position > 0 && tick.position < 100)
        .map((tick) => (
            <span
                className="roadmap-grid-guide"
                aria-hidden="true"
                style={{ left: `${tick.position}%` }}
                key={`${kind}-guide-${tick.label}`}
            />
        ));

    return (
        <section
            className="roadmap-section"
            data-roadmap-kind={kind}
            aria-labelledby={`roadmap-${boardId}-${kind}-heading`}
            onClick={(event) => {
                const target = event.target as Element;
                if (target.closest('button, .roadmap-task-list')) return;
                const row = target.closest<HTMLElement>('.roadmap-row[data-roadmap-kind][data-roadmap-id]');
                if (row) actions.togglePortfolioRoadmapRowExpanded(boardId, `${row.dataset.roadmapKind}:${row.dataset.roadmapId}`);
            }}
        >
            <div className="roadmap-section-header">
                <div>
                    <h3 className="roadmap-section-title" id={`roadmap-${boardId}-${kind}-heading`}>{pluralLabel}</h3>
                    <div className="roadmap-section-subtitle">{t('roadmap.assigned', { label })}</div>
                </div>
                <button
                    className="roadmap-section-btn"
                    type="button"
                    aria-label={t('roadmap.addAria', { label })}
                    data-action="add-roadmap-item"
                    data-roadmap-kind={kind}
                    disabled={!canEdit}
                    onClick={() => actions.openRoadmapEntityModal(kind)}
                >
                    {t('roadmap.add', { label })}
                </button>
            </div>
            <div className="roadmap-list">
                {treeRows.length === 0
                    ? <div className="roadmap-empty">{t('roadmap.noItems', { label: config.singular === 'milestone' ? t('roadmap.milestone').toLowerCase() : config.singular === 'phase' ? t('roadmap.phase').toLowerCase() : t('roadmap.sprint').toLowerCase() })}</div>
                    : treeRows.map(({ item, depth, hasChildren }) => {
                        const expandKey = `${config.singular}:${item.id}`;
                        const expanded = Boolean(expandedRows[expandKey]);
                        const placement = getRoadmapTimelinePlacement(item, range);
                        const associatedTasks = getRoadmapTaskFieldTasks(boardData, config.taskField, item.id);
                        const progress = planningProgress(associatedTasks, boardData);
                        const tasks = associatedTasks.filter((task) => taskMatchesPortfolioFilters(task, state.portfolioFilters, boardData));
                        const rowId = `roadmap-row-${config.singular}-${item.id}`;
                        const taskListId = `roadmap-tasks-${config.singular}-${item.id}`;
                        return (
                            <div
                                id={rowId}
                                className="roadmap-row"
                                data-roadmap-kind={config.singular}
                                data-roadmap-id={item.id}
                                tabIndex={0}
                                role="group"
                                aria-labelledby={`${rowId}-title`}
                                onKeyDown={(event) => {
                                    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                                    event.preventDefault();
                                    actions.togglePortfolioRoadmapRowExpanded(boardId, expandKey);
                                }}
                                key={item.id}
                            >
                                <div className="roadmap-row-main">
                                    <div className="roadmap-row-labels" style={{ paddingInlineStart: 16 + depth * 18 }}>
                                        <div className="roadmap-row-actions">
                                            <button
                                                className="roadmap-action-btn"
                                                type="button"
                                                aria-label={`${t('common.edit')} ${item.title}`}
                                                title={t('common.edit')}
                                                data-action="edit-roadmap-item"
                                                data-roadmap-kind={kind}
                                                data-roadmap-id={item.id}
                                                disabled={!canEdit}
                                                onClick={() => actions.openRoadmapEntityModal(kind, item.id)}
                                            >
                                                {'✎'}
                                            </button>
                                            <button
                                                className="roadmap-action-btn"
                                                type="button"
                                                aria-label={`${t('common.delete')} ${item.title}`}
                                                title={t('common.delete')}
                                                data-action="delete-roadmap-item"
                                                data-roadmap-kind={kind}
                                                data-roadmap-id={item.id}
                                                disabled={!canEdit}
                                                onClick={() => actions.deleteRoadmapEntity(kind, item.id)}
                                            >
                                                {String.fromCodePoint(128465)}
                                            </button>
                                        </div>
                                        <div className="roadmap-tree-title">
                                            {hasChildren && <button className="roadmap-action-btn" type="button" aria-expanded={!expandedRows[`tree:${item.id}`]} aria-label={t('roadmap.toggleSubphases', { title: item.title })} onClick={() => actions.togglePortfolioRoadmapRowExpanded(boardId, `tree:${item.id}`)}>{expandedRows[`tree:${item.id}`] ? '▸' : '▾'}</button>}
                                            <h4 className="roadmap-row-title" id={`${rowId}-title`}>{item.title}</h4>
                                        </div>
                                        <div className="roadmap-row-meta">{formatRoadmapDateRange(item, language) || t('common.noDates')}</div>
                                        <div className="roadmap-row-usage">
                                            <span>{t('roadmap.visibleAssociated', { visible: tasks.length, total: progress.associated })}</span>
                                            <button
                                                className="roadmap-disclosure-btn"
                                                type="button"
                                                aria-expanded={expanded ? 'true' : 'false'}
                                                aria-controls={taskListId}
                                                aria-label={expanded ? t('roadmap.hideTasksFor', { title: item.title }) : t('roadmap.showTasksFor', { title: item.title })}
                                                data-action="toggle-roadmap-row"
                                                data-roadmap-kind={config.singular}
                                                data-roadmap-id={item.id}
                                                onClick={() => actions.togglePortfolioRoadmapRowExpanded(boardId, `${config.singular}:${item.id}`)}
                                            >
                                                {expanded ? t('roadmap.hideTasks') : t('roadmap.showTasks')}
                                            </button>
                                        </div>
                                        {kind !== 'sprints' && <div className="roadmap-progress" aria-label={t('roadmap.progress')}>
                                            <strong>{progress.percent === null ? t('roadmap.notApplicable') : `${new Intl.NumberFormat(language === 'pt' ? 'pt-PT' : 'en', { maximumFractionDigits: 1 }).format(progress.percent)}%`}</strong>
                                            <span>{t('roadmap.progressCounts', { done: progress.completed, eligible: progress.eligible, cancelled: progress.cancelled })}</span>
                                            {progress.percent !== null && <progress max="100" value={progress.percent} aria-label={t('roadmap.progress')} />}
                                        </div>}
                                    </div>
                                    <div className="roadmap-row-track">
                                        {gridGuides}
                                        {config.dateMode === 'single'
                                            ? (
                                                <>
                                                    <div className="roadmap-row-timeline-stem" style={{ left: `${placement?.point ?? 50}%` }} />
                                                    <div className="roadmap-row-timeline-point" style={{ left: `${placement?.point ?? 50}%` }} />
                                                </>
                                            )
                                            : <div className="roadmap-row-timeline-bar" style={{ left: `${placement?.left ?? 0}%`, width: `${placement?.width ?? 0}%` }} />}
                                    </div>
                                </div>
                                <div className="roadmap-expand-icon">{expanded ? t('common.collapse') : t('common.expand')}</div>
                                {expanded && (
                                    <RoadmapTaskList
                                        tasks={tasks}
                                        descriptor={`${config.singular}:${item.id}`}
                                        boardRecord={state.portfolioBoards.find((board) => board.id === boardId) as BoardRecord}
                                        boardData={boardData}
                                        historical={historical}
                                        state={state}
                                    />
                                )}
                            </div>
                        );
                    })}
            </div>
        </section>
    );
}

function PortfolioRoadmapView({ view, state }: { view: PortfolioRoadmapViewModel; state: RoadmapState }) {
    const { t } = useI18n();
    const { boardId, boardData, roadmap, range, axisTicks, historical } = view;
    const marker = getRoadmapTodayMarker(range);
    const boardRecord = state.portfolioBoards.find((board) => board.id === boardId);
    if (!boardRecord) return null;

    return (
        <div className="portfolio-roadmap-timeline surface-page surface-border">
            <div className="roadmap-axis-shell">
                <div className="roadmap-axis-label">{t('roadmap.timeline')}</div>
                <div className="roadmap-axis" data-roadmap-axis="shared">
                    <div className="roadmap-axis-line">
                        {axisTicks
                            .filter((tick) => Number.isFinite(tick?.position) && tick.position > 0 && tick.position < 100)
                            .map((tick) => (
                                <span
                                    className="roadmap-grid-guide"
                                    aria-hidden="true"
                                    style={{ left: `${tick.position}%` }}
                                    key={`axis-guide-${tick.label}`}
                                />
                            ))}
                        {marker && Number.isFinite(marker.position) && (
                            <span
                                className="roadmap-today-marker"
                                aria-label={t('roadmap.todayAria', { date: marker.iso })}
                                style={{ left: `${marker.position}%` }}
                            >
                                <span className="roadmap-today-marker-label">{t('common.today')}</span>
                            </span>
                        )}
                    </div>
                    <div className="roadmap-axis-ticks">
                        {axisTicks.map((tick) => (
                            <div className="roadmap-axis-tick" style={{ left: `${tick.position}%` }} key={tick.label}>
                                {tick.label}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {(['milestones', 'phases', 'sprints'] as const).map((kind) => (
                <RoadmapSection
                    key={kind}
                    boardId={boardId}
                    boardData={boardData}
                    historical={historical}
                    kind={kind}
                    items={roadmap?.[kind]}
                    range={range}
                    axisTicks={axisTicks}
                    state={state}
                />
            ))}
        </div>
    );
}

function ConnectedRoadmap() {
    const state = useAppStore(useShallow((state) => ({
        portfolioBoards: state.portfolioBoards,
        selectedPortfolioBoardId: state.selectedPortfolioBoardId,
        portfolioFilters: state.portfolioFilters,
        portfolioBulkSelectionByBoardId: state.portfolioBulkSelectionByBoardId,
        selectedPortfolioCardRef: state.selectedPortfolioCardRef,
        suppressPortfolioCardClickUntil: state.suppressPortfolioCardClickUntil,
        portfolioTimelineSelection: state.portfolioTimelineSelection,
        portfolioRoadmapExpandedRowsByBoardId: state.portfolioRoadmapExpandedRowsByBoardId,
        activeLanguage: state.activeLanguage,
    })));
    const view = buildPortfolioRoadmapView(state);
    return view ? <PortfolioRoadmapView view={view} state={state} /> : null;
}

export function PortfolioRoadmap({ hidden }: { hidden: boolean }) {
    return (
        <div className={`portfolio-roadmap-view${hidden ? ' hidden' : ''}`} id="portfolioRoadmapView">
            {!hidden && <ConnectedRoadmap />}
        </div>
    );
}
