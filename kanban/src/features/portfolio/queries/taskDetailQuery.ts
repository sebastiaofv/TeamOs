import type { BoardRecord, ProjectSaveState, TaskDetailViewModel } from '@/features/portfolio/types';
import type { DetailContext } from '@/features/portfolio/state/slices';
import type { Language } from '@/shared/types/ui';
import type { TaskHistory } from '@/domain/taskHistoryTypes';
import { deriveTaskHistory } from '@/domain/taskHistory';
import { resolveTaskDetailSource } from './taskDetailSource';
import { buildTaskDetailViewModel } from '@/features/portfolio/commands/taskViewModels';

/** Compose the selected task's read model without changing project or selection. */
export function buildTaskDetailQuery(
    boardRecord: BoardRecord | null,
    context: DetailContext | null,
    initialVm: TaskDetailViewModel | null,
    language: Language,
    saveState?: ProjectSaveState
): { vm: TaskDetailViewModel | null; history: TaskHistory; sourceUnavailable: boolean; saveState?: ProjectSaveState } {
    const detail = resolveTaskDetailSource(boardRecord, context);
    const event = context?.eventId
        ? boardRecord?.data.extensions.timeline?.events.find((entry) => entry.id === context.eventId)
        : null;
    return {
        vm: detail && context
            ? buildTaskDetailViewModel(detail.source, context.taskId, context.readOnly, language)
            : initialVm ? { ...initialVm, readOnly: true } : null,
        history: detail && boardRecord
            ? deriveTaskHistory(boardRecord.data, detail.source.task, { eventIndex: detail.eventIndex })
            : { entries: [], earlierHistoryUnavailable: true, incomplete: true, asOf: event ? { eventId: event.id, at: event.at } : null },
        sourceUnavailable: !detail,
        saveState
    };
}
