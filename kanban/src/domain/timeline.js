import { TIMELINE_VERSION } from './constants.js';

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
