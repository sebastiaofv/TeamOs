// Day planner rules: the 15-minute time grid, block gestures and planner dates.
// Times are minutes since midnight; stored values are "HH:MM" strings.

import type { DayPlanBlock, DayPlannerExtension, LooseBoardData } from './types';
import { DAY_PLANNER_EXTENSION_KEY, DAY_PLANNER_VERSION } from './constants';
import { getBoardExtensionsObject } from './extensions';
import { parseRoadmapIsoDate } from './roadmap';
import { isRecord } from './util';

export const PLANNER_SLOT_MINUTES = 15;
export const PLANNER_DAY_START = 7 * 60;
export const PLANNER_DAY_END = 21 * 60;
export const PLANNER_WORK_START = 9 * 60;
export const PLANNER_WORK_END = 17 * 60;
export const PLANNER_DEFAULT_BLOCK_MINUTES = 60;

export type PlannerBlockTimes = Pick<DayPlanBlock, 'date' | 'start' | 'end'>;
export type PlannerGestureMode = 'move' | 'resize-start' | 'resize-end';

// Minutes for an on-grid "HH:MM" inside the planner window, otherwise null.
export function parsePlannerTime(value: unknown): number | null {
    if (typeof value !== 'string') return null;
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    const total = hours * 60 + minutes;
    if (total % PLANNER_SLOT_MINUTES !== 0) return null;
    if (total < PLANNER_DAY_START || total > PLANNER_DAY_END) return null;
    return total;
}

// For values already normalized; falls back to the start of the window.
export function plannerMinutes(value: string): number {
    return parsePlannerTime(value) ?? PLANNER_DAY_START;
}

