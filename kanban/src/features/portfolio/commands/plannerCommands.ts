// Day planner edits. Blocks are written to the project that owns the task;
// the task itself and the timeline are never changed.

import type { DayPlanBlock } from '@/domain/types';
import type { BoardMutationContext } from './mutationContext';
import type { TaskActions } from './taskCommands';
import {
    createDayPlanBlockId,
    createPlannerBlockTimes,
    getDayPlannerBlocks,
    normalizeDayPlannerBlock,
    setDayPlannerBlocks,
    type PlannerBlockTimes
} from '@/domain/dayPlanner';
import { parseRoadmapIsoDate } from '@/domain/roadmap';
import { translateCurrent } from '@/shared/i18n';

export function createPlannerActions(
    { getBoardRecord, runPortfolioBoardMutation }: BoardMutationContext,
    { showUndo }: Pick<TaskActions, 'showUndo'>
) {
    const findBlock = (boardId: string, blockId: string): DayPlanBlock | null => (
        getDayPlannerBlocks(getBoardRecord(boardId)?.data).find((block) => block.id === blockId) || null
    );

    // `update` returns the next block list, or null to leave the board untouched.
    function writeBlocks(boardId: string, update: (blocks: DayPlanBlock[]) => DayPlanBlock[] | null): Promise<boolean> {
        return runPortfolioBoardMutation(boardId, (data) => {
            const next = update(getDayPlannerBlocks(data));
            if (!next) return false;
            setDayPlannerBlocks(data, next);
            return true;
        });
    }

    const putBlock = (boardId: string, block: DayPlanBlock) => writeBlocks(boardId, (blocks) => (
        [...blocks.filter((entry) => entry.id !== block.id), block]
    ));
    const dropBlock = (boardId: string, blockId: string) => writeBlocks(boardId, (blocks) => (
        blocks.some((entry) => entry.id === blockId) ? blocks.filter((entry) => entry.id !== blockId) : null
    ));

    async function addPlannerBlock(boardId: string, taskId: number, date: string, startMinutes: number): Promise<boolean> {
        const record = getBoardRecord(boardId);
        if (!record || !parseRoadmapIsoDate(date)) return false;
        if (!record.data.board.tasks.some((task) => Number(task.id) === Number(taskId))) return false;
        const block: DayPlanBlock = { id: createDayPlanBlockId(), taskId: Number(taskId), date, ...createPlannerBlockTimes(startMinutes) };
        const added = await putBlock(boardId, block);
        if (added) showUndo(translateCurrent('planner.blockAdded'), () => dropBlock(boardId, block.id));
        return added;
    }

    async function updatePlannerBlock(boardId: string, blockId: string, times: PlannerBlockTimes): Promise<boolean> {
        const previous = findBlock(boardId, blockId);
        const next = previous ? normalizeDayPlannerBlock({ ...previous, ...times }) : null;
        if (!previous || !next) return false;
        if (next.date === previous.date && next.start === previous.start && next.end === previous.end) return false;
        const updated = await putBlock(boardId, next);
        if (updated) showUndo(translateCurrent('planner.blockUpdated'), () => putBlock(boardId, previous));
        return updated;
    }

    async function removePlannerBlock(boardId: string, blockId: string): Promise<boolean> {
        const previous = findBlock(boardId, blockId);
        if (!previous) return false;
        const removed = await dropBlock(boardId, blockId);
        if (removed) showUndo(translateCurrent('planner.blockRemoved'), () => putBlock(boardId, previous));
        return removed;
    }

    return { addPlannerBlock, updatePlannerBlock, removePlannerBlock };
}
