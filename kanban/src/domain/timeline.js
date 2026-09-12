import { ROADMAP_EXTENSION_KEY, TIMELINE_EXTENSION_KEY, TIMELINE_VERSION } from './constants.js';
import { getTaskAttachments } from './attachments.js';
import { areSerializableValuesEqual, cloneSerializable, getBoardExtensionsObject } from './serialize.js';
import { normalizeTimestamp } from './util.js';
import { createEmptyRoadmapExtension, getRoadmapExtension, normalizeRoadmapExtension } from './roadmap.js';
import { findTaskInBoardData, normalizeTask } from './task.js';

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

export function normalizeTimelineEvent(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    const at = normalizeTimestamp(raw.at);
    const kind = typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : '';
    const entityType = raw.entityType === 'board' ? 'board' : (raw.entityType === 'task' ? 'task' : '');
    const entityId = typeof raw.entityId === 'string' && raw.entityId.trim() ? raw.entityId.trim() : '';
    const summary = typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : kind;
    if (!id || !at || !kind || !entityType || !entityId) return null;

    const event = {
        id,
        at,
        kind,
        entityType,
        entityId,
        summary
    };

    if (Object.prototype.hasOwnProperty.call(raw, 'changes')) {
        const changes = normalizeTimelineChanges(raw.changes);
        if (!changes) return null;
        event.changes = changes;
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'snapshot')) {
        if (!raw.snapshot || typeof raw.snapshot !== 'object' || Array.isArray(raw.snapshot)) return null;
        event.snapshot = cloneSerializable(raw.snapshot);
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'meta')) {
        if (!raw.meta || typeof raw.meta !== 'object' || Array.isArray(raw.meta)) return null;
        event.meta = cloneSerializable(raw.meta);
    }
    return event;
}

export function applyTimelineEventToState(state, event) {
    if (!state || !event) return state;
    if (event.kind === 'board.restored' && event.snapshot) {
        return cloneSerializable(event.snapshot);
    }

    const nextState = cloneSerializable(state);
    nextState.board = nextState.board || { columns: [], tasks: [], settings: {} };
    nextState.board.tasks = Array.isArray(nextState.board.tasks) ? nextState.board.tasks : [];
    nextState.board.columns = Array.isArray(nextState.board.columns) ? nextState.board.columns : [];
    nextState.board.settings = nextState.board.settings && typeof nextState.board.settings === 'object'
        ? nextState.board.settings
        : {};

    if (event.kind === 'task.created' && event.snapshot) {
        nextState.board.tasks = nextState.board.tasks.filter((task) => Number(task?.id) !== Number(event.entityId));
        nextState.board.tasks.push(cloneSerializable(event.snapshot));
        return nextState;
    }
    if (event.kind === 'task.deleted') {
        nextState.board.tasks = nextState.board.tasks.filter((task) => Number(task?.id) !== Number(event.entityId));
        return nextState;
    }
    if (event.kind === 'task.updated' || event.kind === 'task.status.changed' || event.kind === 'task.archived' || event.kind === 'task.restored') {
        const task = nextState.board.tasks.find((entry) => Number(entry?.id) === Number(event.entityId));
        if (!task || !event.changes) return nextState;
        Object.entries(event.changes).forEach(([field, change]) => {
            task[field] = cloneSerializable(change.after);
        });
        return nextState;
    }
    if (event.kind === 'board.settings.updated' && event.changes) {
        Object.entries(event.changes).forEach(([field, change]) => {
            nextState.board.settings[field] = cloneSerializable(change.after);
        });
        return nextState;
    }
    if (event.kind === 'board.columns.updated') {
        if (event.changes?.columns) {
            nextState.board.columns = cloneSerializable(event.changes.columns.after) || [];
        } else if (event.snapshot?.board?.columns) {
            nextState.board.columns = cloneSerializable(event.snapshot.board.columns) || [];
        }
        return nextState;
    }
    if (event.kind === 'roadmap.bulk-assigned') {
        nextState.extensions = nextState.extensions && typeof nextState.extensions === 'object'
            ? nextState.extensions
            : {};
        const roadmap = normalizeRoadmapExtension(nextState.extensions[ROADMAP_EXTENSION_KEY]) || createEmptyRoadmapExtension();
        nextState.extensions[ROADMAP_EXTENSION_KEY] = roadmap;

        const sprint = event.meta?.sprint && typeof event.meta.sprint === 'object'
            ? cloneSerializable(event.meta.sprint)
            : null;
        if (!sprint?.id) {
            return nextState;
        }

        roadmap.sprints = Array.isArray(roadmap.sprints) ? roadmap.sprints : [];
        roadmap.sprints = roadmap.sprints.filter((entry) => entry?.id !== sprint.id);
        roadmap.sprints.push(sprint);

        const taskIdSet = new Set(Array.isArray(event.meta?.taskIds) ? event.meta.taskIds.map((taskId) => Number(taskId)) : []);
        nextState.board.tasks.forEach((task) => {
            if (!taskIdSet.has(Number(task?.id))) return;
            task.sprintId = sprint.id;
        });
        return nextState;
    }
    if (event.kind === 'roadmap.updated') {
        if (event.snapshot) {
            return cloneSerializable(event.snapshot);
        }
        return nextState;
    }
    return nextState;
}

export function normalizeTimelineExtension(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Number(value.version) !== TIMELINE_VERSION) return null;
    if (!Array.isArray(value.events)) return null;
    const events = value.events.map(normalizeTimelineEvent);
    if (events.some((event) => !event)) return null;
    const baselineEventId = typeof value.baselineEventId === 'string' ? value.baselineEventId.trim() : '';
    const fallbackBaselineId = events[0]?.id || '';
    return {
        version: TIMELINE_VERSION,
        baselineEventId: baselineEventId || fallbackBaselineId,
        events
    };
}

export function getTimelineExtensionObject(boardData, options = {}) {
    const create = Boolean(options.create);
    const extensions = getBoardExtensionsObject(boardData, { create });
    if (!extensions) return null;
    const current = extensions[TIMELINE_EXTENSION_KEY];
    const normalized = normalizeTimelineExtension(current);
    if (normalized) {
        extensions[TIMELINE_EXTENSION_KEY] = normalized;
        return extensions[TIMELINE_EXTENSION_KEY];
    }
    if (!create) return null;
    extensions[TIMELINE_EXTENSION_KEY] = createEmptyTimelineData();
    return extensions[TIMELINE_EXTENSION_KEY];
}

export function captureTaskTimelineSnapshot(boardData, taskId) {
    const task = findTaskInBoardData(boardData, taskId);
    if (!task) return null;
    return normalizeTask(task, {
        fallbackAttachments: getTaskAttachments(boardData, taskId),
        includeStatusChangedAt: false,
        roadmap: getRoadmapExtension(boardData)
    });
}

export function getBoardTimelineData(boardData) {
    const timeline = getTimelineExtensionObject(boardData);
    return timeline ? normalizeTimelineExtension(timeline) : null;
}
