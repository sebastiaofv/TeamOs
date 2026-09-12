import { describe, it, expect } from 'vitest';
import {
  createEmptyTimelineData,
  createTimelineEventId,
  formatTimelineValue
} from '../../src/domain/timeline.js';
import { TIMELINE_VERSION } from '../../src/domain/constants.js';

describe('createEmptyTimelineData', () => {
  it('returns a fresh empty timeline shape at the current version', () => {
    expect(createEmptyTimelineData()).toEqual({
      version: TIMELINE_VERSION,
      baselineEventId: '',
      events: []
    });
  });

  it('returns a new object/array each call, not a shared reference', () => {
    const a = createEmptyTimelineData();
    const b = createEmptyTimelineData();
    expect(a).not.toBe(b);
    expect(a.events).not.toBe(b.events);
    a.events.push('x');
    expect(b.events).toEqual([]);
  });
});

describe('createTimelineEventId', () => {
  it('matches the evt_<timestamp>_<random> shape', () => {
    expect(createTimelineEventId()).toMatch(/^evt_\d+_[0-9a-z]{1,6}$/);
  });

  it('generates unique ids across many calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createTimelineEventId()));
    expect(ids.size).toBe(200);
  });
});

describe('formatTimelineValue', () => {
  it('renders undefined as (unset)', () => {
    expect(formatTimelineValue(undefined)).toBe('(unset)');
  });

  it('renders null as the literal string "null"', () => {
    expect(formatTimelineValue(null)).toBe('null');
  });

  it('renders an empty string as (empty)', () => {
    expect(formatTimelineValue('')).toBe('(empty)');
  });

  it('renders a non-empty string as-is', () => {
    expect(formatTimelineValue('In Progress')).toBe('In Progress');
  });

  it('stringifies numbers, including 0', () => {
    expect(formatTimelineValue(0)).toBe('0');
    expect(formatTimelineValue(42)).toBe('42');
  });

  it('stringifies booleans, including false', () => {
    expect(formatTimelineValue(false)).toBe('false');
    expect(formatTimelineValue(true)).toBe('true');
  });

  it('pretty-prints objects and arrays via JSON.stringify(value, null, 2)', () => {
    expect(formatTimelineValue({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
    expect(formatTimelineValue(['x', 'y'])).toBe(JSON.stringify(['x', 'y'], null, 2));
  });
});
