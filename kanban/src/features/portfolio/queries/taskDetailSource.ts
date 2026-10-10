import type { BoardRecord } from '@/features/portfolio/types';
import type { DetailContext } from '@/features/portfolio/state/slices';
import type { TaskDetailSource } from '@/features/portfolio/commands/taskViewModels';
import { reconstructBoardStateFromTimeline } from '@/domain/timeline';
import { cloneSerializable } from '@/domain/serializable';
import { replayTaskContinuity } from '@/domain/taskContinuity';
import type { TaskLifecycle } from '@/domain/taskContinuity';
import { matchesHistoryTask } from '@/domain/taskHistoryValues';

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
        let openedLifecycle: TaskLifecycle | null = null;
        let currentLifecycle: TaskLifecycle | null = null;
        for (const frame of replayTaskContinuity(events, context.taskId)) {
            if (frame.index === openedIndex) openedLifecycle = frame.lifecycle;
            // An imported task can be opened before the first mutation creates
            // the project's baseline. That baseline captures the opened task;
            // a later creation with the same ID does not.
            if (openedIndex === -1 && frame.index === 0 && frame.event?.kind === 'board.baseline'
                && frame.task && context.task && matchesHistoryTask(frame.task, { ...context.task })) {
                openedLifecycle = frame.lifecycle;
            }
            currentLifecycle = frame.lifecycle;
        }
        if (events.length && (!openedLifecycle || currentLifecycle !== openedLifecycle)) return null;
    }
    const boardData = eventIndex === null
        ? cloneSerializable(boardRecord.data)
        : reconstructBoardStateFromTimeline(cloneSerializable(boardRecord.data), eventIndex);
    const taskIndex = boardData.board.tasks.findIndex((task) => Number(task.id) === context.taskId);
    const task = boardData.board.tasks[taskIndex];
    if (!task || (context.task && task.createdAt !== context.task.createdAt)) return null;
    return { source: { boardRecord, boardData, task, taskIndex }, eventIndex };
}
