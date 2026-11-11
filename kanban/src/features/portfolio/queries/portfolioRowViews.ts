import { permanentBlockedIds } from '@/domain/permanentRelations';
import type { BoardRecord, PortfolioRow } from '@/features/portfolio/types';
import type { AppState } from '@/features/portfolio/state/slices';
import { normalizeTask } from '@/domain/task';
import { createBoardStateSnapshot } from '@/domain/serialize';
import { getWorkflow, withWorkflowReadCache } from '@/domain/workflow';
import { getDependencyBlockedTaskIds } from '@/domain/taskRelations';

// Selectors accept any slice of the store: components pass the fields they
// subscribe to.
export type SelectorState = Partial<AppState> | null | undefined;

export function getBoardRecord(state: SelectorState, boardId: string | null | undefined): BoardRecord | null {
    return (Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : [])
        .find((board) => board?.id === boardId) || null;
}

export function buildPortfolioTasks(state: SelectorState, previousRows: readonly PortfolioRow[] = []): PortfolioRow[] {
    return withWorkflowReadCache(() => {
        const previous = new Map(previousRows.map((row) => [`${row.boardId}:${row.taskId}`, row]));
        return (Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : []).flatMap((board, boardIndex) => {
            if (!board?.data?.board) return [];
            const dependencyBlocked = new Set([...getDependencyBlockedTaskIds(board.data), ...permanentBlockedIds(board.data, state?.portfolioBoards || [], state?.unloadedRelationSources?.flatMap((entry) => entry.relations))]);
            return (board.data.board.tasks || []).map((task, taskIndex) => {
                const old = previous.get(`${board.id}:${task.id}`);
                const blocked = Boolean(task.blocked) || dependencyBlocked.has(task.id);
                if (old && old.boardData === board.data && old.boardIndex === boardIndex && old.taskIndex === taskIndex
                    && old.boardTitle === board.title && old.boardFileName === board.fileName && old.canMutate === Boolean(board.handle)
                    && old.task.blocked === blocked && old.manuallyBlocked === Boolean(task.blocked) && old.dependencyBlocked === dependencyBlocked.has(task.id)) return old;
                return {
                    boardIndex,
                    boardId: board.id,
                    taskId: task.id,
                    taskIndex,
                    boardTitle: board.title,
                    boardFileName: board.fileName,
                    columnTitle: getWorkflow(board.data, task).states.find((state) => state.id === task.status)?.name || task.status,
                    canMutate: Boolean(board.handle),
                    boardData: board.data,
                    manuallyBlocked: Boolean(task.blocked), dependencyBlocked: dependencyBlocked.has(task.id),
                    task: { ...normalizeTask(task, { workflow: getWorkflow(board.data, task) }), blocked }
                };
            });
        });
    });
}

export function buildPortfolioRowsFromBoardData(
    state: SelectorState,
    boardRecord: BoardRecord | null | undefined,
    boardData: unknown,
    options: { canMutate?: boolean; historical?: boolean } = {}
): PortfolioRow[] {
    return withWorkflowReadCache(() => {
        if (!boardRecord || !boardData) return [];
        const normalizedBoard = createBoardStateSnapshot(boardData);
        const canMutate = Boolean(boardRecord.handle) && options.canMutate !== false;
        const historical = Boolean(options.historical);
        const dependencyBlocked = new Set([...getDependencyBlockedTaskIds(normalizedBoard), ...permanentBlockedIds(normalizedBoard, options.historical ? [{ ...boardRecord, data: normalizedBoard }] : state?.portfolioBoards || [], options.historical ? [] : state?.unloadedRelationSources?.flatMap((entry) => entry.relations))]);
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
            manuallyBlocked: Boolean(task.blocked), dependencyBlocked: dependencyBlocked.has(task.id),
            boardData: normalizedBoard,
            task: { ...normalizeTask(task, { workflow: getWorkflow(normalizedBoard, task) }), blocked: Boolean(task.blocked) || dependencyBlocked.has(task.id) }
        }));
    });
}
