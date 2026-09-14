import { useAppStore } from '../state/store.js';
import { PortfolioTaskCard } from './PortfolioBoard.jsx';
import {
    compareRoadmapItemsByDate,
    formatRoadmapDateRange,
    getRoadmapEntityConfig,
    getRoadmapTaskFieldTasks,
    getRoadmapTimelinePlacement,
    getRoadmapTodayMarker
} from '../domain/roadmap.js';
import { normalizeTask } from '../domain/task.js';
import { buildPortfolioRoadmapView } from '../selectors/portfolioViews.js';
import {
    deleteRoadmapEntity,
    openRoadmapEntityModal,
    togglePortfolioRoadmapRowExpanded
} from '../actions/portfolioMutations.js';

function RoadmapTaskList({ tasks, descriptor, boardRecord, boardData, historical, state }) {
    const boardIndex = state.portfolioBoards.findIndex((board) => board.id === boardRecord.id);
    if (tasks.length === 0) {
        return (
            <div className="roadmap-task-list" data-roadmap-task-list={descriptor}>
                <div className="roadmap-task-list-gutter" aria-hidden="true" />
                <div className="roadmap-task-list-track">
                    <div className="roadmap-task-empty">No tasks assigned.</div>
                </div>
            </div>
        );
    }

    return (
        <div className="roadmap-task-list" data-roadmap-task-list={descriptor}>
            <div className="roadmap-task-list-gutter" aria-hidden="true" />
            <div className="roadmap-task-list-track">
                {tasks.map((task, taskIndex) => (
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
                ))}
            </div>
        </div>
    );
}

function RoadmapSection({ boardId, boardData, historical, kind, items, range, axisTicks, state }) {
    const config = getRoadmapEntityConfig(kind);
    if (!config) return null;
    const sortedItems = Array.isArray(items) ? [...items].sort(compareRoadmapItemsByDate) : [];
    const expandedRows = state.portfolioRoadmapExpandedRowsByBoardId?.[boardId] || {};
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
            onClick={(event) => {
                if (event.target.closest('button, .roadmap-task-list')) return;
                const row = event.target.closest('.roadmap-row[data-roadmap-kind][data-roadmap-id]');
                if (row) togglePortfolioRoadmapRowExpanded(boardId, `${row.dataset.roadmapKind}:${row.dataset.roadmapId}`);
            }}
        >
            <div className="roadmap-section-header">
                <div>
                    <h3 className="roadmap-section-title">{config.label}s</h3>
                    <div className="roadmap-section-subtitle">Assigned {config.singular}s on the shared roadmap.</div>
                </div>
                <button
                    className="roadmap-section-btn"
                    type="button"
                    aria-label={`Add ${config.label}`}
                    data-action="add-roadmap-item"
                    data-roadmap-kind={kind}
                    onClick={() => openRoadmapEntityModal(kind)}
                >
                    + {config.label}
                </button>
            </div>
            <div className="roadmap-list">
                {sortedItems.length === 0
                    ? <div className="roadmap-empty">No {config.singular}s yet. Use the add button to create the first {config.singular}.</div>
                    : sortedItems.map((item) => {
                        const expandKey = `${config.singular}:${item.id}`;
                        const expanded = Boolean(expandedRows[expandKey]);
                        const placement = getRoadmapTimelinePlacement(item, range);
                        const tasks = getRoadmapTaskFieldTasks(boardData, config.taskField, item.id);
                        return (
                            <div
                                className="roadmap-row"
                                data-roadmap-kind={config.singular}
                                data-roadmap-id={item.id}
                                aria-expanded={expanded ? 'true' : 'false'}
                                key={item.id}
                            >
                                <div className="roadmap-row-main">
                                    <div className="roadmap-row-labels">
                                        <div className="roadmap-row-actions">
                                            <button
                                                className="roadmap-action-btn"
                                                type="button"
                                                aria-label={`Edit ${item.title}`}
                                                title="Edit"
                                                data-action="edit-roadmap-item"
                                                data-roadmap-kind={kind}
                                                data-roadmap-id={item.id}
                                                onClick={() => openRoadmapEntityModal(kind, item.id)}
                                            >
                                                {'✎'}
                                            </button>
                                            <button
                                                className="roadmap-action-btn"
                                                type="button"
                                                aria-label={`Delete ${item.title}`}
                                                title="Delete"
                                                data-action="delete-roadmap-item"
                                                data-roadmap-kind={kind}
                                                data-roadmap-id={item.id}
                                                onClick={() => deleteRoadmapEntity(kind, item.id)}
                                            >
                                                {String.fromCodePoint(128465)}
                                            </button>
                                        </div>
                                        <h3 className="roadmap-row-title">{item.title}</h3>
                                        <div className="roadmap-row-meta">{formatRoadmapDateRange(item) || 'No dates'}</div>
                                        <div className="roadmap-row-usage">
                                            <span>{tasks.length === 1 ? '1 linked task' : `${tasks.length} linked tasks`}</span>
                                            <button
                                                className="roadmap-disclosure-btn"
                                                type="button"
                                                aria-expanded={expanded ? 'true' : 'false'}
                                                aria-label={`${expanded ? 'Hide tasks for' : 'Show tasks for'} ${item.title}`}
                                                data-action="toggle-roadmap-row"
                                                data-roadmap-kind={config.singular}
                                                data-roadmap-id={item.id}
                                                onClick={() => togglePortfolioRoadmapRowExpanded(boardId, `${config.singular}:${item.id}`)}
                                            >
                                                {expanded ? 'Hide tasks' : 'Show tasks'}
                                            </button>
                                        </div>
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
                                <div className="roadmap-expand-icon">{expanded ? 'Collapse' : 'Expand'}</div>
                                {expanded && (
                                    <RoadmapTaskList
                                        tasks={tasks}
                                        descriptor={`${config.singular}:${item.id}`}
                                        boardRecord={state.portfolioBoards.find((board) => board.id === boardId)}
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

function PortfolioRoadmapView({ view, state }) {
    const { boardId, boardData, roadmap, range, axisTicks, historical } = view;
    const marker = getRoadmapTodayMarker(range);
    const boardRecord = state.portfolioBoards.find((board) => board.id === boardId);
    if (!boardRecord) return null;

    return (
        <div className="portfolio-roadmap-timeline surface-page surface-border">
            <div className="roadmap-axis-shell">
                <div className="roadmap-axis-label">Timeline</div>
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
                                aria-label={`Today (${marker.iso})`}
                                style={{ left: `${marker.position}%` }}
                            >
                                <span className="roadmap-today-marker-label">Today</span>
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
            {['milestones', 'phases', 'sprints'].map((kind) => (
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

export function PortfolioRoadmap({ hidden }) {
    const state = useAppStore((current) => current);
    const view = buildPortfolioRoadmapView(state);
    return (
        <div className={`portfolio-roadmap-view${hidden ? ' hidden' : ''}`} id="portfolioRoadmapView">
            {view && <PortfolioRoadmapView view={view} state={state} />}
        </div>
    );
}
