import type {
    TimelineChanges,
    TimelineEvent,
    TimelineEventMeta,
    TimelineExtension,
    TimelineSnapshot
} from './types';
import { TIMELINE_VERSION } from './constants';
import { cloneSerializable } from './serializable';
import { isRecord, normalizeTimestamp } from './util';

export function normalizeTimelineChanges(changes: unknown): TimelineChanges | null {
    if (!isRecord(changes)) return null;
    const entries = Object.entries(changes);
    if (entries.length === 0) return null;
    const normalized: TimelineChanges = {};
    for (const [field, value] of entries) {
        if (!field || !isRecord(value)) return null;
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

export function normalizeTimelineEvent(raw: unknown): TimelineEvent | null {
    if (!isRecord(raw)) return null;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    const at = normalizeTimestamp(raw.at);
    const kind = typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : '';
    const entityType = raw.entityType === 'board' ? 'board' : (raw.entityType === 'task' ? 'task' : '');
    const entityId = typeof raw.entityId === 'string' && raw.entityId.trim() ? raw.entityId.trim() : '';
    const summary = typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : kind;
    if (!id || !at || !kind || !entityType || !entityId) return null;

    const event: TimelineEvent = {
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
        if (!isRecord(raw.snapshot)) return null;
        event.snapshot = cloneSerializable(raw.snapshot) as TimelineSnapshot;
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'meta')) {
        if (!isRecord(raw.meta)) return null;
        event.meta = cloneSerializable(raw.meta) as TimelineEventMeta;
    }
    return event;
}

export function normalizeTimelineExtension(value: unknown): TimelineExtension | null {
    if (!isRecord(value)) return null;
    if (Number(value.version) !== TIMELINE_VERSION) return null;
    if (!Array.isArray(value.events)) return null;
    const events: TimelineEvent[] = [];
    for (const rawEvent of value.events) {
        const event = normalizeTimelineEvent(rawEvent);
        if (!event) return null;
        events.push(event);
    }
    const baselineEventId = typeof value.baselineEventId === 'string' ? value.baselineEventId.trim() : '';
    const fallbackBaselineId = events[0]?.id || '';
    return {
        version: TIMELINE_VERSION,
        baselineEventId: baselineEventId || fallbackBaselineId,
        events
    };
}
