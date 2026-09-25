import { fromPartial } from '@total-typescript/shoehorn';
import { describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import {
  PLANNER_DAY_END,
  PLANNER_DAY_START,
  applyPlannerGesture,
  clampPlannerStart,
  createDayPlanBlockId,
  createPlannerBlockTimes,
  getDayPlannerBlocks,
  normalizeDayPlannerBlock,
  normalizeDayPlannerExtension,
  setDayPlannerBlocks,
  formatPlannerDuration,
  formatPlannerTime,
  getPlannerWeekDates,
  layoutPlannerBlocks,
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

const validBlock = { id: 'blk-1', taskId: 1, date: '2026-09-25', start: '09:00', end: '10:00' };

describe('normalizeDayPlannerBlock', () => {
  it('keeps a valid block', () => {
    expect(normalizeDayPlannerBlock(validBlock)).toEqual(validBlock);
  });

  it.each([
    ['missing id', { ...validBlock, id: '' }],
    ['non-integer task id', { ...validBlock, taskId: 'x' }],
    ['bad date', { ...validBlock, date: '2026-02-30' }],
    ['off-grid time', { ...validBlock, start: '09:05' }],
    ['outside the window', { ...validBlock, end: '21:15' }],
    ['end before start', { ...validBlock, start: '10:00', end: '09:00' }],
    ['zero length', { ...validBlock, end: '09:00' }],
    ['not an object', 'blk']
  ])('drops a block with %s', (_label, value) => {
    expect(normalizeDayPlannerBlock(value)).toBeNull();
  });

  it('drops a block whose task is not in the given id set', () => {
    expect(normalizeDayPlannerBlock(validBlock, new Set([2]))).toBeNull();
    expect(normalizeDayPlannerBlock(validBlock, new Set([1]))).toEqual(validBlock);
  });
});

describe('normalizeDayPlannerExtension', () => {
  it('keeps valid blocks, drops invalid ones and duplicate ids', () => {
    const result = normalizeDayPlannerExtension({
      version: 1,
      blocks: [validBlock, { ...validBlock, start: 'bad' }, { ...validBlock, start: '11:00', end: '12:00' }]
    });
    expect(result).toEqual({ version: 1, blocks: [validBlock] });
  });

  it('returns null for a wrong version, a non-object or no remaining blocks', () => {
    expect(normalizeDayPlannerExtension({ version: 2, blocks: [validBlock] })).toBeNull();
    expect(normalizeDayPlannerExtension([])).toBeNull();
    expect(normalizeDayPlannerExtension({ version: 1, blocks: [] })).toBeNull();
  });
});

describe('reading and writing blocks', () => {
  it('writes blocks and removes the extension when empty', () => {
    const data = createEmptyProjectData('P');
    setDayPlannerBlocks(data, [validBlock]);
    expect(data.extensions.dayPlanner).toEqual({ version: 1, blocks: [validBlock] });
    expect(getDayPlannerBlocks(data)).toEqual([validBlock]);
    setDayPlannerBlocks(data, []);
    expect(data.extensions).not.toHaveProperty('dayPlanner');
    expect(getDayPlannerBlocks(data)).toEqual([]);
  });

  it('creates unique block ids', () => {
    expect(createDayPlanBlockId()).toMatch(/^blk_\d+_[a-z0-9]+$/);
    expect(createDayPlanBlockId()).not.toBe(createDayPlanBlockId());
  });
});

describe('serialization', () => {
  it('drops blocks whose task no longer exists and keeps the rest', () => {
    const data = createEmptyProjectData('P');
    data.board.tasks.push(fromPartial({ id: 1, title: 'Kept', status: 'to-do' }));
    data.extensions.dayPlanner = {
      version: 1,
      blocks: [validBlock, { ...validBlock, id: 'blk-2', taskId: 99 }]
    };
    const serialized = serializeBoardDataFromObject(data);
    expect(serialized.extensions.dayPlanner).toEqual({ version: 1, blocks: [validBlock] });
  });

  it('removes the extension when no block survives', () => {
    const data = createEmptyProjectData('P');
    data.extensions.dayPlanner = { version: 1, blocks: [{ ...validBlock, taskId: 99 }] };
    expect(serializeBoardDataFromObject(data).extensions).not.toHaveProperty('dayPlanner');
  });
});

describe('layoutPlannerBlocks', () => {
  const b = (id: string, start: string, end: string) => ({ id, start, end });

  it('gives non-overlapping blocks the full width', () => {
    const layout = layoutPlannerBlocks([b('a', '09:00', '10:00'), b('b', '10:00', '11:00')]);
    expect(layout.get('a')).toEqual({ column: 0, columns: 1 });
    expect(layout.get('b')).toEqual({ column: 0, columns: 1 });
  });

  it('puts overlapping blocks side by side', () => {
    const layout = layoutPlannerBlocks([b('a', '09:00', '11:00'), b('b', '10:00', '12:00')]);
    expect(layout.get('a')).toEqual({ column: 0, columns: 2 });
    expect(layout.get('b')).toEqual({ column: 1, columns: 2 });
  });

  it('reuses a freed column inside the same overlap group', () => {
    const layout = layoutPlannerBlocks([
      b('long', '09:00', '12:00'),
      b('first', '09:00', '10:00'),
      b('second', '10:00', '11:00')
    ]);
    expect(layout.get('long')).toEqual({ column: 0, columns: 2 });
    expect(layout.get('first')).toEqual({ column: 1, columns: 2 });
    expect(layout.get('second')).toEqual({ column: 1, columns: 2 });
  });

  it('lays out separate overlap groups independently', () => {
    const layout = layoutPlannerBlocks([
      b('a', '09:00', '10:00'), b('b', '09:00', '10:00'), b('c', '13:00', '14:00')
    ]);
    expect(layout.get('c')).toEqual({ column: 0, columns: 1 });
    expect(layout.get('b')!.columns).toBe(2);
  });
});
