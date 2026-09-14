// Card selection, bulk selection and card drop outcomes. The board component
// owns the drag gesture itself (dnd-kit) and the visual classes.

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

    // The click that ends a card drag must not also open the card.
    function endPortfolioCardDrag() {
        commitState({ suppressPortfolioCardClickUntil: Date.now() + 120 });
    }

    async function dropPortfolioTaskOnColumn(boardId, taskId, targetStatus) {
        if (!boardId || !taskId || !isPortfolioBoardMutable(boardId)) return false;
        return movePortfolioTaskToStatus(boardId, Number(taskId), targetStatus);
    }

    return {
        clearPortfolioBulkSelection,
        getSelectedPortfolioBulkTaskIds,
        setSelectedPortfolioBoardId,
        setSelectedPortfolioCard,
        setHoveredPortfolioCard,
        togglePortfolioTaskBulkSelection,
        endPortfolioCardDrag,
        dropPortfolioTaskOnColumn,
    };
}
