import { workitemLabel } from '@/domain/taskIdentity';
import { WorkitemTypeBadge } from '@/features/portfolio/task/WorkitemTypeBadge';
import { workitemType, workitemProgress } from '@/domain/workitems';
import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import type { useDraggable } from '@dnd-kit/core';
import type { PortfolioRow } from '@/features/portfolio/types';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import type { AppState } from '@/features/portfolio/state/store';
import { createPortfolioProjectColor } from '@/domain/board';
import { formatDueDateForUi, normalizeDueDate } from '@/domain/calendar';
import { parseRoadmapIsoDate } from '@/domain/roadmap';
import { statusCategory } from '@/domain/workflow';
import { useLocalToday } from '@/shared/hooks/useLocalToday';
import { normalizePriority } from '@/domain/task';
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
    const { t, language } = useI18n();
    const today = useLocalToday();
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
    const searchTerm = state.portfolioFilters?.search || '';
    const projectLabel = item.boardTitle || item.boardFileName || t('common.project');
    const showProjectBadge = !state.selectedPortfolioBoardId;
    const color = getBoardColor(state, item.boardId);
    const showBulkSelect = Boolean(state.selectedPortfolioBoardId)
        && state.selectedPortfolioBoardId === item.boardId
        && canMutate;
    const bulkSelected = selectedBulkTaskIds(state, item.boardId).has(Number(task.id));
    const readOnlyTitle = item.historical ? t('task.readOnlyHistorical') : t('task.readOnlyNoHandle');
    const archiveButtonTitle = task.archived ? t('common.restore') : t('common.archive');
    const boardData = item.boardData || state.portfolioBoards.find((b) => b.id === item.boardId)?.data;
    const type = workitemType(task);
    const progress = boardData && type === 'story' ? workitemProgress(boardData, task.id) : null;
    const terminal = ['completed', 'cancelled'].includes(statusCategory(task.status, boardData, task));
    const highPriority = priority === 'high' && !terminal && !task.archived;
    const dueDate = normalizeDueDate(task.dueDate);
    const due = parseRoadmapIsoDate(dueDate);
    const daysUntilDue = due ? (due.getTime() - parseRoadmapIsoDate(today)!.getTime()) / 86_400_000 : null;
    const showDue = daysUntilDue !== null && daysUntilDue <= 3 && !terminal && !task.archived;
    const dueLabel = daysUntilDue !== null && daysUntilDue < 0 ? t('task.overdue')
        : daysUntilDue === 0 ? t('common.today')
        : daysUntilDue === 1 ? t('card.tomorrow')
        : due ? new Intl.DateTimeFormat(language === 'pt' ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(due) : '';
    const initials = task.responsible?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase();
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
            </div>
            <div className="workitem-card-context">
                <span className="task-card-id">{workitemLabel(task)}</span>
                <span className="task-card-context-dot" aria-hidden="true">·</span>
                <WorkitemTypeBadge type={type} />
                <div className="task-actions">
                    <button className="task-action-btn" type="button" disabled={!canMutate} title={canMutate ? t('task.editAction') : readOnlyTitle} aria-label={canMutate ? t('task.editAction') : readOnlyTitle} data-action="edit-task" onClick={() => actions.editPortfolioTask(item.boardId, taskId)}>
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 2 4 4-8 8H2v-4Zm-2 2 4 4" /></svg>
                    </button>
                    <button className="task-action-btn" type="button" disabled={!canMutate} title={canMutate ? archiveButtonTitle : readOnlyTitle} aria-label={canMutate ? archiveButtonTitle : readOnlyTitle} data-action="archive-task" onClick={() => actions.togglePortfolioArchiveTask(item.boardId, taskId)}>
                        <svg viewBox="0 0 16 16" aria-hidden="true">{task.archived
                            ? <path d="M3 6h6a4 4 0 0 1 0 8M6 3 3 6l3 3" />
                            : <><path d="M2.5 6v7.5h11V6M1.5 2.5h13V6h-13Z" /><path d="M6 9h4" /></>}</svg>
                    </button>
                    <button className="task-action-btn task-action-danger" type="button" disabled={!canMutate} title={canMutate ? t('task.deleteAction') : readOnlyTitle} aria-label={canMutate ? t('task.deleteAction') : readOnlyTitle} data-action="delete-task" onClick={() => actions.deletePortfolioTask(item.boardId, taskId)}>
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5h12M6 2.5h4M4 4.5l.5 9h7l.5-9M6.5 7v4M9.5 7v4" /></svg>
                    </button>
                </div>
            </div>
            {showProjectBadge && <span className="task-card-project" title={projectLabel}>
                <span className="task-card-project-dot" style={{ background: color.text }} aria-hidden="true" />{projectLabel}
            </span>}
            {progress && progress.percent !== null && <div className="task-card-progress">
                <span>{t('card.taskProgress', { percent: Math.round(progress.percent) })}</span>
                <span className="task-card-progress-track" role="progressbar" aria-label={t('workitems.executionProgress')}
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent)}
                    title={`${progress.completed}/${progress.eligible}`}>
                    <span style={{ width: `${progress.percent}%` }} />
                </span>
            </div>}
            {task.blocked && <div className="task-card-blocker task-tag-blocked" title={task.blockerReason || t('task.blocked')}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="m4 4 8 8" /></svg>
                {t('task.blocked')}
            </div>}
            {(task.responsible || highPriority || showDue) && <div className="task-card-footer">
                {task.responsible && <span className="task-card-owner" title={`${t('task.responsible')}: ${task.responsible}`}>
                    <span className="task-card-avatar" aria-hidden="true">{initials}</span>
                    <span className="task-card-owner-name">{task.responsible}</span>
                </span>}
                {(highPriority || showDue) && <div className="task-card-urgency">
                    {highPriority && <span className="task-card-priority"><span className="priority-dot priority-high" aria-hidden="true" />{t('toolbar.high')}</span>}
                    {showDue && <time className={`task-card-due${daysUntilDue! < 0 ? ' is-overdue' : ''}`} dateTime={dueDate}
                        title={`${t('task.due')}: ${formatDueDateForUi(dueDate)}`}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1" /><path d="M5 1.5v4m6-4v4m-8.5 2h11" /></svg>
                        {dueLabel}
                    </time>}
                </div>}
            </div>}

        </article>
    );
}
