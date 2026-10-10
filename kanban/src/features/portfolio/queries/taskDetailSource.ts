import type { BoardRecord } from '@/features/portfolio/types';
import type { DetailContext } from '@/features/portfolio/state/slices';
import type { TaskDetailSource } from '@/features/portfolio/commands/taskViewModels';
import { reconstructBoardStateFromTimeline } from '@/domain/timeline';
import { cloneSerializable } from '@/domain/serializable';

// Full project data owns the timeline; reconstructed snapshots only own the
// fields shown at the selected moment. Read helpers that normalize are isolated
// on a copy so this query never writes to the loaded project.
export function resolveTaskDetailSource(boardRecord: BoardRecord | null, context: DetailContext | null): {
    source: TaskDetailSource;
    eventIndex: number | null;
} | null {
    if (!boardRecord || !context || boardRecord.id !== context.boardId) return null;
    const events = boardRecord.data.extensions.timeline?.events || [];
    const eventIndex = context.eventId ? events.findIndex((event) => event.id === context.eventId) : null;
    if (eventIndex === -1) return null;
    const openedIndex = context.openedAtEventId
        ? events.findIndex((event) => event.id === context.openedAtEventId)
        : -1;
    if (!context.eventId && context.openedAtEventId && openedIndex < 0) return null;
    if (!context.eventId) {
        const reusedIndex = events.findLastIndex((event, index) => index > openedIndex
            && event.kind === 'task.created' && Number(event.entityId) === context.taskId);
        if (reusedIndex >= 0) {
            const restore = events.findLast((event, index) => index > reusedIndex && event.kind === 'board.restored');
            const restoredFrom = restore?.meta?.fromEventId;
            const sourceIndex = restoredFrom ? events.findIndex((event) => event.id === restoredFrom) : -1;
            const firstReusedIndex = events.findIndex((event, index) => index > openedIndex
                && event.kind === 'task.created' && Number(event.entityId) === context.taskId);
            // A proven restoration of the opened lifecycle can recover it after
            // id reuse; an arbitrary snapshot with matching dates cannot.
            if (sourceIndex < 0 || sourceIndex >= firstReusedIndex) return null;
        }
    }
    const boardData = eventIndex === null
        ? cloneSerializable(boardRecord.data)
        : reconstructBoardStateFromTimeline(cloneSerializable(boardRecord.data), eventIndex);
    const taskIndex = boardData.board.tasks.findIndex((task) => Number(task.id) === context.taskId);
    const task = boardData.board.tasks[taskIndex];
    if (!task || (context.task && task.createdAt !== context.task.createdAt)) return null;
    return { source: { boardRecord, boardData, task, taskIndex }, eventIndex };
}
