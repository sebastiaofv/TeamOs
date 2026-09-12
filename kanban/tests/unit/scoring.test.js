import { describe, it, expect } from 'vitest';
import {
  effortRank,
  effortScoreValue,
  priorityRank,
  priorityScoreValue
} from '../../src/domain/scoring.js';

describe('effortRank', () => {
  it('ranks effort buckets in ascending order XS..XL', () => {
    expect(effortRank('XS')).toBe(0);
    expect(effortRank('S')).toBe(1);
    expect(effortRank('M')).toBe(2);
    expect(effortRank('L')).toBe(3);
    expect(effortRank('XL')).toBe(4);
  });

  it('normalizes case and whitespace before ranking, unlike priorityRank', () => {
    expect(effortRank('  m ')).toBe(2);
    expect(effortRank('xl')).toBe(4);
  });

  it('returns EFFORT_BUCKETS.length (5) for an unrecognized or missing effort', () => {
    expect(effortRank('HUGE')).toBe(5);
    expect(effortRank(null)).toBe(5);
    expect(effortRank(undefined)).toBe(5);
    expect(effortRank('')).toBe(5);
  });
});

describe('effortScoreValue', () => {
  it('maps each bucket to its point value: XS=1, S=2, M=3, L=5, XL=8', () => {
    expect(effortScoreValue('XS')).toBe(1);
    expect(effortScoreValue('S')).toBe(2);
    expect(effortScoreValue('M')).toBe(3);
    expect(effortScoreValue('L')).toBe(5);
    expect(effortScoreValue('XL')).toBe(8);
  });

  it('normalizes case and whitespace via normalizeEffort before mapping', () => {
    expect(effortScoreValue('  xs ')).toBe(1);
    expect(effortScoreValue('l')).toBe(5);
  });

  it('falls back to 0 for an unrecognized or missing effort', () => {
    expect(effortScoreValue('HUGE')).toBe(0);
    expect(effortScoreValue(null)).toBe(0);
    expect(effortScoreValue(undefined)).toBe(0);
  });
});

describe('priorityRank', () => {
  it('ranks high before medium before low', () => {
    expect(priorityRank('high')).toBe(0);
    expect(priorityRank('medium')).toBe(1);
    expect(priorityRank('low')).toBe(2);
  });

  it('ranks any unrecognized value, including missing priority, last (3)', () => {
    expect(priorityRank('urgent')).toBe(3);
    expect(priorityRank(null)).toBe(3);
    expect(priorityRank(undefined)).toBe(3);
  });

  it('does not normalize case, unlike effortRank (comparison is against literal lowercase strings)', () => {
    expect(priorityRank('HIGH')).toBe(3);
    expect(priorityRank('High')).toBe(3);
  });
});

describe('priorityScoreValue', () => {
  it('maps priority to a descending score: high=3, medium=2, low=1', () => {
    expect(priorityScoreValue('high')).toBe(3);
    expect(priorityScoreValue('medium')).toBe(2);
    expect(priorityScoreValue('low')).toBe(1);
  });

  it('falls back to 0 for an unrecognized or missing priority', () => {
    expect(priorityScoreValue('urgent')).toBe(0);
    expect(priorityScoreValue(null)).toBe(0);
    expect(priorityScoreValue(undefined)).toBe(0);
  });

  it('does not normalize case (comparison is against literal lowercase strings)', () => {
    expect(priorityScoreValue('HIGH')).toBe(0);
  });
});
