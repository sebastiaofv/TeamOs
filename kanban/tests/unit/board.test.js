import { describe, it, expect, afterEach } from 'vitest';
import {
  createEmptyProjectData,
  createPortfolioProjectColor,
  hasExtendedBoardSettings,
  hasTitleOnlyBoardSettings,
  isAcceptedBoardSettingsShape,
  nextPortfolioProjectId,
  normalizeBoardArchiveFilter,
  normalizeColumns,
  normalizePortfolioSortDir,
  normalizePortfolioSortKey,
  normalizePortfolioViewMode,
  portfolioProjectColorKey,
  slugifyColumnName
} from '../../src/domain/board.js';
import { BOARD_APP_ID, BOARD_SCHEMA_VERSION, MAX_COLUMNS } from '../../src/domain/constants.js';
import { hasExactKeys } from '../../src/domain/util.js';

// Mirrors the structural checks validateBoardData (src/legacy/main.js, not
// yet extracted) performs on the parts of a project's shape that
// createEmptyProjectData actually produces -- built from the same exported
// primitives validateBoardData itself uses (hasExactKeys,
// isAcceptedBoardSettingsShape) plus its own literal constants, so this
// stays a faithful proxy for "would validateBoardData accept this" without
// importing src/legacy/main.js (which has document/window side effects at
// module scope and cannot run under vitest's node environment).
function assertPassesBoardValidationShape(data) {
  expect(hasExactKeys(data, ['meta', 'board', 'extensions'])).toBe(true);
  expect(hasExactKeys(data.meta, ['schemaVersion', 'appId', 'createdAt', 'updatedAt'])).toBe(true);
  expect(data.meta.schemaVersion).toBe(BOARD_SCHEMA_VERSION);
  expect(data.meta.appId).toBe(BOARD_APP_ID);
  expect(Number.isNaN(Date.parse(data.meta.createdAt))).toBe(false);
  expect(Number.isNaN(Date.parse(data.meta.updatedAt))).toBe(false);
  expect(hasExactKeys(data.board, ['columns', 'tasks', 'settings'])).toBe(true);
  expect(Array.isArray(data.board.columns)).toBe(true);
  expect(data.board.columns.length).toBeGreaterThan(0);
  expect(data.board.columns.length).toBeLessThanOrEqual(MAX_COLUMNS);
  const statuses = new Set();
  data.board.columns.forEach((col) => {
    expect(hasExactKeys(col, ['status', 'title'])).toBe(true);
    expect(typeof col.status === 'string' && col.status.trim().length > 0).toBe(true);
    expect(typeof col.title === 'string' && col.title.trim().length > 0).toBe(true);
    expect(statuses.has(col.status)).toBe(false);
    statuses.add(col.status);
  });
  expect(Array.isArray(data.board.tasks)).toBe(true);
  expect(isAcceptedBoardSettingsShape(data.board.settings)).toBe(true);
}

describe('createPortfolioProjectColor', () => {
  it('is deterministic: the same seed and offset always produce the same color', () => {
    expect(createPortfolioProjectColor(1)).toEqual(createPortfolioProjectColor(1));
  });

  it('derives an exact hsl triple from seed 0 / default offset', () => {
    // baseSeed = max(0, 0) + 0 = 0, so hue = 0 and every % is against 0.
    expect(createPortfolioProjectColor(0)).toEqual({
      bg: 'hsl(0 62% 95%)',
      border: 'hsl(0 50% 78%)',
      text: 'hsl(0 70% 28%)'
    });
  });

  it('derives an exact hsl triple from seed 1 / default offset', () => {
    expect(createPortfolioProjectColor(1)).toEqual({
      bg: 'hsl(137.508 67% 94%)',
      border: 'hsl(137.508 55% 74%)',
      text: 'hsl(137.508 75% 24%)'
    });
  });

  it('produces different colors for different seeds', () => {
    expect(createPortfolioProjectColor(1)).not.toEqual(createPortfolioProjectColor(2));
  });

  it('shifts the result when offset changes (baseSeed includes offset * 997)', () => {
    const withoutOffset = createPortfolioProjectColor(0);
    const withOffset = createPortfolioProjectColor(0, 1);
    expect(withOffset).not.toEqual(withoutOffset);
    // baseSeed = max(0, 0) + 1 * 997 = 997, hand-derived hue/saturation/lightness below.
    expect(withOffset).toEqual({
      bg: 'hsl(295.241 67% 94%)',
      border: 'hsl(295.241 55% 74%)',
      text: 'hsl(295.241 75% 24%)'
    });
  });

  it('treats a non-numeric seed as 0 (Number(seed) || 0 falls back to 0 for NaN)', () => {
    expect(createPortfolioProjectColor('not-a-number')).toEqual(createPortfolioProjectColor(0));
  });

  it('clamps a negative seed to 0 (Math.max(0, ...))', () => {
    expect(createPortfolioProjectColor(-5)).toEqual(createPortfolioProjectColor(0));
  });
});

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

