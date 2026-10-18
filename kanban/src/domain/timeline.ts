import type {
    BoardData,
    LooseBoardData,
    RoadmapItem,
    Task,
    TimelineChanges,
    TimelineEvent,
    TimelineEventInput,
    TimelineExtension
} from './types';
import { ROADMAP_EXTENSION_KEY, TIMELINE_EXTENSION_KEY, TIMELINE_VERSION } from './constants';
import { getTaskAttachments } from './attachments';
import { createBoardStateSnapshot } from './serialize';
import { getBoardExtensionsObject } from './extensions';
import { cloneSerializable, areSerializableValuesEqual } from './serializable';
import { nowIso } from './util';
import { createEmptyRoadmapExtension, getRoadmapExtension, normalizeRoadmapExtension } from './roadmap';
import { applyPlannerBlockChange, normalizeDayPlannerBlock } from './dayPlanner';
import { findTaskInBoardData } from './boardData';
import { normalizeTask } from './task';
import { normalizeTimelineEvent, normalizeTimelineExtension } from './timelineSchema';
import { normalizeSprintCatalog, parseSprintCatalog } from '@/domain/sprintCatalog';

export { normalizeTimelineChanges, normalizeTimelineEvent, normalizeTimelineExtension } from './timelineSchema';

// Board state while replaying timeline events: loosely shaped, since event
// changes and snapshots come from files.
type ReplayState = {
    [key: string]: unknown;
    board?: {
        columns?: unknown[];
        tasks?: Record<string, unknown>[];
        settings?: Record<string, unknown>;
    };
    extensions?: Record<string, unknown>;
};

const TASK_TIMELINE_FIELDS = ['title', 'description', 'assignees', 'tags', 'blocked', 'blockerReason', 'checklist', 'attachments', 'archived', 'dueDate', 'priority', 'effort', 'phaseId', 'milestoneId', 'sprintId', 'status'] as const;

export function createEmptyTimelineData(): TimelineExtension {
    return {
        version: TIMELINE_VERSION,
        baselineEventId: '',
        events: []
    };
}

export function createTimelineEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatTimelineValue(value: unknown): string {
    if (value === undefined) return '(unset)';
    if (value === null) return 'null';
    if (typeof value === 'string') return value || '(empty)';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value, null, 2);
}

