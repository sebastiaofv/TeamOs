// Day planner rules: the 15-minute time grid, block gestures and planner dates.
// Times are minutes since midnight; stored values are "HH:MM" strings.

import type { DayPlanBlock } from './types';
import { parseRoadmapIsoDate } from './roadmap';

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
