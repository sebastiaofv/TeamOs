import { describe, expect, it } from 'vitest';
import {
  PLANNER_DAY_END,
  PLANNER_DAY_START,
  applyPlannerGesture,
  clampPlannerStart,
  createPlannerBlockTimes,
  formatPlannerDuration,
  formatPlannerTime,
  getPlannerWeekDates,
  minutesAtPlannerOffset,
  parsePlannerTime,
  shiftPlannerDate,
  snapPlannerMinutes
} from '../../src/domain/dayPlanner';

describe('parsePlannerTime', () => {
  it('parses on-grid times inside the 07:00–21:00 window', () => {
    expect(parsePlannerTime('07:00')).toBe(420);
    expect(parsePlannerTime('09:45')).toBe(585);
    expect(parsePlannerTime('21:00')).toBe(1260);
  });

  it('rejects malformed, off-grid and out-of-window values', () => {
    expect(parsePlannerTime('9:00')).toBeNull();
    expect(parsePlannerTime('09:10')).toBeNull();
    expect(parsePlannerTime('06:45')).toBeNull();
    expect(parsePlannerTime('21:15')).toBeNull();
    expect(parsePlannerTime('24:00')).toBeNull();
    expect(parsePlannerTime(900)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats minutes as HH:MM', () => {
    expect(formatPlannerTime(420)).toBe('07:00');
    expect(formatPlannerTime(1005)).toBe('16:45');
  });

  it('formats durations compactly', () => {
    expect(formatPlannerDuration(45)).toBe('45m');
    expect(formatPlannerDuration(60)).toBe('1h');
    expect(formatPlannerDuration(210)).toBe('3h 30m');
    expect(formatPlannerDuration(0)).toBe('0m');
  });
});

describe('snapping and clamping', () => {
  it('snaps to the nearest 15 minutes', () => {
    expect(snapPlannerMinutes(547)).toBe(540);
    expect(snapPlannerMinutes(548)).toBe(555);
  });

  it('keeps a block of the given duration inside the window', () => {
    expect(clampPlannerStart(400, 60)).toBe(PLANNER_DAY_START);
    expect(clampPlannerStart(1230, 60)).toBe(PLANNER_DAY_END - 60);
    expect(clampPlannerStart(601, 60)).toBe(600);
  });

  it('maps a pixel offset in a day column to the slot under it', () => {
    expect(minutesAtPlannerOffset(0, 24)).toBe(420);
    expect(minutesAtPlannerOffset(23, 24)).toBe(420);
    expect(minutesAtPlannerOffset(24, 24)).toBe(435);
    expect(minutesAtPlannerOffset(-10, 24)).toBe(420);
  });

  it('creates a 1-hour block that ends by 21:00', () => {
    expect(createPlannerBlockTimes(600)).toEqual({ start: '10:00', end: '11:00' });
    expect(createPlannerBlockTimes(1245)).toEqual({ start: '20:00', end: '21:00' });
  });
});

describe('applyPlannerGesture', () => {
  const block = { date: '2026-09-25', start: '09:00', end: '10:00' };

  it('moves keeping the duration, snapping and clamping', () => {
    expect(applyPlannerGesture(block, 'move', 37)).toEqual({ date: '2026-09-25', start: '09:30', end: '10:30' });
    expect(applyPlannerGesture(block, 'move', -500)).toEqual({ date: '2026-09-25', start: '07:00', end: '08:00' });
    expect(applyPlannerGesture(block, 'move', 15, '2026-09-24')).toEqual({ date: '2026-09-24', start: '09:15', end: '10:15' });
  });

  it('resizes the start without passing the end', () => {
    expect(applyPlannerGesture(block, 'resize-start', -30)).toEqual({ date: '2026-09-25', start: '08:30', end: '10:00' });
    expect(applyPlannerGesture(block, 'resize-start', 120)).toEqual({ date: '2026-09-25', start: '09:45', end: '10:00' });
  });

  it('resizes the end without passing the start or the window', () => {
    expect(applyPlannerGesture(block, 'resize-end', 45)).toEqual({ date: '2026-09-25', start: '09:00', end: '10:45' });
    expect(applyPlannerGesture(block, 'resize-end', -120)).toEqual({ date: '2026-09-25', start: '09:00', end: '09:15' });
    expect(applyPlannerGesture(block, 'resize-end', 1000)).toEqual({ date: '2026-09-25', start: '09:00', end: '21:00' });
  });

  it('ignores the target date for resizes', () => {
    expect(applyPlannerGesture(block, 'resize-end', 15, '2026-09-24').date).toBe('2026-09-25');
  });
});

describe('planner dates', () => {
  it('shifts ISO dates across month boundaries', () => {
    expect(shiftPlannerDate('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftPlannerDate('2026-10-01', -7)).toBe('2026-09-24');
  });

  it('returns Monday–Friday of the week containing the date', () => {
    const week = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
    expect(getPlannerWeekDates('2026-09-25')).toEqual(week);
    expect(getPlannerWeekDates('2026-09-21')).toEqual(week);
    expect(getPlannerWeekDates('2026-09-27')).toEqual(week);
  });

  it('returns an empty week for an invalid date', () => {
    expect(getPlannerWeekDates('nope')).toEqual([]);
  });
});
