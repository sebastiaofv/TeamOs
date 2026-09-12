import { EFFORT_BUCKETS } from './constants.js';
import { normalizeEffort } from './task.js';

export function effortRank(effort) {
    const normalized = normalizeEffort(effort);
    if (!normalized) return EFFORT_BUCKETS.length;
    return EFFORT_BUCKETS.indexOf(normalized);
}

export function effortScoreValue(effort) {
    const normalized = normalizeEffort(effort);
    if (normalized === 'XS') return 1;
    if (normalized === 'S') return 2;
    if (normalized === 'M') return 3;
    if (normalized === 'L') return 5;
    if (normalized === 'XL') return 8;
    return 0;
}

export function priorityRank(priority) {
    if (priority === 'high') return 0;
    if (priority === 'medium') return 1;
    if (priority === 'low') return 2;
    return 3;
}

export function priorityScoreValue(priority) {
    if (priority === 'high') return 3;
    if (priority === 'medium') return 2;
    if (priority === 'low') return 1;
    return 0;
}