export function formatPlannerTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function formatPlannerDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${rest}m`;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function snapPlannerMinutes(minutes: number): number {
    return Math.round(minutes / PLANNER_SLOT_MINUTES) * PLANNER_SLOT_MINUTES;
}

// The snapped start that keeps a block of `duration` inside the window.
export function clampPlannerStart(start: number, duration: number): number {
    return Math.max(PLANNER_DAY_START, Math.min(PLANNER_DAY_END - duration, snapPlannerMinutes(start)));
}

// The slot under a vertical pixel offset from the top of a day column.
export function minutesAtPlannerOffset(offsetPx: number, slotPx: number): number {
    const slot = Math.max(0, Math.floor(offsetPx / slotPx));
    return PLANNER_DAY_START + slot * PLANNER_SLOT_MINUTES;
}

export function createPlannerBlockTimes(startMinutes: number): { start: string; end: string } {
    const start = clampPlannerStart(startMinutes, PLANNER_DEFAULT_BLOCK_MINUTES);
    return { start: formatPlannerTime(start), end: formatPlannerTime(start + PLANNER_DEFAULT_BLOCK_MINUTES) };
}

// New times for a block after dragging it (`move`) or one of its edges.
// `targetDate` only applies to moves.
export function applyPlannerGesture(
    times: PlannerBlockTimes,
    mode: PlannerGestureMode,
    deltaMinutes: number,
    targetDate: string = times.date
): PlannerBlockTimes {
    const start = plannerMinutes(times.start);
    const end = plannerMinutes(times.end);
    const delta = snapPlannerMinutes(deltaMinutes);
    if (mode === 'move') {
        const duration = end - start;
        const nextStart = clampPlannerStart(start + delta, duration);
        return { date: targetDate, start: formatPlannerTime(nextStart), end: formatPlannerTime(nextStart + duration) };
    }
    if (mode === 'resize-start') {
        const nextStart = Math.max(PLANNER_DAY_START, Math.min(end - PLANNER_SLOT_MINUTES, start + delta));
        return { date: times.date, start: formatPlannerTime(nextStart), end: times.end };
    }
    const nextEnd = Math.min(PLANNER_DAY_END, Math.max(start + PLANNER_SLOT_MINUTES, end + delta));
    return { date: times.date, start: times.start, end: formatPlannerTime(nextEnd) };
}

export function shiftPlannerDate(isoDate: string, days: number): string {
    const date = parseRoadmapIsoDate(isoDate);
    if (!date) return isoDate;
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

// Monday–Friday of the week that contains `isoDate`.
export function getPlannerWeekDates(isoDate: string): string[] {
    const date = parseRoadmapIsoDate(isoDate);
    if (!date) return [];
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const monday = shiftPlannerDate(isoDate, -mondayOffset);
    return [0, 1, 2, 3, 4].map((day) => shiftPlannerDate(monday, day));
}

// A stored block, or null when it is malformed, off the grid, empty, or (when
// `taskIds` is given) points at a task that does not exist.
export function normalizeDayPlannerBlock(value: unknown, taskIds?: ReadonlySet<number>): DayPlanBlock | null {
    if (!isRecord(value)) return null;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    const taskId = Number(value.taskId);
    const date = typeof value.date === 'string' && parseRoadmapIsoDate(value.date) ? value.date : '';
    const start = parsePlannerTime(value.start);
    const end = parsePlannerTime(value.end);
    if (!id || !Number.isInteger(taskId) || !date || start === null || end === null || end <= start) return null;
    if (taskIds && !taskIds.has(taskId)) return null;
    return { id, taskId, date, start: formatPlannerTime(start), end: formatPlannerTime(end) };
}

// Null when the value is not a version-1 extension or no block survives, so
// callers can drop the key.
export function normalizeDayPlannerExtension(value: unknown, taskIds?: ReadonlySet<number>): DayPlannerExtension | null {
    if (!isRecord(value) || value.version !== DAY_PLANNER_VERSION || !Array.isArray(value.blocks)) return null;
    const seen = new Set<string>();
    const blocks: DayPlanBlock[] = [];
    value.blocks.forEach((entry) => {
        const block = normalizeDayPlannerBlock(entry, taskIds);
        if (!block || seen.has(block.id)) return;
        seen.add(block.id);
        blocks.push(block);
    });
    return blocks.length > 0 ? { version: DAY_PLANNER_VERSION, blocks } : null;
}

export function getDayPlannerBlocks(boardData: LooseBoardData | null | undefined): DayPlanBlock[] {
    return normalizeDayPlannerExtension(boardData?.extensions?.[DAY_PLANNER_EXTENSION_KEY])?.blocks || [];
}

export function setDayPlannerBlocks(boardData: LooseBoardData, blocks: DayPlanBlock[]): void {
    const extensions = getBoardExtensionsObject(boardData, { create: true });
    if (blocks.length === 0) {
        delete extensions[DAY_PLANNER_EXTENSION_KEY];
        return;
    }
    const extension: DayPlannerExtension = { version: DAY_PLANNER_VERSION, blocks };
    extensions[DAY_PLANNER_EXTENSION_KEY] = extension;
}

export function createDayPlanBlockId(): string {
    return `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export type PlannerLayoutSlot = { column: number; columns: number };

// Calendar-style packing: blocks that overlap (directly or through a chain)
// form a group; each takes the first free column, and every block in a group
// shares that group's column count.
export function layoutPlannerBlocks(blocks: readonly { id: string; start: string; end: string }[]): Map<string, PlannerLayoutSlot> {
    const sorted = [...blocks].sort((a, b) => plannerMinutes(a.start) - plannerMinutes(b.start)
        || plannerMinutes(b.end) - plannerMinutes(a.end)
        || a.id.localeCompare(b.id));
    const layout = new Map<string, PlannerLayoutSlot>();
    let group: { id: string; column: number }[] = [];
    let columnEnds: number[] = [];
    let groupEnd = -Infinity;
    const flush = () => {
        group.forEach(({ id, column }) => layout.set(id, { column, columns: columnEnds.length }));
        group = [];
        columnEnds = [];
    };
    sorted.forEach((block) => {
        const start = plannerMinutes(block.start);
        const end = plannerMinutes(block.end);
        if (start >= groupEnd) {
            flush();
            groupEnd = -Infinity;
        }
        let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
        if (column < 0) {
            column = columnEnds.length;
            columnEnds.push(end);
        } else {
            columnEnds[column] = end;
        }
        group.push({ id: block.id, column });
        groupEnd = Math.max(groupEnd, end);
    });
    flush();
    return layout;
}
