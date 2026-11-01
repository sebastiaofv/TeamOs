import type { LooseBoardData } from './types';

export type TaskIdentityReservation = { version: 1; highWaterMark: number };

export function parseTaskIdentityReservation(value: unknown): TaskIdentityReservation | undefined {
    if (value === undefined) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid task identity reservation.');
    const input = value as Record<string, unknown>;
    if (input.version !== 1 || !Number.isSafeInteger(input.highWaterMark) || Number(input.highWaterMark) < 0 || Object.keys(input).some((key) => !['version', 'highWaterMark'].includes(key))) throw new Error('Invalid task identity reservation.');
    return { version: 1, highWaterMark: Number(input.highWaterMark) };
}

/** Reservations include deleted items and every saved snapshot, not just live rows. */
export function reservedTaskHighWaterMark(data?: LooseBoardData | null): number {
    let max = parseTaskIdentityReservation(data?.extensions?.taskIdentity)?.highWaterMark || 0;
    const reserve = (value: unknown) => { if (Number.isSafeInteger(Number(value)) && Number(value) > max) max = Number(value); };
    if (Array.isArray(data?.board?.tasks)) data.board.tasks.forEach((task) => reserve(task?.id));
    const timeline = data?.extensions?.timeline as { events?: { entityType?: string; entityId?: string; snapshot?: { id?: unknown; board?: { tasks?: { id?: unknown }[] } } }[] } | undefined;
    if (Array.isArray(timeline?.events)) timeline.events.forEach((event) => {
        if (event.entityType === 'task') reserve(event.entityId);
        reserve(event.snapshot?.id);
        if (Array.isArray(event.snapshot?.board?.tasks)) event.snapshot.board.tasks.forEach((task) => reserve(task.id));
    });
    return max;
}

export function reserveTaskIdentities(data: LooseBoardData, previous?: LooseBoardData): void {
    const highWaterMark = Math.max(reservedTaskHighWaterMark(data), reservedTaskHighWaterMark(previous));
    if (!highWaterMark && !data.extensions?.taskIdentity) return;
    data.extensions = { ...data.extensions, taskIdentity: { version: 1, highWaterMark } };
}

const TYPE_CODES = { epic: 'EP', story: 'US', task: 'TK', bug: 'BG' } as const;

/** Persisted at creation; never recompute from mutable project settings. */
export function createWorkitemDisplayId(acronym: string, task: Pick<import('./types').Task, 'id' | 'type'>): string {
    if (!/^[A-Z]{1,3}$/.test(acronym)) throw new Error('Project Acronym must contain one to three letters.');
    return `${acronym}-${TYPE_CODES[task.type || 'task']}-${task.id}`;
}

export function workitemId(task: { id: number; displayId?: string }): string {
    return task.displayId || String(task.id);
}

export function workitemLabel(task: { id: number; displayId?: string }): string {
    return task.displayId || `#${task.id}`;
}

export function workitemLabelFor(data: LooseBoardData | null | undefined, id: number): string {
    const tasks = data?.board?.tasks;
    const task = Array.isArray(tasks) ? tasks.find((item: import('./types').TaskInput) => item.id === id) : undefined;
    return task ? workitemLabel({ id, displayId: typeof task.displayId === 'string' ? task.displayId : undefined }) : `#${id}`;
}

/** Deterministic legacy migration: a read-only reopen has the same identity before its first save. */
export function ensurePermanentTaskIdentities(data: import('./types').BoardData): void {
    if (!data.board.tasks.length) return;
    const projectId = data.extensions.project!.id;
    for (const task of data.board.tasks) task.permanentId ||= `workitem:${encodeURIComponent(projectId)}:${task.id}:${encodeURIComponent(task.createdAt)}`;
}

/** A legacy snapshot/file may omit IDs already assigned to a proven current lifecycle. */
export function inheritLegacyTaskIdentities(data: import('./types').BoardData, raw: LooseBoardData, previous?: LooseBoardData | null): void {
    const original = new Map((Array.isArray(raw.board?.tasks) ? raw.board.tasks as import('./types').TaskInput[] : []).map((task) => [Number(task.id), task]));
    const current = new Map((Array.isArray(previous?.board?.tasks) ? previous.board.tasks as import('./types').Task[] : []).map((task) => [task.id, task]));
    for (const task of data.board.tasks) {
        if (original.get(task.id)?.permanentId) continue;
        const known = current.get(task.id);
        if (known?.permanentId && known.createdAt === task.createdAt) task.permanentId = known.permanentId;
        else delete task.permanentId;
    }
    ensurePermanentTaskIdentities(data);
}
