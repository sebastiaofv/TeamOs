import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
    DndContext,
    DragOverlay,
    MouseSensor,
    TouchSensor,
    pointerWithin,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type Active,
    type Announcements,
    type DragEndEvent,
    type UniqueIdentifier
} from '@dnd-kit/core';
import { useShallow } from 'zustand/react/shallow';
import type { BoardColumn, PortfolioRow } from '../types';
import { useAppStore, type AppState } from '../state/store';
import {
    deletePortfolioTask,
    dropPortfolioTaskOnColumn,
    editPortfolioTask,
    endPortfolioCardDrag,
    openPortfolioCreateTaskModal,
    openPortfolioTaskDetails,
    setHoveredPortfolioCard,
    setSelectedPortfolioCard,
    togglePortfolioArchiveTask,
    togglePortfolioTaskBulkSelection
} from '../actions/portfolioMutations';
import { defaultColumns } from '../domain/constants';
import { createPortfolioProjectColor } from '../domain/board';
import { formatDueDateForUi } from '../domain/calendar';
import {
    normalizeEffort,
    normalizePriority,
    normalizeTags,
    taskAssignees
} from '../domain/task';
import { isTaskOverdue, formatTaskStatusAge, normalizeTaskStatus } from '../domain/task';
import { formatTaskScore } from '../domain/scoring';
import { escapeRegExp } from '../domain/util';
import { isBoardInHistoricalPreview } from '../selectors/portfolioViews';

// The store fields a task card reads.
export type TaskCardState = Pick<AppState,
    | 'portfolioBoards'
    | 'selectedPortfolioBoardId'
    | 'portfolioFilters'
    | 'portfolioBulkSelectionByBoardId'
    | 'selectedPortfolioCardRef'
    | 'suppressPortfolioCardClickUntil'
    | 'portfolioTimelineSelection'
>;

type BoardViewState = TaskCardState & Pick<AppState, 'portfolioVisibleRows'>;

type CardDrag = {
    setNodeRef: (node: HTMLElement | null) => void;
    listeners: ReturnType<typeof useDraggable>['listeners'];
    isDragging: boolean;
};

function HighlightedTitle({ text = '', searchTerm }: { text?: string; searchTerm: string }) {
    const term = String(searchTerm || '').trim();
    if (!term) return text;
    const parts = String(text).split(new RegExp(`(${escapeRegExp(term)})`, 'ig'));
    return parts.map((part, index) => index % 2
        ? <span className="search-highlight" key={index}>{part}</span>
        : part);
}

function getBoardColor(state: Pick<AppState, 'portfolioBoards'>, boardId: string) {
    const board = state.portfolioBoards.find((record) => record.id === boardId);
    return board?.projectColor || createPortfolioProjectColor(board?.colorSeed || 0);
}

function selectedBulkTaskIds(state: Pick<AppState, 'portfolioBulkSelectionByBoardId'>, boardId: string) {
    return new Set((state.portfolioBulkSelectionByBoardId?.[boardId] || []).map((taskId) => Number(taskId)));
}

