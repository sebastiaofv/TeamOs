import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import type { useDraggable } from '@dnd-kit/core';
import type { PortfolioRow } from '@/features/portfolio/types';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import type { AppState } from '@/features/portfolio/state/store';
import { createPortfolioProjectColor } from '@/domain/board';
import { formatDueDateForUi } from '@/domain/calendar';
import {
    normalizeEffort,
    normalizePriority,
    normalizeTags,
    taskAssignees,
    isTaskOverdue,
    formatTaskStatusAge,
    normalizeTaskStatus
} from '@/domain/task';
import { formatTaskScore } from '@/domain/scoring';
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
    const actions = usePortfolioActions();
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
    const priority = normalizePriority(task.priority);
    const effort = normalizeEffort(task.effort);
    const score = formatTaskScore(task);
    const searchTerm = state.portfolioFilters?.search || '';
    const projectLabel = item.boardTitle || item.boardFileName || t('common.project');
    const showProjectBadge = !state.selectedPortfolioBoardId;
    const color = getBoardColor(state, item.boardId);
    const showBulkSelect = Boolean(state.selectedPortfolioBoardId)
        && state.selectedPortfolioBoardId === item.boardId
        && canMutate;
    const bulkSelected = selectedBulkTaskIds(state, item.boardId).has(Number(task.id));
    const assignees = taskAssignees(task);
    const statusAge = formatTaskStatusAge(task);
    const localizedStatusAge = statusAge ? t('task.age', { value: statusAge.replace(/^Age\s*/, '') }) : '';
    const readOnlyTitle = item.historical ? t('task.readOnlyHistorical') : t('task.readOnlyNoHandle');
    const archiveButtonTitle = task.archived ? t('common.restore') : t('common.archive');
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
        if ((event.target as Element).closest('button, input, label')) return;
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
            data-status={normalizeTaskStatus(task.status)}
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
                                onChange={(event) => actions.togglePortfolioTaskBulkSelection(item.boardId, taskId, event.target.checked)}
                            />
                            <span className="portfolio-task-card-select-label">{t('task.select', { title: task.title || `Task ${task.id}` })}</span>
                        </label>
                    )}
                    <span className="task-title" id={`portfolio-task-title-${item.boardId}-${taskId}`}>
                        <HighlightedTitle text={task.title || ''} searchTerm={searchTerm} />
                    </span>
                </div>
                <div className="task-actions">
                    <button className="task-action-btn" type="button" disabled={!canMutate} title={canMutate ? t('task.editAction') : readOnlyTitle} aria-label={canMutate ? t('task.editAction') : readOnlyTitle} data-action="edit-task" onClick={() => actions.editPortfolioTask(item.boardId, taskId)}>&#9998;</button>
                    <button className="task-action-btn" type="button" disabled={!canMutate} title={canMutate ? archiveButtonTitle : readOnlyTitle} aria-label={canMutate ? archiveButtonTitle : readOnlyTitle} data-action="archive-task" onClick={() => actions.togglePortfolioArchiveTask(item.boardId, taskId)}><span aria-hidden="true">{task.archived ? '↶' : '🗄️'}</span></button>
                    <button className="task-action-btn task-action-danger" type="button" disabled={!canMutate} title={canMutate ? t('task.deleteAction') : readOnlyTitle} aria-label={canMutate ? t('task.deleteAction') : readOnlyTitle} data-action="delete-task" onClick={() => actions.deletePortfolioTask(item.boardId, taskId)}><span aria-hidden="true">🗑️</span></button>
                </div>
            </div>
            {(showProjectBadge || assignees.length > 0 || normalizeTags(task.tags).length > 0 || task.blocked || statusAge || isTaskOverdue(task) || priority || effort || score !== '-' || task.dueDate || task.checklist?.length) && (
                <div className="task-meta">
                    {showProjectBadge && <span className="portfolio-project-badge" style={{ background: color.bg, borderColor: color.border, color: color.text }} title={projectLabel}>{projectLabel}</span>}
                    {task.responsible && <span className="task-tag task-tag-assignee" title={t('task.responsible')}>{t('task.responsible')}: {task.responsible}</span>}
                    {assignees.map((name) => <span className="task-tag task-tag-assignee" title={t('toolbar.participant').replace(/:$/, '')} key={`assignee-${name}`}>{name}</span>)}
                    {normalizeTags(task.tags).map((tag) => <span className="task-tag task-tag-label" key={`tag-${tag}`}>{tag}</span>)}
                    {task.blocked && <span className="task-tag task-tag-blocked" title={t('task.blocked')}>{t('task.blocked')}</span>}
                    {localizedStatusAge && <span className="task-tag task-tag-age" title={t('task.timeInStatus')}>{localizedStatusAge}</span>}
                    {isTaskOverdue(task) && <span className="task-tag" title={t('task.overdue')}><span className="due-dot" />{t('task.overdue')}</span>}
                    {priority && <span className="task-tag"><span className={`priority-dot priority-${task.priority}`} />{priority === 'high' ? t('toolbar.high') : priority === 'medium' ? t('toolbar.medium') : priority === 'low' ? t('toolbar.low') : priority}</span>}
                    {effort && <span className="task-tag" title={t('task.effort')}><span className={`effort-dot effort-${effort.toLowerCase()}`} />{effort}</span>}
                    {score !== '-' && <span className="task-tag task-tag-score" title={t('task.scoreTitle')}>{t('task.score', { score })}</span>}
                    {task.dueDate && <span className="task-tag">{formatDueDateForUi(task.dueDate)}</span>}
                    {task.checklist?.length > 0 && <span className="task-tag">{t('task.doneCount', { done: task.checklist.filter((entry) => entry.done).length, total: task.checklist.length })}</span>}
                </div>
            )}
        </article>
    );
}
