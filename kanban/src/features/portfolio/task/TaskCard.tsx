import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { nextWorkflowState } from '@/domain/workflow';
import { workitemLabel } from '@/domain/taskIdentity';
import { workitemType } from '@/domain/workitems';
import { memo, useState, useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import type { useDraggable } from '@dnd-kit/core';
import type { PortfolioRow } from '@/features/portfolio/types';
import { portfolioActions as actions } from '@/features/portfolio/commands/portfolioCommands';
import type { AppState } from '@/features/portfolio/state/store';
import { escapeRegExp } from '@/domain/util';
import { useI18n } from '@/shared/i18n';

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

export type CardDrag = {
    setNodeRef: (node: HTMLElement | null) => void;
    listeners: ReturnType<typeof useDraggable>['listeners'];
    attributes: ReturnType<typeof useDraggable>['attributes'];
    isDragging: boolean;
};

/** Selection changes only affect the previously selected and next selected card. */
export function sameTaskCardState(before: TaskCardState, after: TaskCardState, item: PortfolioRow): boolean {
    const selected = (state: TaskCardState) => state.selectedPortfolioCardRef?.boardId === item.boardId
        && Number(state.selectedPortfolioCardRef.taskId) === Number(item.taskId);
    const bulkSelected = (state: TaskCardState) => (state.portfolioBulkSelectionByBoardId[item.boardId] || []).includes(Number(item.taskId));
    return before.selectedPortfolioBoardId === after.selectedPortfolioBoardId
        && before.portfolioFilters.search === after.portfolioFilters.search
        && before.suppressPortfolioCardClickUntil === after.suppressPortfolioCardClickUntil
        && before.portfolioBoards.find((board) => board.id === item.boardId) === after.portfolioBoards.find((board) => board.id === item.boardId)
        && selected(before) === selected(after)
        && bulkSelected(before) === bulkSelected(after);
}

function HighlightedTitle({ text = '', searchTerm }: { text?: string; searchTerm: string }) {
    const term = String(searchTerm || '').trim();
    if (!term) return text;
    const parts = String(text).split(new RegExp(`(${escapeRegExp(term)})`, 'ig'));
    return parts.map((part, index) => index % 2
        ? <span className="search-highlight" key={index}>{part}</span>
        : part);
}

// `drag` comes from DraggableTaskCard on the board ({ setNodeRef, listeners,
// isDragging }); other views pass none. `overlay` renders the copy that
// follows the pointer while a card is dragged.
export const PortfolioTaskCard = memo(function PortfolioTaskCard({ item, state, drag = null, overlay = false }: {
    item: PortfolioRow;
    state: TaskCardState;
    drag?: CardDrag | null;
    overlay?: boolean;
}) {
    const { t } = useI18n();
    const task = item.task;
    const canMutate = Boolean(item.canMutate) && !item.historical;
    const canDrag = canMutate;
    const taskId = item.taskId ?? task.id;
    const dragging = Boolean(drag?.isDragging);
    const dragNodeRef = drag?.setNodeRef;
    const selected = state.selectedPortfolioCardRef
        && state.selectedPortfolioCardRef.boardId === item.boardId
        && Number(state.selectedPortfolioCardRef.taskId) === Number(task.id);
    const searchTerm = state.portfolioFilters?.search || '';
    const boardData = item.boardData || state.portfolioBoards.find((b) => b.id === item.boardId)?.data;
    const type = workitemType(task);
    const nextState = boardData ? nextWorkflowState(boardData, task) : undefined;
    const [busy, setBusy] = useState(false);
    const members = boardData?.extensions.project?.members || [];
    const cardRef = useRef<HTMLElement | null>(null);
    const setCardRef = useCallback((node: HTMLElement | null) => {
        cardRef.current = node;
        dragNodeRef?.(node);
    }, [dragNodeRef]);

    // Keyboard selection (J/K) can land on a card outside the scrolled area.
    useEffect(() => {
        if (selected && !overlay) cardRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [selected, overlay]);

    function openDetails() {
        actions.setSelectedPortfolioCard(item.boardId, taskId);
        if (!item.historical) {
            actions.openPortfolioTaskDetails(item.boardId, taskId);
        } else if (item.boardData) {
            actions.openPortfolioTaskDetails(item.boardId, taskId, {
                boardData: item.boardData,
                readOnly: true
            });
        }
    }

    function handleCardClick(event: MouseEvent<HTMLElement>) {
        if ((event.target as Element).closest('button, input, select, label, summary, details')) return;
        if (Date.now() < state.suppressPortfolioCardClickUntil) return;
        event.currentTarget.focus({ preventScroll: true });
        openDetails();
    }

    function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.target !== event.currentTarget || event.defaultPrevented) return;
        // Space is reserved for dnd-kit when this card can be moved. Enter
        // remains a predictable way to open details from the card itself.
        if (event.key === 'Enter' || (event.key === ' ' && !canDrag)) {
            event.preventDefault();
            event.stopPropagation();
            openDetails();
        }
    }

    return (
        <article
            ref={setCardRef}
            className={`task-card portfolio-task-card surface-card${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${overlay ? ' drag-overlay' : ''}`}
            data-draggable={canDrag ? 'true' : 'false'}
            data-board-id={item.boardId}
            data-task-id={String(taskId)}
            data-status={task.status}
            data-historical={item.historical ? 'true' : 'false'}
            role="group"
            tabIndex={overlay ? -1 : 0}
            aria-labelledby={`portfolio-task-title-${item.boardId}-${taskId}`}
            aria-hidden={overlay ? 'true' : undefined}
            onClick={overlay ? undefined : handleCardClick}
            onKeyDown={overlay ? undefined : handleCardKeyDown}
            onMouseEnter={overlay ? undefined : () => actions.setHoveredPortfolioCard(item.boardId, taskId)}
            onMouseLeave={overlay ? undefined : () => actions.setHoveredPortfolioCard(null, null)}
            {...(drag && canDrag ? drag.attributes : {})}
            {...drag?.listeners}
        >
            <div className="task-card-top"><span className="task-card-id">{workitemLabel(task)}</span>
                {canMutate && nextState && !overlay && <button className="btn icon-btn task-card-next" type="button" title={t('table.nextState', { state: nextState.name })} aria-label={t('table.nextState', { state: nextState.name })} disabled={busy}
                    onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()}
                    onClick={async event => { event.stopPropagation(); setBusy(true); try { await actions.movePortfolioTaskToStatus(item.boardId, taskId, nextState.id); } finally { setBusy(false); } }}><WorkspaceIcon name="arrowRight" /></button>}
            </div>
            <span className="task-title" id={`portfolio-task-title-${item.boardId}-${taskId}`} title={task.title}>
                <HighlightedTitle text={task.title || ''} searchTerm={searchTerm} />
            </span>
            <div className="workitem-card-context">
                <span className="task-card-identity" title={`${workitemLabel(task)} · ${t(`workitems.type.${type}`)}`}>
                    <span className="task-card-type">{t(`workitems.type.${type}`)}</span>
                </span>
                <span className="task-card-owner" title={`${t('task.responsible')}: ${task.responsible || t('board.notAssigned')}`}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="5" r="2.5" /><path d="M2.5 14v-1a5.5 5.5 0 0 1 11 0v1Z" /></svg>
                    <select onMouseDown={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()} className="task-card-owner-name" aria-label={t('task.responsible')} value={task.responsible || ''} disabled={!canMutate || busy} onChange={async (event) => { setBusy(true); try { await actions.setPortfolioTaskResponsible(item.boardId, taskId, event.target.value); } finally { setBusy(false); } }}>
                        <option value="">{t('board.notAssigned')}</option>
                        {task.responsible && !members.some((member) => member.name === task.responsible) && <option value={task.responsible}>{task.responsible}</option>}
                        {members.map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}
                    </select>
                </span>
            </div>

        </article>
    );
}, (before, after) => before.item === after.item && before.overlay === after.overlay
    && before.drag?.isDragging === after.drag?.isDragging
    && before.drag?.setNodeRef === after.drag?.setNodeRef
    && before.drag?.attributes === after.drag?.attributes
    && before.drag?.listeners === after.drag?.listeners
    && sameTaskCardState(before.state, after.state, after.item));
