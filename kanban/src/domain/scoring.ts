import { EFFORT_BUCKETS } from './constants';
import { normalizeEffort } from './task';

type ScoredTask = { effort?: unknown; priority?: unknown } | null | undefined;

export function effortRank(effort: unknown): number {
    const normalized = normalizeEffort(effort);
    if (!normalized) return EFFORT_BUCKETS.length;
    return EFFORT_BUCKETS.indexOf(normalized);
}

export function effortScoreValue(effort: unknown): number {
    const normalized = normalizeEffort(effort);
    if (normalized === 'XS') return 1;
    if (normalized === 'S') return 2;
    if (normalized === 'M') return 3;
    if (normalized === 'L') return 5;
    if (normalized === 'XL') return 8;
    return 0;
}

export function priorityRank(priority: unknown): number {
    if (priority === 'high') return 0;
    if (priority === 'medium') return 1;
    if (priority === 'low') return 2;
    return 3;
}

export function priorityScoreValue(priority: unknown): number {
    if (priority === 'high') return 3;
    if (priority === 'medium') return 2;
    if (priority === 'low') return 1;
    return 0;
}

export function taskScore(task: ScoredTask): number | null {
    const denominator = effortScoreValue(task?.effort);
    const numerator = priorityScoreValue(task?.priority);
    if (!denominator || !numerator) return null;
    return numerator / denominator;
}

export function formatTaskScore(task: ScoredTask): string {
    const score = taskScore(task);
    return score !== null && Number.isFinite(score) ? score.toFixed(2) : '-';
}
