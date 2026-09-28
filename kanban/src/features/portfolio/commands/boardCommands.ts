// Card selection, bulk selection and card drop outcomes. The board component
// owns the drag gesture itself (dnd-kit) and the visual classes.

import type { BoardMutationContext } from './mutationContext';
import { getPortfolioBulkTaskIds } from '@/features/portfolio/queries';

type MoveTaskToStatus = (boardId: string, taskId: number, targetStatus: unknown) => Promise<boolean>;

export function createBoardInteractions(
    { getState, commitState, isPortfolioBoardMutable }: Pick<BoardMutationContext, 'getState' | 'commitState' | 'isPortfolioBoardMutable'>,
    movePortfolioTaskToStatus: MoveTaskToStatus
) {
    function setBulkSelection(boardId: string, taskIds: number[]) {
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

    function togglePortfolioTaskBulkSelection(boardId: string, taskId: unknown, checked: boolean) {
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

    function getSelectedPortfolioBulkTaskIds(boardId: string): number[] {
        return getPortfolioBulkTaskIds(getState(), boardId);
    }

    function setSelectedPortfolioBoardId(boardId: string | null | undefined, options: { resetViewModeWhenEmpty?: boolean } = {}) {
        const state = getState();
        const nextBoardId = boardId || '';
        if (nextBoardId !== state.selectedPortfolioBoardId) {
            clearPortfolioBulkSelection();
        }
        commitState({
            selectedPortfolioBoardId: nextBoardId,
            ...(options.resetViewModeWhenEmpty !== false
                && !nextBoardId
                && state.selectedPortfolioViewMode !== 'calendar'
                && state.selectedPortfolioViewMode !== 'planner'
                ? { selectedPortfolioViewMode: 'board' as const }
                : {})
        });
    }

    function setSelectedPortfolioCard(boardId: string | null, taskId: unknown) {
        commitState({
            selectedPortfolioCardRef: boardId && taskId !== null && taskId !== undefined
                ? { boardId, taskId: Number(taskId) }
                : null
        });
    }

    function setHoveredPortfolioCard(boardId: string | null, taskId: unknown) {
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

    function dropPortfolioTaskOnColumn(boardId: string, taskId: unknown, targetStatus: unknown): Promise<boolean> | false {
        if (!boardId || taskId === null || taskId === undefined || !isPortfolioBoardMutable(boardId)) return false;
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

export type BoardInteractions = ReturnType<typeof createBoardInteractions>;