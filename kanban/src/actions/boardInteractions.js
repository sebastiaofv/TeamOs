// Card selection and drag-and-drop state; React owns the visual classes.

import { normalizeTaskStatus } from '../domain/task.js';

import { getPortfolioBulkTaskIds } from '../selectors/portfolioViews.js';

export function createBoardInteractions({ getState, commitState, isPortfolioBoardMutable }, movePortfolioTaskToStatus) {
    function setBulkSelection(boardId, taskIds) {
        const next = { ...(getState().portfolioBulkSelectionByBoardId || {}) };
        if (taskIds.length > 0) {
            next[boardId] = taskIds;
        } else {
            delete next[boardId];
        }
        commitState({ portfolioBulkSelectionByBoardId: next });
    }

    function clearPortfolioBulkSelection(boardId = '') {
        if (boardId) {
            setBulkSelection(boardId, []);
        } else {
            commitState({ portfolioBulkSelectionByBoardId: {} });
        }
    }

    function togglePortfolioTaskBulkSelection(boardId, taskId, checked) {
        const normalizedBoardId = String(boardId || '');
        if (!normalizedBoardId) return;
        const selection = getState().portfolioBulkSelectionByBoardId?.[normalizedBoardId] || [];
        const ids = new Set(selection.map((value) => Number(value)));
        if (checked) {
            ids.add(Number(taskId));
        } else {
            ids.delete(Number(taskId));
        }
        setBulkSelection(normalizedBoardId, [...ids]);
    }

    function getSelectedPortfolioBulkTaskIds(boardId) {
        return getPortfolioBulkTaskIds(getState(), boardId);
    }

    function setSelectedPortfolioBoardId(boardId, options = {}) {
        const state = getState();
        const nextBoardId = boardId || '';
        if (nextBoardId !== state.selectedPortfolioBoardId) {
            clearPortfolioBulkSelection();
        }
        commitState({
            selectedPortfolioBoardId: nextBoardId,
            ...(options.resetViewModeWhenEmpty !== false && !nextBoardId
                ? { selectedPortfolioViewMode: 'board' }
                : {})
        });
    }

    function setSelectedPortfolioCard(boardId, taskId) {
        commitState({
            selectedPortfolioCardRef: boardId && taskId !== null && taskId !== undefined
                ? { boardId, taskId: Number(taskId) }
                : null
        });
    }

    function setHoveredPortfolioCard(boardId, taskId) {
        commitState({
            hoveredPortfolioCardRef: boardId && taskId !== null && taskId !== undefined
                ? { boardId, taskId: Number(taskId) }
                : null
        });
    }

    function setPortfolioDragContext(context) {
        commitState({ portfolioDragContext: context || null });
    }

    function clearPortfolioColumnDragHighlights() {
        if (getState().portfolioDragOverStatus) commitState({ portfolioDragOverStatus: '' });
    }

    function readPortfolioDragContextFromEvent(event) {
        const current = getState().portfolioDragContext;
        if (current?.boardId && current?.taskId) return current;
        const raw = event?.dataTransfer?.getData?.('application/x-kanban-task')
            || event?.dataTransfer?.getData?.('text/plain');
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            return parsed?.boardId && parsed?.taskId ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function canDragPortfolioContext(context) {
        return Boolean(context?.boardId && context?.taskId) && isPortfolioBoardMutable(context.boardId);
    }

    function onPortfolioTaskDragStart(event, context) {
        if (!canDragPortfolioContext(context)) {
            event?.preventDefault?.();
            return;
        }
        setPortfolioDragContext({
            boardId: context.boardId,
            taskId: Number(context.taskId),
            fromStatus: normalizeTaskStatus(context.status)
        });
        const payload = JSON.stringify(getState().portfolioDragContext);
        if (event?.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            try {
                event.dataTransfer.setData('application/x-kanban-task', payload);
            } catch (_) { }
            try {
                event.dataTransfer.setData('text/plain', payload);
            } catch (_) { }
        }
    }

    function onPortfolioTaskDragEnd(event) {
        setPortfolioDragContext(null);
        commitState({ suppressPortfolioCardClickUntil: Date.now() + 120 });
        clearPortfolioColumnDragHighlights();
    }

    function onPortfolioColumnDragOver(event, targetStatus) {
        const context = readPortfolioDragContextFromEvent(event);
        if (!canDragPortfolioContext(context)) return;
        const nextStatus = normalizeTaskStatus(targetStatus);
        if (normalizeTaskStatus(context.fromStatus) === nextStatus) return;
        event?.preventDefault?.();
        if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (getState().portfolioDragOverStatus !== nextStatus) commitState({ portfolioDragOverStatus: nextStatus });
    }

    function onPortfolioColumnDragLeave(event) {
        const current = event?.currentTarget;
        if (!current) return;
        const related = event.relatedTarget;
        if (related && current.contains(related)) return;
        clearPortfolioColumnDragHighlights();
    }

    async function onPortfolioColumnDrop(event, targetStatus) {
        event?.preventDefault?.();
        clearPortfolioColumnDragHighlights();
        const context = readPortfolioDragContextFromEvent(event);
        if (!canDragPortfolioContext(context)) {
            clearPortfolioColumnDragHighlights();
            return;
        }
        try {
            await movePortfolioTaskToStatus(context.boardId, Number(context.taskId), targetStatus);
        } finally {
            setPortfolioDragContext(null);
            clearPortfolioColumnDragHighlights();
        }
    }
    return {
        clearPortfolioBulkSelection,
        getSelectedPortfolioBulkTaskIds,
        setSelectedPortfolioBoardId,
        setSelectedPortfolioCard,
        setHoveredPortfolioCard,
        togglePortfolioTaskBulkSelection,
        onPortfolioTaskDragStart,
        onPortfolioTaskDragEnd,
        onPortfolioColumnDragOver,
        onPortfolioColumnDragLeave,
        onPortfolioColumnDrop,
    };
}
