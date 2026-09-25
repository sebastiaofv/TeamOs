// Day planner edits. Blocks are written to the project that owns the task and
// each change is recorded as a small timeline event (the block before and
// after, no board snapshot). The task itself is never changed.

import type { DayPlanBlock } from '@/domain/types';
import type { BoardMutationContext } from './mutationContext';
import type { TaskActions } from './taskCommands';
import {
    applyPlannerBlockChange,
    createDayPlanBlockId,
    createPlannerBlockTimes,
    getDayPlannerBlocks,
    getPlannerChangeKind,
    normalizeDayPlannerBlock,
    type PlannerBlockTimes,
    type PlannerEventKind
} from '@/domain/dayPlanner';
import { parseRoadmapIsoDate } from '@/domain/roadmap';
import { appendTimelineEvent } from '@/domain/timeline';
import { formatPlannerDateLabel, translateCurrent, translateTimeline, type TranslationKey } from '@/shared/i18n';

const EVENT_SUMMARY_KEYS: Record<PlannerEventKind, TranslationKey> = {
    'planner.block.added': 'planner.eventAdded',
    'planner.block.moved': 'planner.eventMoved',
    'planner.block.resized': 'planner.eventResized',
    'planner.block.removed': 'planner.eventRemoved'
};

export function createPlannerActions(
    { getBoardRecord, runPortfolioBoardMutation }: BoardMutationContext,
    { showUndo }: Pick<TaskActions, 'showUndo'>
) {
    const findBlock = (boardId: string, blockId: string): DayPlanBlock | null => (
        getDayPlannerBlocks(getBoardRecord(boardId)?.data).find((block) => block.id === blockId) || null
    );

    // Sets block `blockId` to `after` (null removes it) and records the change.
    // Leaves the board untouched when nothing would change.
    function writeBlock(boardId: string, blockId: string, after: DayPlanBlock | null): Promise<boolean> {
        return runPortfolioBoardMutation(boardId, (data) => {
            const before = getDayPlannerBlocks(data).find((block) => block.id === blockId) || null;
            const kind = getPlannerChangeKind(before, after);
            const shown = after || before;
            if (!kind || !shown) return false;
            applyPlannerBlockChange(data, before, after);
            const task = data.board.tasks.find((entry) => Number(entry.id) === shown.taskId);
            appendTimelineEvent(data, {
                kind,
                entityType: 'task',
                entityId: String(shown.taskId),
                summary: translateTimeline(EVENT_SUMMARY_KEYS[kind], {
                    title: task?.title || translateTimeline('common.task'),
                    date: formatPlannerDateLabel('en', shown.date, 'medium'),
                    start: shown.start,
                    end: shown.end
                }),
                changes: { block: { before, after } }
            });
            return true;
        });
    }

    const putBlock = (boardId: string, block: DayPlanBlock) => writeBlock(boardId, block.id, block);
    const dropBlock = (boardId: string, blockId: string) => writeBlock(boardId, blockId, null);

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
