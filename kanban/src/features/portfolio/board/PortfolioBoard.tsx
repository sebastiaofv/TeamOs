import { useState, type ReactNode } from 'react';
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
import type { BoardColumn } from '@/domain/types';
import type { PortfolioRow } from '@/features/portfolio/types';
import { useAppStore, type AppState } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { defaultColumns } from '@/domain/constants';
import { normalizeTaskStatus } from '@/domain/task';
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

function getColumnTitle(status: string, title: string, t: ReturnType<typeof useI18n>['t']): string {
    if (status === 'backlog') return t('board.backlog');
    if (status === 'to-do') return t('board.toDo');
    if (status === 'doing') return t('board.doing');
    if (status === 'done') return t('board.done');
    return title;
}

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
    const actions = usePortfolioActions();
    const { t } = useI18n();
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
        actions.endPortfolioCardDrag();
    };
    const onDragEnd = ({ active, over }: DragEndEvent) => {
        finishDrag();
        const card = active.data.current;
        const targetStatus = over?.data.current?.status;
        if (!card || !targetStatus || targetStatus === card.status) return;
        void actions.dropPortfolioTaskOnColumn(card.boardId, card.taskId, targetStatus);
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
                const columnTitle = getColumnTitle(column.status, column.title, t);
                return (
                    <div className="portfolio-column" data-status={column.status} key={column.status}>
                        <div className="portfolio-column-header">
                            <span className="column-title">{column.title}</span>
                            <span className="column-count">{items.length}</span>
                        </div>
                        <DroppableColumnBody column={{ ...column, title: columnTitle }}>
                            {canAddTasks && (
                                <div className="add-task-card" data-action="add-task" data-status={column.status} onClick={() => actions.openPortfolioCreateTaskModal(state.selectedPortfolioBoardId, column.status)}>{t('board.addTask')}</div>
                            )}
                            {items.length === 0
                                ? <div className="empty-state"><span className="empty-state-text">{t('common.noTasks')}</span></div>
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
