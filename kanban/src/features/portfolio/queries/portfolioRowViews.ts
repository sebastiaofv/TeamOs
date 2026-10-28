import type { BoardRecord, PortfolioRow } from '@/features/portfolio/types';
import type { AppState } from '@/features/portfolio/state/slices';
import { normalizeTask } from '@/domain/task';
import { createBoardStateSnapshot } from '@/domain/serialize';
import { getWorkflow } from '@/domain/workflow';
import { getDependencyBlockedTaskIds } from '@/domain/taskRelations';

// Selectors accept any slice of the store: components pass the fields they
// subscribe to.
export type SelectorState = Partial<AppState> | null | undefined;

export function getBoardRecord(state: SelectorState, boardId: string | null | undefined): BoardRecord | null {
    return (Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : [])
        .find((board) => board?.id === boardId) || null;
}

export function buildPortfolioTasks(state: SelectorState): PortfolioRow[] {
    return (Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : []).flatMap((board, boardIndex) => {
        if (!board?.data?.board) return [];
        const dependencyBlocked = getDependencyBlockedTaskIds(board.data);
        return (board.data.board.tasks || []).map((task, taskIndex) => ({
            boardIndex,
            boardId: board.id,
            taskId: task.id,
            taskIndex,
            boardTitle: board.title,
            boardFileName: board.fileName,
            columnTitle: getWorkflow(board.data, task).states.find((state) => state.id === task.status)?.name || task.status,
            canMutate: Boolean(board.handle),
            boardData: board.data,
            task: { ...normalizeTask(task, { workflow: getWorkflow(board.data, task) }), blocked: Boolean(task.blocked) || dependencyBlocked.has(task.id) }
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
    const canMutate = Boolean(boardRecord.handle) && options.canMutate !== false;
    const historical = Boolean(options.historical);
    const dependencyBlocked = getDependencyBlockedTaskIds(normalizedBoard);
    return (normalizedBoard.board.tasks || []).map((task, taskIndex) => ({
        boardIndex: (state?.portfolioBoards || []).findIndex((board) => board.id === boardRecord.id),
        boardId: boardRecord.id,
        taskId: task.id,
        taskIndex,
        boardTitle: boardRecord.title,
        boardFileName: boardRecord.fileName,
        columnTitle: getWorkflow(normalizedBoard, task).states.find((state) => state.id === task.status)?.name || task.status,
        canMutate,
        historical,
        boardData: normalizedBoard,
        task: { ...normalizeTask(task, { workflow: getWorkflow(normalizedBoard, task) }), blocked: Boolean(task.blocked) || dependencyBlocked.has(task.id) }
    }));
}
