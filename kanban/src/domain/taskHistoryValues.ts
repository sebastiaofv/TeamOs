import type { TaskHistoryChange, TaskHistoryValue } from './taskHistoryTypes';
import type { DayPlanBlock } from './types';
import { areSerializableValuesEqual, cloneSerializable } from './serializable';
import { formatPlannerDuration, plannerMinutes } from './dayPlanner';
import { isRecord } from './util';

export const HISTORY_FIELDS = ['title', 'description', 'assignees', 'tags', 'blocked', 'blockerReason', 'checklist', 'attachments', 'archived', 'dueDate', 'priority', 'effort', 'phaseId', 'milestoneId', 'sprintId', 'status'] as const;
export type HistoryTask = Record<string, unknown>;
export type HistoryState = {
    board?: { tasks?: HistoryTask[]; columns?: unknown[]; settings?: Record<string, unknown> };
    extensions?: Record<string, unknown>;
    [key: string]: unknown;
};

export function historyTask(state: HistoryState, id: number): HistoryTask | null {
    return state.board?.tasks?.find((task) => Number(task.id) === id) || null;
}

// Replay normalizers can drop incomplete Roadmap records. A title already
// observed is still readable evidence; newer per-event titles supersede it.
export function historyLabelState(previous: HistoryState, state: HistoryState): HistoryState {
    const roadmap: Record<string, unknown> = {};
    for (const collection of ['phases', 'milestones', 'sprints']) {
        const labels = new Map<string, Record<string, unknown>>();
        for (const source of [previous.extensions?.roadmap, state.extensions?.roadmap]) {
            const items = isRecord(source) ? source[collection] : null;
            if (Array.isArray(items)) items.filter(isRecord).forEach((item) => {
                if (typeof item.id === 'string') labels.set(item.id, item);
            });
        }
        roadmap[collection] = [...labels.values()];
    }
    const columns = new Map<unknown, unknown>();
    for (const column of [...(previous.board?.columns || []), ...(state.board?.columns || [])]) {
        if (isRecord(column)) columns.set(column.status, column);
    }
    return { board: { columns: [...columns.values()] }, extensions: { roadmap } };
}

// Compare only evidence carried by the snapshot. Automatic timestamps are not
// replayed, and createdAt is a discriminator, never evidence of creation.
export function matchesHistoryTask(evidence: HistoryTask, candidate: HistoryTask): boolean {
    return [...HISTORY_FIELDS, 'createdAt'].every((field) =>
        !Object.hasOwn(evidence, field) || field === 'createdAt' && !evidence[field] || areSerializableValuesEqual(evidence[field], candidate[field]));
}

export function recordedFieldValue(field: string, value: unknown, state: HistoryState): TaskHistoryValue {
    const result: TaskHistoryValue = { known: true, value: cloneSerializable(value) };
    if (field === 'attachments' && Array.isArray(value)) {
        // History is a read model: retain attachment identity/metadata, never
        // copy binary content into the values a renderer may stringify.
        result.value = value.map((attachment) => {
            if (!isRecord(attachment)) return attachment;
            const metadata = { ...attachment };
            delete metadata.dataUrl;
            return cloneSerializable(metadata);
        });
        result.label = value.filter(isRecord).map((item) => `${item.name || 'Attachment'} (${item.id || '?'})`).join(', ');
    }
    if (field === 'checklist' && Array.isArray(value)) {
        result.label = value.filter(isRecord).map((item) => `${item.text} (${item.done ? 'completed' : 'pending'})`).join(', ');
    }
    if (typeof value !== 'string' || !value) return result;
    if (field === 'status') {
        const column = state.board?.columns?.find((column) => isRecord(column) && column.status === value);
        result.label = isRecord(column) && typeof column.title === 'string' ? column.title : value;
    }
    const collection = { phaseId: 'phases', milestoneId: 'milestones', sprintId: 'sprints' }[field];
    if (collection) {
        const roadmap = state.extensions?.roadmap;
        const items = isRecord(roadmap) ? roadmap[collection] : null;
        const item = Array.isArray(items) ? items.find((item) => isRecord(item) && item.id === value) : null;
        result.label = isRecord(item) && typeof item.title === 'string' ? `${item.title} (${value})` : value;
    }
    return result;
}

export function unknownHistoryValue(): TaskHistoryValue {
    return { known: false, value: undefined };
}

export function taskFieldValue(task: HistoryTask | null, field: string, state: HistoryState, absenceKnown = true): TaskHistoryValue {
    if (!task) return absenceKnown ? recordedFieldValue(field, undefined, state) : unknownHistoryValue();
    return Object.hasOwn(task, field) ? recordedFieldValue(field, task[field], state) : unknownHistoryValue();
}

export function taskHistoryChanges(before: HistoryTask | null, after: HistoryTask | null, beforeState: HistoryState, afterState: HistoryState, beforeKnown = true): TaskHistoryChange[] {
    return HISTORY_FIELDS.flatMap((field) => {
        const previous = taskFieldValue(before, field, beforeState, beforeKnown);
        const next = taskFieldValue(after, field, afterState);
        if (!before && after && !next.known) return [];
        if ((!previous.known && !next.known) || (previous.known && next.known && areSerializableValuesEqual(before?.[field], after?.[field]))) return [];
        return [{ field, before: previous, after: next }];
    });
}

// The public planning change is one array-valued field per action, including
// restores that can change several blocks. Each value carries block identity,
// taskId, date, start and end; duration is derivable from the two times.
export function planningHistoryValue(blocks: DayPlanBlock[]): TaskHistoryValue {
    return {
        known: true,
        value: cloneSerializable(blocks),
        label: blocks.map((block) => `${block.id}: ${block.date} ${block.start}–${block.end} (${formatPlannerDuration(plannerMinutes(block.end) - plannerMinutes(block.start))})`).join(', ')
    };
}