// `drag` comes from DraggableTaskCard on the board ({ setNodeRef, listeners,
// isDragging }); other views pass none. `overlay` renders the copy that
// follows the pointer while a card is dragged.
export function PortfolioTaskCard({ item, state, drag = null, overlay = false }: {
    item: PortfolioRow;
    state: TaskCardState;
    drag?: CardDrag | null;
    overlay?: boolean;
}) {
    const task = item.task;
    const canMutate = Boolean(item.canMutate) && !item.historical;
    const canDrag = canMutate;
    const taskId = item.taskId ?? task.id;
    const dragging = Boolean(drag?.isDragging);
    const dragNodeRef = drag?.setNodeRef;
    const selected = state.selectedPortfolioCardRef
        && state.selectedPortfolioCardRef.boardId === item.boardId
        && Number(state.selectedPortfolioCardRef.taskId) === Number(task.id);
    const priority = normalizePriority(task.priority);
    const effort = normalizeEffort(task.effort);
    const score = formatTaskScore(task);
    const searchTerm = state.portfolioFilters?.search || '';
    const projectLabel = item.boardTitle || item.boardFileName || 'Project';
    const showProjectBadge = !state.selectedPortfolioBoardId;
    const color = getBoardColor(state, item.boardId);
    const showBulkSelect = Boolean(state.selectedPortfolioBoardId)
        && state.selectedPortfolioBoardId === item.boardId
        && canMutate;
    const bulkSelected = selectedBulkTaskIds(state, item.boardId).has(Number(task.id));
    const assignees = taskAssignees(task);
    const statusAge = formatTaskStatusAge(task);
    const readOnlyTitle = item.historical ? 'Historical preview (read-only)' : 'Read-only (no file handle)';
    const archiveButtonTitle = task.archived ? 'Restore' : 'Archive';
    const cardRef = useRef<HTMLDivElement | null>(null);
    const setCardRef = useCallback((node: HTMLDivElement | null) => {
        cardRef.current = node;
        dragNodeRef?.(node);
    }, [dragNodeRef]);

    // Keyboard selection (J/K) can land on a card outside the scrolled area.
    useEffect(() => {
        if (selected && !overlay) cardRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [selected, overlay]);

    function handleCardClick(event: MouseEvent<HTMLDivElement>) {
        if ((event.target as Element).closest('button, input, label')) return;
        if (Date.now() < state.suppressPortfolioCardClickUntil) return;
        setSelectedPortfolioCard(item.boardId, taskId);
        if (!item.historical) {
            openPortfolioTaskDetails(item.boardId, taskId);
        } else if (item.boardData) {
            openPortfolioTaskDetails(item.boardId, taskId, {
                boardData: item.boardData,
                readOnly: true
            });
        }
    }

    return (
        <div
            ref={setCardRef}
            className={`task-card portfolio-task-card surface-card${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${overlay ? ' drag-overlay' : ''}`}
            data-draggable={canDrag ? 'true' : 'false'}
            data-board-id={item.boardId}
            data-task-id={String(taskId)}
            data-status={normalizeTaskStatus(task.status)}
            data-historical={item.historical ? 'true' : 'false'}
            aria-hidden={overlay ? 'true' : undefined}
            onClick={overlay ? undefined : handleCardClick}
            onMouseEnter={overlay ? undefined : () => setHoveredPortfolioCard(item.boardId, taskId)}
            onMouseLeave={overlay ? undefined : () => setHoveredPortfolioCard(null, null)}
            {...drag?.listeners}
        >
            <div className="task-header">
                <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
                    {showBulkSelect && (
                        <label className="portfolio-task-card-select">
                            <input
                                type="checkbox"
                                data-action="toggle-bulk-task-selection"
                                data-board-id={item.boardId}
                                data-task-id={String(taskId)}
                                checked={bulkSelected}
                                onChange={(event) => togglePortfolioTaskBulkSelection(item.boardId, taskId, event.target.checked)}
                            />
                            <span className="portfolio-task-card-select-label">Select {task.title || `Task ${task.id}`}</span>
                        </label>
                    )}
                    <span className="task-title">
                        <HighlightedTitle text={task.title || ''} searchTerm={searchTerm} />
                    </span>
                </div>
                <div className="task-actions">
                    <button className="task-action-btn" type="button" disabled={!canMutate} title={canMutate ? 'Edit' : readOnlyTitle} data-action="edit-task" onClick={() => editPortfolioTask(item.boardId, taskId)}>&#9998;</button>
                    <button className="task-action-btn" type="button" disabled={!canMutate} title={canMutate ? archiveButtonTitle : readOnlyTitle} data-action="archive-task" onClick={() => togglePortfolioArchiveTask(item.boardId, taskId)}>{task.archived ? '↶' : '🗄️'}</button>
                    <button className="task-action-btn task-action-danger" type="button" disabled={!canMutate} title={canMutate ? 'Delete' : readOnlyTitle} aria-label={canMutate ? 'Delete' : readOnlyTitle} data-action="delete-task" onClick={() => deletePortfolioTask(item.boardId, taskId)}>🗑️</button>
                </div>
            </div>
            {(showProjectBadge || assignees.length > 0 || normalizeTags(task.tags).length > 0 || task.blocked || statusAge || isTaskOverdue(task) || priority || effort || score !== '-' || task.dueDate || task.checklist?.length) && (
                <div className="task-meta">
                    {showProjectBadge && <span className="portfolio-project-badge" style={{ background: color.bg, borderColor: color.border, color: color.text }} title={projectLabel}>{projectLabel}</span>}
                    {assignees.map((name) => <span className="task-tag task-tag-assignee" title="Assignee" key={`assignee-${name}`}>{name}</span>)}
                    {normalizeTags(task.tags).map((tag) => <span className="task-tag task-tag-label" key={`tag-${tag}`}>{tag}</span>)}
                    {task.blocked && <span className="task-tag task-tag-blocked" title="Blocked">Blocked</span>}
                    {statusAge && <span className="task-tag task-tag-age" title="Time in current status">{statusAge}</span>}
                    {isTaskOverdue(task) && <span className="task-tag" title="Overdue"><span className="due-dot" />Overdue</span>}
                    {priority && <span className="task-tag"><span className={`priority-dot priority-${task.priority}`} />{priority.charAt(0).toUpperCase() + priority.slice(1)}</span>}
                    {effort && <span className="task-tag" title="Effort"><span className={`effort-dot effort-${effort.toLowerCase()}`} />{effort}</span>}
                    {score !== '-' && <span className="task-tag task-tag-score" title="Score (Priority / Effort)">Score {score}</span>}
                    {task.dueDate && <span className="task-tag">{formatDueDateForUi(task.dueDate)}</span>}
                    {task.checklist?.length > 0 && <span className="task-tag">{task.checklist.filter((entry) => entry.done).length}/{task.checklist.length} done</span>}
                </div>
            )}
        </div>
    );
}

const cardDragId = (item: PortfolioRow) => `${item.boardId}:${item.taskId ?? item.task.id}`;

const draggedTitle = (active: Active | null) => active?.data.current?.title || 'task';
const BOARD_DRAG_ANNOUNCEMENTS: Announcements = {
    onDragStart: ({ active }) => `Picked up ${draggedTitle(active)}.`,
    onDragOver: ({ active, over }) => (over
        ? `${draggedTitle(active)} is over ${over.data.current?.title}.`
        : `${draggedTitle(active)} is not over a column.`),
    onDragEnd: ({ active, over }) => (over
        ? `${draggedTitle(active)} dropped in ${over.data.current?.title}.`
        : `${draggedTitle(active)} dropped.`),
    onDragCancel: ({ active }) => `Moving ${draggedTitle(active)} was cancelled.`
};

function DraggableTaskCard({ item, state }: { item: PortfolioRow; state: TaskCardState }) {
    const canDrag = Boolean(item.canMutate) && !item.historical;
    const { setNodeRef, listeners, isDragging } = useDraggable({
        id: cardDragId(item),
        data: {
            boardId: item.boardId,
            taskId: Number(item.taskId ?? item.task.id),
            status: normalizeTaskStatus(item.task.status),
            title: item.task.title
        },
        disabled: !canDrag
    });
    return <PortfolioTaskCard item={item} state={state} drag={{ setNodeRef, listeners, isDragging }} />;
}

// Highlights only when the dragged card would change status here.
function DroppableColumnBody({ column, children }: { column: BoardColumn; children: ReactNode }) {
    const { setNodeRef, isOver, active } = useDroppable({
        id: `column:${column.status}`,
        data: { status: column.status, title: column.title }
    });
    const highlight = isOver && active?.data.current?.status !== column.status;
    return (
        <div
            ref={setNodeRef}
            className={`portfolio-column-body${highlight ? ' drag-over' : ''}`}
            id={`portfolio-${column.status}-column`}
            data-status={column.status}
        >
            {children}
        </div>
    );
}

function PortfolioBoardView({ state }: { state: BoardViewState }) {
    const [activeCardId, setActiveCardId] = useState<UniqueIdentifier | null>(null);
    const sensors = useSensors(
        // A short move before dragging keeps clicks on the card working.
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        // Touch waits for a brief press, so swiping still scrolls the board.
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
    );

    const rows = Array.isArray(state.portfolioVisibleRows) ? state.portfolioVisibleRows : [];
    const buckets: Record<string, PortfolioRow[]> = Object.fromEntries(defaultColumns.map((column) => [column.status, []]));
    rows.forEach((item) => {
        const status = normalizeTaskStatus(item.task.status);
        if (!buckets[status]) buckets[status] = [];
        buckets[status].push(item);
    });
    const activeRow = activeCardId ? rows.find((row) => cardDragId(row) === activeCardId) : null;

    const selectedBoard = state.portfolioBoards.find((board) => board.id === state.selectedPortfolioBoardId);
    const canAddTasks = Boolean(state.selectedPortfolioBoardId)
        && Boolean(selectedBoard?.handle)
        && !isBoardInHistoricalPreview(state, state.selectedPortfolioBoardId);

    const finishDrag = () => {
        setActiveCardId(null);
        endPortfolioCardDrag();
    };
    const onDragEnd = ({ active, over }: DragEndEvent) => {
        finishDrag();
        const card = active.data.current;
        const targetStatus = over?.data.current?.status;
        if (!card || !targetStatus || targetStatus === card.status) return;
        void dropPortfolioTaskOnColumn(card.boardId, card.taskId, targetStatus);
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            accessibility={{ announcements: BOARD_DRAG_ANNOUNCEMENTS }}
            onDragStart={({ active }) => setActiveCardId(active.id)}
            onDragEnd={onDragEnd}
            onDragCancel={finishDrag}
        >
            {defaultColumns.map((column) => {
                const items = buckets[column.status] || [];
                return (
                    <div className="portfolio-column" data-status={column.status} key={column.status}>
                        <div className="portfolio-column-header">
                            <span className="column-title">{column.title}</span>
                            <span className="column-count">{items.length}</span>
                        </div>
                        <DroppableColumnBody column={column}>
                            {canAddTasks && (
                                <div className="add-task-card" data-action="add-task" data-status={column.status} onClick={() => openPortfolioCreateTaskModal(state.selectedPortfolioBoardId, column.status)}>+ Add Task</div>
                            )}
                            {items.length === 0
                                ? <div className="empty-state"><span className="empty-state-text">No tasks</span></div>
                                : items.map((item) => <DraggableTaskCard item={item} state={state} key={cardDragId(item)} />)}
                        </DroppableColumnBody>
                    </div>
                );
            })}
            {/* In a portal, so the column's scroll area never clips the card being dragged. */}
            {createPortal(
                <DragOverlay dropAnimation={null}>
                    {activeRow && <PortfolioTaskCard item={activeRow} state={state} overlay />}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}

function ConnectedBoard() {
    const state = useAppStore(useShallow((state) => ({
        portfolioBoards: state.portfolioBoards,
        selectedPortfolioBoardId: state.selectedPortfolioBoardId,
        portfolioFilters: state.portfolioFilters,
        portfolioBulkSelectionByBoardId: state.portfolioBulkSelectionByBoardId,
        selectedPortfolioCardRef: state.selectedPortfolioCardRef,
        suppressPortfolioCardClickUntil: state.suppressPortfolioCardClickUntil,
        portfolioTimelineSelection: state.portfolioTimelineSelection,
        portfolioVisibleRows: state.portfolioVisibleRows,
    })));
    return <PortfolioBoardView state={state} />;
}

export function PortfolioBoard({ hidden }: { hidden: boolean }) {
    return (
        <div className={`portfolio-board-grid${hidden ? ' hidden' : ''}`} id="portfolioBoard">
            {!hidden && <ConnectedBoard />}
        </div>
    );
}
