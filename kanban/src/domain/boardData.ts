import type { LooseBoardData, Task } from './types';

export function findTaskInBoardData(boardData: LooseBoardData | null | undefined, taskId: unknown): Task | null {
    if (taskId === null || taskId === undefined || taskId === '') return null;
    const taskIdNum = Number(taskId);
    const taskList = boardData?.board?.tasks;
    if (!Array.isArray(taskList)) return null;
    return taskList.find((task) => task && Number(task.id) === taskIdNum) || null;
}
