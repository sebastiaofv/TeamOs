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