export function buildTaskTimelineChanges(beforeTask: Task | null | undefined, afterTask: Task | null | undefined): TimelineChanges | null {
    const changes: TimelineChanges = {};
    TASK_TIMELINE_FIELDS.forEach((field) => {
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

export function buildTaskTimelineEvent(beforeTask: Task | null | undefined, afterTask: Task | null | undefined): TimelineEventInput | null {
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

export function applyTimelineEventToState(state: ReplayState | null | undefined, event: TimelineEvent | null | undefined): ReplayState | null | undefined {
    if (!state || !event) return state;
    if (event.kind === 'board.restored' && event.snapshot) {
        return cloneSerializable(event.snapshot);
    }

    const nextState = cloneSerializable(state);
    const board = nextState.board || { columns: [], tasks: [], settings: {} };
    nextState.board = board;
    board.tasks = Array.isArray(board.tasks) ? board.tasks : [];
    board.columns = Array.isArray(board.columns) ? board.columns : [];
    board.settings = board.settings && typeof board.settings === 'object'
        ? board.settings
        : {};
    const tasks = board.tasks;
    const settings = board.settings;

    if (event.kind === 'task.created' && event.snapshot) {
        board.tasks = tasks.filter((task) => Number(task?.id) !== Number(event.entityId));
        board.tasks.push(cloneSerializable(event.snapshot));
        return nextState;
    }
    if (event.kind === 'task.deleted') {
        board.tasks = tasks.filter((task) => Number(task?.id) !== Number(event.entityId));
        return nextState;
    }
    if (event.kind === 'task.updated' || event.kind === 'task.status.changed' || event.kind === 'task.archived' || event.kind === 'task.restored') {
        const task = tasks.find((entry) => Number(entry?.id) === Number(event.entityId));
        if (!task || !event.changes) return nextState;
        Object.entries(event.changes).forEach(([field, change]) => {
            task[field] = cloneSerializable(change.after);
        });
        return nextState;
    }
    if (event.kind === 'board.settings.updated' && event.changes) {
        Object.entries(event.changes).forEach(([field, change]) => {
            settings[field] = cloneSerializable(change.after);
        });
        return nextState;
    }
    if (event.kind === 'board.columns.updated') {
        if (event.changes?.columns) {
            board.columns = (cloneSerializable(event.changes.columns.after) as unknown[] | null) || [];
        } else if (event.snapshot?.board?.columns) {
            board.columns = cloneSerializable(event.snapshot.board.columns) || [];
        }
        return nextState;
    }
    if (event.kind === 'roadmap.bulk-assigned') {
        const extensions = nextState.extensions && typeof nextState.extensions === 'object'
            ? nextState.extensions
            : {};
        nextState.extensions = extensions;
        const roadmap = normalizeRoadmapExtension(extensions[ROADMAP_EXTENSION_KEY]) || createEmptyRoadmapExtension();
        extensions[ROADMAP_EXTENSION_KEY] = roadmap;

        const sprint: RoadmapItem | null = event.meta?.sprint && typeof event.meta.sprint === 'object'
            ? cloneSerializable(event.meta.sprint)
            : null;
        if (!sprint?.id) {
            return nextState;
        }

        roadmap.sprints = Array.isArray(roadmap.sprints) ? roadmap.sprints : [];
        roadmap.sprints = roadmap.sprints.filter((entry) => entry?.id !== sprint.id);
        roadmap.sprints.push(sprint);
        if (event.meta?.sprintCatalog !== undefined) extensions.sprintCatalog = parseSprintCatalog(event.meta.sprintCatalog);

        const taskIdSet = new Set(Array.isArray(event.meta?.taskIds) ? event.meta.taskIds.map((taskId) => Number(taskId)) : []);
        tasks.forEach((task) => {
            if (!taskIdSet.has(Number(task?.id))) return;
            task.sprintId = sprint.id;
        });
        return nextState;
    }
    if (event.kind.startsWith('planner.block.')) {
        const change = event.changes?.block;
        if (!change) return nextState;
        applyPlannerBlockChange(nextState, normalizeDayPlannerBlock(change.before), normalizeDayPlannerBlock(change.after));
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

export function getTimelineExtensionObject(boardData: LooseBoardData, options: { create: true }): TimelineExtension;
export function getTimelineExtensionObject(boardData: LooseBoardData | null | undefined, options?: { create?: boolean }): TimelineExtension | null;
export function getTimelineExtensionObject(boardData: LooseBoardData | null | undefined, options: { create?: boolean } = {}): TimelineExtension | null {
    const create = Boolean(options.create);
    const extensions = getBoardExtensionsObject(boardData, { create });
    if (!extensions) return null;
    const current = extensions[TIMELINE_EXTENSION_KEY];
    const normalized = normalizeTimelineExtension(current);
    if (normalized) {
        extensions[TIMELINE_EXTENSION_KEY] = normalized;
        return normalized;
    }
    if (!create) return null;
    const created = createEmptyTimelineData();
    extensions[TIMELINE_EXTENSION_KEY] = created;
    return created;
}

export function captureTaskTimelineSnapshot(boardData: LooseBoardData | null | undefined, taskId: unknown): Task | null {
    const task = findTaskInBoardData(boardData, taskId);
    if (!task) return null;
    return normalizeTask(task, {
        fallbackAttachments: getTaskAttachments(boardData, taskId),
        includeStatusChangedAt: false,
        roadmap: getRoadmapExtension(boardData)
    });
}

export function getBoardTimelineData(boardData: LooseBoardData | null | undefined): TimelineExtension | null {
    const timeline = getTimelineExtensionObject(boardData);
    return timeline ? normalizeTimelineExtension(timeline) : null;
}

export function ensureBoardTimelineBaseline(boardData: LooseBoardData): TimelineExtension | null {
    const timeline = getTimelineExtensionObject(boardData, { create: true });
    if (!timeline) return null;
    if (Array.isArray(timeline.events) && timeline.events.length > 0) {
        if (!timeline.baselineEventId) {
            timeline.baselineEventId = timeline.events[0].id;
        }
        return timeline;
    }

    const baselineEvent: TimelineEvent = {
        id: createTimelineEventId(),
        at: nowIso(),
        kind: 'board.baseline',
        entityType: 'board',
        entityId: 'board',
        summary: 'Baseline snapshot created',
        snapshot: createBoardStateSnapshot(boardData)
    };
    timeline.version = TIMELINE_VERSION;
    timeline.baselineEventId = baselineEvent.id;
    timeline.events = [baselineEvent];
    return timeline;
}

export function reconstructBoardStateFromTimeline(boardData: LooseBoardData | null | undefined, eventIndex: unknown): BoardData {
    const timeline = getBoardTimelineData(boardData);
    if (!timeline || !Array.isArray(timeline.events) || timeline.events.length === 0) {
        return createBoardStateSnapshot(boardData);
    }
    const maxIndex = timeline.events.length - 1;
    const targetIndex = Math.max(0, Math.min(maxIndex, Number(eventIndex)));
    let state: ReplayState | null | undefined = timeline.events[0]?.snapshot
        ? cloneSerializable(timeline.events[0].snapshot)
        : createBoardStateSnapshot(boardData);
    for (let index = 1; index <= targetIndex; index += 1) {
        state = applyTimelineEventToState(state, timeline.events[index]);
    }
    const snapshot = createBoardStateSnapshot(state);
    // Identities are project-wide reservations, not mutable planning state.
    // Preview/restore may change membership, but must not renumber or reuse identities.
    const knownCatalog = normalizeSprintCatalog(boardData?.extensions?.sprintCatalog, getRoadmapExtension(boardData)?.sprints || [], boardData?.extensions?.timeline);
    if (knownCatalog) snapshot.extensions.sprintCatalog = normalizeSprintCatalog(knownCatalog, snapshot.extensions.roadmap?.sprints || []);
    return snapshot;
}

export function appendTimelineEvent(boardData: LooseBoardData, eventInput: TimelineEventInput | null | undefined): TimelineEvent | null {
    const timeline = ensureBoardTimelineBaseline(boardData);
    if (!timeline || !eventInput) return null;
    const rawEvent: Record<string, unknown> = {
        id: eventInput.id || createTimelineEventId(),
        at: eventInput.at || nowIso(),
        kind: eventInput.kind,
        entityType: eventInput.entityType,
        entityId: eventInput.entityId,
        summary: eventInput.summary
    };
    if (Object.prototype.hasOwnProperty.call(eventInput, 'changes')) {
        rawEvent.changes = eventInput.changes;
    }
    if (Object.prototype.hasOwnProperty.call(eventInput, 'snapshot')) {
        rawEvent.snapshot = eventInput.snapshot;
    }
    if (Object.prototype.hasOwnProperty.call(eventInput, 'meta')) {
        rawEvent.meta = eventInput.meta;
    }
    const normalizedEvent = normalizeTimelineEvent(rawEvent);
    if (!normalizedEvent) return null;
    timeline.events.push(normalizedEvent);
    return normalizedEvent;
}

export function recordBoardRestoreTimelineEvent(boardData: LooseBoardData, restoredFromEvent: TimelineEvent | null | undefined): TimelineEvent | null {
    return appendTimelineEvent(boardData, {
        kind: 'board.restored',
        entityType: 'board',
        entityId: 'board',
        summary: 'Board restored from timeline',
        snapshot: createBoardStateSnapshot(boardData),
        meta: {
            fromEventId: restoredFromEvent?.id || '',
            fromTimestamp: restoredFromEvent?.at || ''
        }
    });
}

export function recordTaskTimelineEvent(boardData: LooseBoardData, beforeTask: Task | null | undefined, afterTask: Task | null | undefined): TimelineEvent | null {
    const event = buildTaskTimelineEvent(beforeTask, afterTask);
    if (!event) return null;
    return appendTimelineEvent(boardData, event);
}
