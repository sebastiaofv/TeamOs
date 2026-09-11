import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  hasExtendedBoardSettings,
  hasTitleOnlyBoardSettings,
  nextPortfolioProjectId,
  normalizeBoardArchiveFilter,
  normalizeColumns,
  normalizePortfolioSortDir,
  normalizePortfolioSortKey,
  normalizePortfolioViewMode,
  portfolioProjectColorKey,
  slugifyColumnName
} from '../../src/domain/board.js';

describe('hasExtendedBoardSettings', () => {
  it('returns true for exactly title/sortMode/showArchivedOnly', () => {
    expect(hasExtendedBoardSettings({ title: 'x', sortMode: 'y', showArchivedOnly: false })).toBe(true);
  });

  it('returns true for exactly title/sortMode/showArchivedOnly/archiveFilter', () => {
    expect(hasExtendedBoardSettings({
      title: 'x', sortMode: 'y', showArchivedOnly: false, archiveFilter: 'all'
    })).toBe(true);
  });

  it('returns false when a key is missing', () => {
    expect(hasExtendedBoardSettings({ title: 'x', sortMode: 'y' })).toBe(false);
  });

  it('returns false when an unexpected extra key is present', () => {
    expect(hasExtendedBoardSettings({
      title: 'x', sortMode: 'y', showArchivedOnly: false, extra: 1
    })).toBe(false);
  });
});

describe('hasTitleOnlyBoardSettings', () => {
  it('returns true for an object with exactly a title key', () => {
    expect(hasTitleOnlyBoardSettings({ title: 'x' })).toBe(true);
  });

  it('returns false when other keys are present', () => {
    expect(hasTitleOnlyBoardSettings({ title: 'x', sortMode: 'y' })).toBe(false);
  });

  it('returns false when title is missing', () => {
    expect(hasTitleOnlyBoardSettings({})).toBe(false);
  });
});

describe('nextPortfolioProjectId', () => {
  const originalRandom = Math.random;
  const originalNow = Date.now;

  afterEach(() => {
    Math.random = originalRandom;
    Date.now = originalNow;
  });

  it('combines a "p" prefix, the current timestamp, and a random suffix', () => {
    Date.now = () => 1700000000000;
    Math.random = () => 0.123456789;
    expect(nextPortfolioProjectId()).toBe('p17000000000004fzzzx');
  });

  it('produces different ids across calls (random suffix varies)', () => {
    const a = nextPortfolioProjectId();
    const b = nextPortfolioProjectId();
    expect(a).not.toBe(b);
  });

  it('always starts with "p" followed by digits', () => {
    expect(nextPortfolioProjectId()).toMatch(/^p\d+/);
  });
});

describe('normalizeBoardArchiveFilter', () => {
  it('maps true to "archived"', () => {
    expect(normalizeBoardArchiveFilter(true)).toBe('archived');
  });

  it('maps the string "1" to "archived"', () => {
    expect(normalizeBoardArchiveFilter('1')).toBe('archived');
  });

  it('maps "archived" to "archived"', () => {
    expect(normalizeBoardArchiveFilter('archived')).toBe('archived');
  });

  it('maps "all" to "all"', () => {
    expect(normalizeBoardArchiveFilter('all')).toBe('all');
  });

  it('falls back to "active" for anything else', () => {
    expect(normalizeBoardArchiveFilter('active')).toBe('active');
    expect(normalizeBoardArchiveFilter(undefined)).toBe('active');
    expect(normalizeBoardArchiveFilter(false)).toBe('active');
    expect(normalizeBoardArchiveFilter('0')).toBe('active');
  });
});

