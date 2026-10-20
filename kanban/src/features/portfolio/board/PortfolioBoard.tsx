import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
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
import type { BoardColumn, WorkflowCategory } from '@/domain/types';
import type { PortfolioRow } from '@/features/portfolio/types';
import { useAppStore, type AppState } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { statusCategory } from '@/domain/workflow';
import { isBoardInHistoricalPreview } from '@/features/portfolio/queries';
import { PortfolioTaskCard, type TaskCardState } from '@/features/portfolio/task/TaskCard';
import { useI18n, translateCurrent } from '@/shared/i18n';

export { PortfolioTaskCard } from '@/features/portfolio/task/TaskCard';
export type { CardDrag, TaskCardState } from '@/features/portfolio/task/TaskCard';

type BoardViewState = TaskCardState & Pick<AppState, 'portfolioVisibleRows'>;

const cardDragId = (item: PortfolioRow) => `${item.boardId}:${item.taskId ?? item.task.id}`;

const draggedTitle = (active: Active | null) => active?.data.current?.title || translateCurrent('common.task');
const BOARD_DRAG_ANNOUNCEMENTS: Announcements = {
    onDragStart: ({ active }) => translateCurrent('drag.pickedUp', { title: draggedTitle(active) }),
    onDragOver: ({ active, over }) => (over
        ? translateCurrent('drag.over', { title: draggedTitle(active), target: over.data.current?.title || '' })
        : translateCurrent('drag.notOverColumn', { title: draggedTitle(active) })),
    onDragEnd: ({ active, over }) => (over
        ? translateCurrent('drag.droppedIn', { title: draggedTitle(active), target: over.data.current?.title || '' })
        : translateCurrent('drag.dropped', { title: draggedTitle(active) })),
    onDragCancel: ({ active }) => translateCurrent('drag.movingCancelled', { title: draggedTitle(active) })
};

function DraggableTaskCard({ item, state }: { item: PortfolioRow; state: TaskCardState }) {
    const canDrag = Boolean(item.canMutate) && !item.historical;
    const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
        id: cardDragId(item),
        data: {
            boardId: item.boardId,
            taskId: Number(item.taskId ?? item.task.id),
            status: item.task.status,
            bucketStatus: statusCategory(item.task.status, item.boardData || state.portfolioBoards.find((board) => board.id === item.boardId)?.data),
            title: item.task.title
        },
        attributes: { role: 'group', roleDescription: 'draggable task', tabIndex: 0 },
        disabled: !canDrag
    });
    return <PortfolioTaskCard item={item} state={state} drag={{ setNodeRef, listeners, attributes, isDragging }} />;
}

// Highlights only when the dragged card would change status here.
function DroppableColumnBody({ column, children }: { column: BoardColumn & { category: WorkflowCategory }; children: ReactNode }) {
    const { setNodeRef, isOver, active } = useDroppable({
        id: `column:${column.status}`,
        data: { category: column.category, title: column.title }
    });
    const highlight = isOver && active?.data.current?.bucketStatus !== column.category;
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
    const actions = usePortfolioActions();
    const { t } = useI18n();
    const [activeCardId, setActiveCardId] = useState<UniqueIdentifier | null>(null);
    const sensors = useSensors(
        // A short move before dragging keeps clicks on the card working.
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        // Touch waits for a brief press, so swiping still scrolls the board.
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
        // The same card can be picked up without a pointer or touch device.
        useSensor(KeyboardSensor)
    );

    const rows = Array.isArray(state.portfolioVisibleRows) ? state.portfolioVisibleRows : [];
    const selectedBoard = state.portfolioBoards.find((board) => board.id === state.selectedPortfolioBoardId);
    const columns: (BoardColumn & { category: WorkflowCategory })[] = [
        { status: 'to-do', category: 'to-do', title: t('board.toDo') },
        { status: 'doing', category: 'in-progress', title: t('board.doing') },
        { status: 'done', category: 'completed', title: t('board.done') }
    ];
    const buckets: Record<string, PortfolioRow[]> = {};
    rows.forEach((item) => {
        const status = statusCategory(item.task.status, item.boardData || state.portfolioBoards.find((b) => b.id === item.boardId)?.data);
        if (!buckets[status]) buckets[status] = [];
        buckets[status].push(item);
    });
    const activeRow = activeCardId ? rows.find((row) => cardDragId(row) === activeCardId) : null;

    const canAddTasks = Boolean(state.selectedPortfolioBoardId)
        && Boolean(selectedBoard?.handle)
        && !isBoardInHistoricalPreview(state, state.selectedPortfolioBoardId);

    const finishDrag = () => {
        setActiveCardId(null);
        actions.endPortfolioCardDrag();
    };
    const onDragEnd = ({ active, over }: DragEndEvent) => {
        finishDrag();
        const card = active.data.current;
        const category = over?.data.current?.category;
        if (card && category) void actions.movePortfolioTaskToCategory(card.boardId, card.taskId, category);
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
            <section className="portfolio-backlog" aria-label={t('board.backlog')}>
                <details open><summary>{t('board.backlog')} · {(buckets.backlog || []).length}</summary>
                    <div className="portfolio-backlog-items">{(buckets.backlog || []).map((item) => <DraggableTaskCard item={item} state={state} key={cardDragId(item)} />)}</div>
                </details>
                {canAddTasks && <button className="btn" onClick={() => actions.openPortfolioCreateTaskModal(state.selectedPortfolioBoardId, 'backlog')}>{t('board.addTask')}</button>}
            </section>
            <div className="workflow-board-columns">{columns.map((column) => {
                const items = buckets[column.category] || [];
                const columnTitle = column.title;
                return (
                    <section className="portfolio-column" data-status={column.status} data-category={column.category} aria-labelledby={`portfolio-${column.status}-heading`} key={column.status}>
                        <div className="portfolio-column-header">
                            <h2 className="column-title" id={`portfolio-${column.status}-heading`}>{columnTitle}</h2>
                            <span className="column-count" aria-label={t('board.columnLabel', { title: columnTitle, count: items.length })}>{items.length}</span>
                        </div>
                        <DroppableColumnBody column={{ ...column, title: columnTitle }}>
                            {canAddTasks && (
                                <button className="add-task-card" type="button" data-action="add-task" data-status={column.status} onClick={() => actions.openPortfolioCreateTaskModal(state.selectedPortfolioBoardId, column.status)}>{t('board.addTask')}</button>
                            )}
                            {items.length === 0
                                ? <p className="empty-state"><span className="empty-state-text">{t('common.noTasks')}</span></p>
                                : items.map((item) => <DraggableTaskCard item={item} state={state} key={cardDragId(item)} />)}
                        </DroppableColumnBody>
                    </section>
                );
            })}</div>
            {(buckets.cancelled || []).length > 0 && <section className="portfolio-cancelled" aria-label={t('workflow.cancelled')}><details>
                <summary>{t('workflow.cancelled')} · {buckets.cancelled.length}</summary>
                <div className="portfolio-backlog-items">{buckets.cancelled.map((item) => <DraggableTaskCard item={item} state={state} key={cardDragId(item)} />)}</div>
            </details></section>}
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