describe('createEmptyProjectData', () => {
  it('produces a board that satisfies validateBoardData\'s structural checks', () => {
    assertPassesBoardValidationShape(createEmptyProjectData('My Project'));
    assertPassesBoardValidationShape(createEmptyProjectData(''));
  });

  it('sets meta.schemaVersion to 1 and meta.appId to teamos-kanban', () => {
    const data = createEmptyProjectData('Title');
    expect(data.meta.schemaVersion).toBe(1);
    expect(data.meta.appId).toBe('teamos-kanban');
  });

  it('trims the given title into board.settings.title', () => {
    expect(createEmptyProjectData('  My Project  ').board.settings.title).toBe('My Project');
  });

  it('defaults the title to "Untitled Project" when blank or missing', () => {
    expect(createEmptyProjectData('').board.settings.title).toBe('Untitled Project');
    expect(createEmptyProjectData('   ').board.settings.title).toBe('Untitled Project');
    expect(createEmptyProjectData(undefined).board.settings.title).toBe('Untitled Project');
  });

  it('starts with no tasks and no extensions', () => {
    const data = createEmptyProjectData('Title');
    expect(data.board.tasks).toEqual([]);
    expect(data.extensions).toEqual({});
  });

  it('sets createdAt and updatedAt to the same timestamp', () => {
    const data = createEmptyProjectData('Title');
    expect(data.meta.createdAt).toBe(data.meta.updatedAt);
  });

  it('derives board.columns from the default columns via normalizeColumns, keeping only status/title', () => {
    const data = createEmptyProjectData('Title');
    const expected = normalizeColumns(undefined).map((col) => ({ status: col.status, title: col.title }));
    expect(data.board.columns).toEqual(expected);
    expect(data.board.columns.every((col) => Object.keys(col).sort().join(',') === 'status,title')).toBe(true);
  });
});

describe('isAcceptedBoardSettingsShape', () => {
  it('accepts title-only settings', () => {
    expect(isAcceptedBoardSettingsShape({ title: 'Board' })).toBe(true);
  });

  it('accepts extended settings without archiveFilter', () => {
    expect(isAcceptedBoardSettingsShape({ title: 'Board', sortMode: 'manual', showArchivedOnly: false })).toBe(true);
  });

  it('accepts extended settings with archiveFilter', () => {
    expect(isAcceptedBoardSettingsShape({
      title: 'Board',
      sortMode: 'manual',
      showArchivedOnly: false,
      archiveFilter: 'all'
    })).toBe(true);
  });

  it('rejects settings missing the required title key', () => {
    expect(isAcceptedBoardSettingsShape({ sortMode: 'manual', showArchivedOnly: false })).toBe(false);
  });

  it('rejects settings with an extra, unrecognized key', () => {
    expect(isAcceptedBoardSettingsShape({ title: 'Board', extra: true })).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(isAcceptedBoardSettingsShape(null)).toBe(false);
    expect(isAcceptedBoardSettingsShape(undefined)).toBe(false);
    expect(isAcceptedBoardSettingsShape('title')).toBe(false);
  });
});