describe('normalizeColumns', () => {
  // Ported from tests/app.test.js (Playwright), which previously exercised
  // this via window.__legacyTestApi.normalizeColumns.
  it('keeps valid canonical columns and removes duplicates', () => {
    const columns = normalizeColumns([
      { status: 'Backlog', title: 'Ideas' },
      { status: 'todo', title: 'Ready' },
      { status: 'to-do', title: 'Duplicate todo' },
      { status: 'in-progress', title: 'Working' },
      { status: 'done', title: '' },
      { status: 'custom', title: 'Ignored custom' }
    ]);

    expect(columns).toEqual([
      { status: 'backlog', title: 'Ideas' },
      { status: 'to-do', title: 'Ready' },
      { status: 'doing', title: 'Working' },
      { status: 'done', title: 'done' }
    ]);
  });

  it('falls back to defaults when no valid columns are provided', () => {
    const columns = normalizeColumns([null, {}, { status: '', title: '' }]);

    expect(columns).toEqual([
      { status: 'backlog', title: 'backlog' },
      { status: 'to-do', title: 'to-do' },
      { status: 'doing', title: 'in progress' },
      { status: 'done', title: 'done' }
    ]);
  });

  it('falls back to defaults when input is not an array', () => {
    expect(normalizeColumns(null)).toEqual([
      { status: 'backlog', title: 'backlog' },
      { status: 'to-do', title: 'to-do' },
      { status: 'doing', title: 'in progress' },
      { status: 'done', title: 'done' }
    ]);
    expect(normalizeColumns(undefined)).toHaveLength(4);
    expect(normalizeColumns('nope')).toHaveLength(4);
  });

  it('falls back to defaults for an empty array', () => {
    expect(normalizeColumns([])).toHaveLength(4);
  });

  it('returns fresh objects for the default fallback, not shared references', () => {
    const a = normalizeColumns([]);
    const b = normalizeColumns([]);
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
  });

  it('trims a provided title and falls back to the default title when blank', () => {
    const columns = normalizeColumns([{ status: 'backlog', title: '   ' }]);
    expect(columns).toEqual([{ status: 'backlog', title: 'backlog' }]);
  });

  it('keeps only the first occurrence of a duplicated status', () => {
    const columns = normalizeColumns([
      { status: 'backlog', title: 'First' },
      { status: 'backlog', title: 'Second' }
    ]);
    expect(columns).toEqual([{ status: 'backlog', title: 'First' }]);
  });
});

describe('normalizePortfolioSortDir', () => {
  it('keeps "desc"', () => {
    expect(normalizePortfolioSortDir('desc')).toBe('desc');
  });

  it('defaults to "asc" for anything else', () => {
    expect(normalizePortfolioSortDir('asc')).toBe('asc');
    expect(normalizePortfolioSortDir(undefined)).toBe('asc');
    expect(normalizePortfolioSortDir('DESC')).toBe('asc');
  });
});

describe('normalizePortfolioSortKey', () => {
  it('keeps each recognized sort key', () => {
    ['board', 'task', 'column', 'priority', 'effort', 'score', 'dueDate', 'updatedAt'].forEach((key) => {
      expect(normalizePortfolioSortKey(key)).toBe(key);
    });
  });

  it('defaults to "priority" for an unrecognized value', () => {
    expect(normalizePortfolioSortKey('bogus')).toBe('priority');
    expect(normalizePortfolioSortKey(undefined)).toBe('priority');
  });
});

describe('normalizePortfolioViewMode', () => {
  it('keeps "roadmap"', () => {
    expect(normalizePortfolioViewMode('roadmap')).toBe('roadmap');
  });

  it('keeps "calendar"', () => {
    expect(normalizePortfolioViewMode('calendar')).toBe('calendar');
  });

  it('defaults to "board" for anything else', () => {
    expect(normalizePortfolioViewMode('board')).toBe('board');
    expect(normalizePortfolioViewMode(undefined)).toBe('board');
    expect(normalizePortfolioViewMode('bogus')).toBe('board');
  });
});

describe('portfolioProjectColorKey', () => {
  it('joins bg/border/text with "|"', () => {
    expect(portfolioProjectColorKey({ bg: 'a', border: 'b', text: 'c' })).toBe('a|b|c');
  });

  it('returns an empty string for a falsy color', () => {
    expect(portfolioProjectColorKey(null)).toBe('');
    expect(portfolioProjectColorKey(undefined)).toBe('');
  });
});

describe('slugifyColumnName', () => {
  it('lowercases, trims, and dashes non-alphanumeric runs', () => {
    expect(slugifyColumnName('  My Column!! ')).toBe('my-column');
  });

  it('strips leading and trailing dashes produced by punctuation', () => {
    expect(slugifyColumnName('---weird---name---')).toBe('weird-name');
  });

  it('collapses consecutive separators into a single dash', () => {
    expect(slugifyColumnName('a   b')).toBe('a-b');
  });
});
