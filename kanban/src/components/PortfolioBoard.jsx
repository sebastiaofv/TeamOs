import { createPortal } from 'react-dom';
import { useAppState } from '../bridge/appStore.js';
import {
    onPortfolioColumnDragLeave,
    onPortfolioColumnDragOver,
    onPortfolioColumnDrop,
    onPortfolioTaskDragEnd,
    onPortfolioTaskDragStart,
    togglePortfolioTaskBulkSelection
} from '../actions/legacyHost.js';
import { defaultColumns } from '../domain/constants.js';
import { createPortfolioProjectColor } from '../domain/board.js';
import { formatDueDateForUi } from '../domain/calendar.js';
import {
    normalizeEffort,
    normalizePriority,
    normalizeTags,
    taskAssignees
} from '../domain/task.js';
import { isTaskOverdue, formatTaskStatusAge, normalizeTaskStatus } from '../domain/task.js';
import { formatTaskScore } from '../domain/scoring.js';
import { escapeRegExp } from '../domain/util.js';
import { getBoardTimelineData } from '../domain/timeline.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function highlightSearchMatch(text, searchTerm) {
    const safeText = escapeHtml(text || '');
    const term = String(searchTerm || '').trim();
    if (!term) return safeText;
    const regex = new RegExp(`(${escapeRegExp(term)})`, 'ig');
    return safeText.replace(regex, '<span class="search-highlight">$1</span>');
}

function getBoardColor(state, boardId) {
    const board = state.portfolioBoards.find((record) => record.id === boardId);
    return board?.projectColor || createPortfolioProjectColor(board?.colorSeed || 0);
}

function isHistoricalPreview(state, boardId) {
    const board = state.portfolioBoards.find((record) => record.id === boardId);
    const timeline = getBoardTimelineData(board?.data);
    if (!timeline || !Array.isArray(timeline.events) || timeline.events.length === 0) return false;
    const selection = state.portfolioTimelineSelection || {};
    const selectedIndex = selection.boardId === boardId && Number.isInteger(selection.eventIndex)
        ? Math.max(0, Math.min(timeline.events.length - 1, selection.eventIndex))
        : timeline.events.length - 1;
    return selectedIndex < timeline.events.length - 1;
}

function selectedBulkTaskIds(state, boardId) {
    return new Set((state.portfolioBulkSelectionByBoardId?.[boardId] || []).map((taskId) => Number(taskId)));
}

function PortfolioTaskCard({ item, state }) {
    const task = item.task;
    const canMutate = Boolean(item.canMutate) && !item.historical;
    const canDrag = canMutate;
    const taskId = item.taskId ?? task.id;
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

    return (
        <div
            className={`task-card portfolio-task-card${selected ? ' selected' : ''}`}
            draggable={canDrag}
            data-board-id={item.boardId}
            data-task-id={String(taskId)}
            data-status={normalizeTaskStatus(task.status)}
            data-historical={item.historical ? 'true' : 'false'}
            onDragStart={canDrag ? (event) => onPortfolioTaskDragStart(event, {
                boardId: item.boardId,
                taskId: task.id,
                status: normalizeTaskStatus(task.status)
            }) : undefined}
            onDragEnd={canDrag ? onPortfolioTaskDragEnd : undefined}
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
                    <span
                        className="task-title"
                        dangerouslySetInnerHTML={{ __html: highlightSearchMatch(task.title || '', searchTerm) }}
                    />
                </div>
                <div className="task-actions">
                    <button className="task-action-btn" type="button" disabled={!canMutate} title={canMutate ? 'Edit' : readOnlyTitle} data-action="edit-task">&#9998;</button>
                    <button className="task-action-btn" type="button" disabled={!canMutate} title={canMutate ? archiveButtonTitle : readOnlyTitle} data-action="archive-task">{task.archived ? '↶' : '🗄️'}</button>
                    <button className="task-action-btn task-action-danger" type="button" disabled={!canMutate} title={canMutate ? 'Delete' : readOnlyTitle} aria-label={canMutate ? 'Delete' : readOnlyTitle} data-action="delete-task">🗑️</button>
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
                    {priority && <span className="task-tag"><span className={`priority-dot priority-${task.priority}`} />{task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span>}
                    {effort && <span className="task-tag" title="Effort"><span className={`effort-dot effort-${effort.toLowerCase()}`} />{effort}</span>}
                    {score !== '-' && <span className="task-tag task-tag-score" title="Score (Priority / Effort)">Score {score}</span>}
                    {task.dueDate && <span className="task-tag">{formatDueDateForUi(task.dueDate)}</span>}
                    {task.checklist?.length > 0 && <span className="task-tag">{task.checklist.filter((entry) => entry.done).length}/{task.checklist.length} done</span>}
                </div>
            )}
        </div>
    );
}

function PortfolioBoardView({ state }) {
    const rows = Array.isArray(state.portfolioVisibleRows) ? state.portfolioVisibleRows : [];
    const buckets = Object.fromEntries(defaultColumns.map((column) => [column.status, []]));
    rows.forEach((item) => {
        const status = normalizeTaskStatus(item.task.status);
        if (!buckets[status]) buckets[status] = [];
        buckets[status].push(item);
    });

    const selectedBoard = state.portfolioBoards.find((board) => board.id === state.selectedPortfolioBoardId);
    const canAddTasks = Boolean(state.selectedPortfolioBoardId)
        && Boolean(selectedBoard?.handle)
        && !isHistoricalPreview(state, state.selectedPortfolioBoardId);

    return (
        <>
            {defaultColumns.map((column) => {
                const items = buckets[column.status] || [];
                return (
                    <div className="portfolio-column" data-status={column.status} key={column.status}>
                        <div className="portfolio-column-header">
                            <span className="column-title">{column.title}</span>
                            <span className="column-count">{items.length}</span>
                        </div>
                        <div
                            className="portfolio-column-body"
                            id={`portfolio-${column.status}-column`}
                            data-status={column.status}
                            onDragOver={(event) => onPortfolioColumnDragOver(event, column.status)}
                            onDragLeave={onPortfolioColumnDragLeave}
                            onDrop={(event) => onPortfolioColumnDrop(event, column.status)}
                        >
                            {canAddTasks && (
                                <div className="add-task-card" data-action="add-task" data-status={column.status}>+ Add Task</div>
                            )}
                            {items.length === 0
                                ? <div className="empty-state"><span className="empty-state-text">No tasks</span></div>
                                : items.map((item) => <PortfolioTaskCard item={item} state={state} key={`${item.boardId}:${item.taskId}`} />)}
                        </div>
                    </div>
                );
            })}
        </>
    );
}

export function PortfolioBoard() {
    const state = useAppState((current) => current);
    const board = document.getElementById('portfolioBoard');
    if (!board) return null;
    return createPortal(<PortfolioBoardView state={state} />, board);
}
