// Number reservation for data that has not been converted to a project folder.
// system.sequences is the only source once a project has projectStorage.

import type { BoardData, TimelineEvent } from './types';

type WithStorage<T> = { extensions?: { projectStorage?: unknown; timeline?: T } } | null | undefined;
/** The history to scan for numbers, or nothing when persisted sequences are authoritative. */
export const unconvertedTimeline = <T>(data: WithStorage<T>): T | undefined => (data?.extensions?.projectStorage ? undefined : data?.extensions?.timeline);

type ControlSnapshot = { extensions?: { projectControl?: { lastNumber?: number } } };
export const highestControlNumber = (events: readonly Pick<TimelineEvent, 'snapshot'>[], floor: number): number =>
    events.reduce((highest, event) => Math.max(highest, (event.snapshot as ControlSnapshot | undefined)?.extensions?.projectControl?.lastNumber || 0), floor);

/** Runs once, where an unconverted project becomes a folder: a restore may have lowered the counter. */
export function reserveHistoricalControlNumber(data: BoardData, events: readonly Pick<TimelineEvent, 'snapshot'>[]): void {
    const lastNumber = highestControlNumber(events, data.extensions.projectControl?.lastNumber || 0);
    if (data.extensions.projectControl) data.extensions.projectControl.lastNumber = lastNumber;
    else if (lastNumber) data.extensions.projectControl = { version: 3, lastNumber, records: [] };
}
