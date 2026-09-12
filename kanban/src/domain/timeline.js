import { TIMELINE_VERSION } from './constants.js';
import { areSerializableValuesEqual, cloneSerializable } from './serialize.js';

export function createEmptyTimelineData() {
    return {
        version: TIMELINE_VERSION,
        baselineEventId: '',
        events: []
    };
}

export function createTimelineEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatTimelineValue(value) {
    if (value === undefined) return '(unset)';
    if (value === null) return 'null';
    if (typeof value === 'string') return value || '(empty)';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value, null, 2);
}

export function buildTaskTimelineChanges(beforeTask, afterTask) {
    const fieldNames = ['title', 'description', 'assignees', 'tags', 'blocked', 'blockerReason', 'checklist', 'attachments', 'archived', 'dueDate', 'priority', 'effort', 'phaseId', 'milestoneId', 'sprintId', 'status'];
    const changes = {};
    fieldNames.forEach((field) => {
        const beforeValue = beforeTask ? beforeTask[field] : undefined;
        const afterValue = afterTask ? afterTask[field] : undefined;
        if (areSerializableValuesEqual(beforeValue, afterValue)) return;
        changes[field] = {
            before: cloneSerializable(beforeValue),
            after: cloneSerializable(afterValue)
        };
    });
    return Object.keys(changes).length > 0 ? changes : null;
}

export function normalizeTimelineChanges(changes) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
    const entries = Object.entries(changes);
    if (entries.length === 0) return null;
    const normalized = {};
    for (const [field, value] of entries) {
        if (!field || !value || typeof value !== 'object' || Array.isArray(value)) return null;
        if (!Object.prototype.hasOwnProperty.call(value, 'before') || !Object.prototype.hasOwnProperty.call(value, 'after')) {
            return null;
        }
        normalized[field] = {
            before: cloneSerializable(value.before),
            after: cloneSerializable(value.after)
        };
    }
    return normalized;
}

export function buildTaskTimelineEvent(beforeTask, afterTask) {
    const taskRef = afterTask || beforeTask;
    if (!taskRef) return null;
    const taskTitle = String(taskRef.title || '').trim() || `Task ${taskRef.id}`;
    if (!beforeTask && afterTask) {
        return {
            kind: 'task.created',
            entityType: 'task',
            entityId: String(afterTask.id),
            summary: `Task created: ${taskTitle}`,
            snapshot: cloneSerializable(afterTask)
        };
    }
    if (beforeTask && !afterTask) {
        return {
            kind: 'task.deleted',
            entityType: 'task',
            entityId: String(beforeTask.id),
            summary: `Task deleted: ${taskTitle}`,
            snapshot: cloneSerializable(beforeTask)
        };
    }

    const changes = buildTaskTimelineChanges(beforeTask, afterTask);
    if (!changes) return null;
    const changedFields = Object.keys(changes);
    if (changedFields.length === 1 && changedFields[0] === 'archived') {
        const isArchived = Boolean(afterTask?.archived);
        return {
            kind: isArchived ? 'task.archived' : 'task.restored',
            entityType: 'task',
            entityId: String(taskRef.id),
            summary: `${isArchived ? 'Task archived' : 'Task restored'}: ${taskTitle}`,
            changes
        };
    }
    if (changedFields.length === 1 && changedFields[0] === 'status') {
        return {
            kind: 'task.status.changed',
            entityType: 'task',
            entityId: String(taskRef.id),
            summary: `Status changed: ${taskTitle}`,
            changes
        };
    }
    return {
        kind: 'task.updated',
        entityType: 'task',
        entityId: String(taskRef.id),
        summary: `Task updated: ${taskTitle}`,
        changes
    };
}
