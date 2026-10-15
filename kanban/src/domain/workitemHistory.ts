import type { BoardData, TimelineEvent } from './types';
import { getBoardTimelineData, appendTimelineEvent, buildTaskTimelineChanges } from './timeline';
import { areSerializableValuesEqual } from './serializable';
import { groupBy } from './util';
import { getProjectInfo } from './project';
import { refKey, type TaskRef, type WorkitemRelation } from './relations';

// Fill audit gaps from board-level operations without duplicating task events
// already recorded by the existing commands.
export function ensureTaskAuditEvents(data: BoardData, previous: BoardData, fromIndex: number): void {
    const emitted = getBoardTimelineData(data)?.events.slice(fromIndex) || [];
    const beforeById = new Map(previous.board.tasks.map((task) => [task.id, task]));
    const coverage = groupBy(emitted.filter((event) => event.entityType === 'task'), (event) => event.entityId);
    for (const task of data.board.tasks) {
        const before = beforeById.get(task.id);
        if (!before) continue;
        const changes = buildTaskTimelineChanges(before, task);
        if (!changes) continue;
        const events = coverage.get(String(task.id)) || [];
        for (const field of Object.keys(changes)) if (events.some((event) => event.changes?.[field] && areSerializableValuesEqual(event.changes[field].after, changes[field].after))) delete changes[field];
        if (Object.keys(changes).length) appendTimelineEvent(data, { kind: 'task.updated', entityType: 'task', entityId: String(task.id), summary: `Task updated: ${task.title}`, changes });
    }
}

export function workitemHistory(boards: readonly BoardData[], ref: TaskRef): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    for (const data of boards) {
        const own = getProjectInfo(data).id === ref.projectId;
        for (const event of getBoardTimelineData(data)?.events || []) {
            const relation = event.meta?.relation as WorkitemRelation | undefined;
            const linked = relation && (refKey(relation.from) === refKey(ref) || refKey(relation.to) === refKey(ref));
            if (linked || own && (event.entityType === 'task' && event.entityId === String(ref.taskId) || event.meta?.taskIds?.some((id) => Number(id) === ref.taskId))) events.push(event);
        }
    }
    return [...new Map(events.map((event) => [event.id, event])).values()].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}

export const HISTORY_CATEGORIES = ['all', 'status', 'assignment', 'planning', 'relations', 'comments', 'pullRequests', 'attachments', 'general'] as const;
export function historyCategory(event: TimelineEvent): typeof HISTORY_CATEGORIES[number] {
    if (event.kind.includes('relation') || event.changes?.parentId) return 'relations';
    if (event.kind.includes('comment')) return 'comments';
    if (event.kind.includes('pullRequest')) return 'pullRequests';
    if (event.changes?.attachments) return 'attachments';
    if (event.changes?.status) return 'status';
    if (event.changes?.assigneeId || event.changes?.assignees) return 'assignment';
    if (event.kind.startsWith('roadmap.') || ['phaseId', 'milestoneId', 'sprintId', 'dueDate'].some((field) => event.changes?.[field])) return 'planning';
    return 'general';
}

export function historyValue(value: unknown): string {
    if (value == null || value === '') return '—';
    if (Array.isArray(value)) return value.map((item) => historyValue(item)).join(', ') || '—';
    if (typeof value === 'object') {
        const object = value as Record<string, unknown>;
        return String(object.name || object.title || object.text || object.id || '…').slice(0, 500);
    }
    return String(value).slice(0, 500);
}
