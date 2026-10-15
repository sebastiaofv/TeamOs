import type { BoardRecord, PortfolioRow } from '@/features/portfolio/types';
import type { BoardData } from '@/domain/types';
import type { AppState } from '@/features/portfolio/state/slices';
import { normalizeTask } from '@/domain/task';
import { createBoardStateSnapshot } from '@/domain/serialize';
import { dependencyBlockedKeys, refKey, taskRef } from '@/domain/relations';

// Selectors accept any slice of the store: components pass the fields they
// subscribe to.
export type SelectorState = Partial<AppState> | null | undefined;

export function getBoardRecord(state: SelectorState, boardId: string | null | undefined): BoardRecord | null {
    return (Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : [])
        .find((board) => board?.id === boardId) || null;
}

function getBoardStatusMap(boardData: BoardData | null | undefined): Record<string, string> {
    return Object.fromEntries(
        (boardData?.board?.columns || []).map((column) => [column.status, column.title])
    );
}

export function buildPortfolioTasks(state: SelectorState): PortfolioRow[] {
    const blockedKeys = dependencyBlockedKeys((state?.portfolioBoards || []).map((board) => board.data));
    return (Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : []).flatMap((board, boardIndex) => {
        if (!board?.data?.board) return [];
        const statusMap = getBoardStatusMap(board.data);
        return (board.data.board.tasks || []).map((task, taskIndex) => ({
            boardIndex,
            boardId: board.id,
            taskId: task.id,
            taskIndex,
            boardTitle: board.title,
            boardFileName: board.fileName,
            columnTitle: statusMap[task.status] || task.status,
            dependencyBlocked: blockedKeys.has(refKey(taskRef(board.data, task.id))),
            canMutate: Boolean(board.handle),
            task: normalizeTask(task)
        }));
    });
}

export function buildPortfolioRowsFromBoardData(
    state: SelectorState,
    boardRecord: BoardRecord | null | undefined,
    boardData: unknown,
    options: { canMutate?: boolean; historical?: boolean } = {}
): PortfolioRow[] {
    if (!boardRecord || !boardData) return [];
    const normalizedBoard = createBoardStateSnapshot(boardData);
    const statusMap = getBoardStatusMap(normalizedBoard);
    const canMutate = Boolean(boardRecord.handle) && options.canMutate !== false;
    const historical = Boolean(options.historical);
    return (normalizedBoard.board.tasks || []).map((task, taskIndex) => ({
        boardIndex: (state?.portfolioBoards || []).findIndex((board) => board.id === boardRecord.id),
        boardId: boardRecord.id,
        taskId: task.id,
        taskIndex,
        boardTitle: boardRecord.title,
        boardFileName: boardRecord.fileName,
        columnTitle: statusMap[task.status] || task.status,
        canMutate,
        historical,
        task: normalizeTask(task)
    }));
}
