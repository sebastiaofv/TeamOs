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
import { isBoardInHistoricalPreview } from '@/features/portfolio/queries';
import { PortfolioTaskCard, type TaskCardState } from '@/features/portfolio/task/TaskCard';
import { useI18n, translateCurrent } from '@/shared/i18n';
import { buildPortfolioBoardView } from '@/features/portfolio/queries/portfolioBoardView';

export { PortfolioTaskCard } from '@/features/portfolio/task/TaskCard';
export type { CardDrag, TaskCardState } from '@/features/portfolio/task/TaskCard';

type BoardViewState = TaskCardState & Pick<AppState, 'portfolioVisibleRows'>;

function columnTitle(column: BoardColumn, t: ReturnType<typeof useI18n>['t']): string {
    if (column.status === 'backlog' && ['backlog', 'Backlog'].includes(column.title)) return t('board.backlog');
    if (column.status === 'to-do' && ['to-do', 'To Do'].includes(column.title)) return t('board.toDo');
    if (column.status === 'doing' && ['in progress', 'In progress', 'Doing'].includes(column.title)) return t('board.doing');
    if (column.status === 'done' && ['done', 'Done'].includes(column.title)) return t('board.done');
    return column.title;
}

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
            title: item.task.title
        },
        attributes: { role: 'group', roleDescription: 'draggable task', tabIndex: 0 },
        disabled: !canDrag
    });
    return <PortfolioTaskCard item={item} state={state} drag={{ setNodeRef, listeners, attributes, isDragging }} />;
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
    const [mode, setMode] = useState<'technical' | 'functional'>('technical');
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
    const { columns, buckets } = buildPortfolioBoardView(state, mode);
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
        const status = over?.data.current?.status;
        if (card && status && status !== card.status) {
            if (state.selectedPortfolioBoardId) void actions.dropPortfolioTaskOnColumn(card.boardId, card.taskId, status);
            else void actions.movePortfolioTaskToCategory(card.boardId, card.taskId, (({ doing: 'in-progress', done: 'completed' } as Record<string, string>)[status] || status) as WorkflowCategory);
        }
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
            <div className="workitem-board-shell">
                <div className="workitem-board-toolbar" role="group" aria-label={t('workitems.type')}>
                    {(['technical', 'functional'] as const).map((value) => <button className={`btn${mode === value ? ' active' : ''}`} type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{t(`workitems.${value}`)}</button>)}
                </div>
                <div className="workitem-board-columns">
                    {!columns.length && <p className="board-columns-empty" role="status">{t('board.allColumnsHidden')}</p>}
                    {columns.map((column) => {
                        const items = buckets[column.status] || [];
                        const title = columnTitle(column, t);
                        return <section className="portfolio-column" data-status={column.status} key={column.status}>
                            <div className="portfolio-column-header"><h2 className="column-title" id={`portfolio-${column.status}-heading`}>{title}</h2><span className="column-count">{items.length}</span></div>
                            <DroppableColumnBody column={{ ...column, title }}>
                                {canAddTasks && <button className="add-task-card" type="button" data-action="add-task" data-status={column.status} onClick={() => actions.openPortfolioCreateTaskModal(state.selectedPortfolioBoardId, 'backlog', { preferredType: mode === 'functional' ? 'story' : 'task' })}>{t('board.addTask')}</button>}
                                {items.length ? items.map((item) => <DraggableTaskCard item={item} state={state} key={cardDragId(item)} />) : <p className="empty-state">{t('common.noTasks')}</p>}
                            </DroppableColumnBody>
                        </section>;
                    })}
                </div>
            </div>
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
    return state.portfolioBoards.length ? <PortfolioBoardView state={state} /> : null;
}

export function PortfolioBoard({ hidden }: { hidden: boolean }) {
    return (
        <div className={`portfolio-board-grid${hidden ? ' hidden' : ''}`} id="portfolioBoard">
            {!hidden && <ConnectedBoard />}
        </div>
    );
}
