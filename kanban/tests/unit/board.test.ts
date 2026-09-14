import { fromAny } from '@total-typescript/shoehorn';
import { describe, it, expect, afterEach } from 'vitest';
import {
  createEmptyProjectData,
  createPortfolioProjectColor,
  hasExtendedBoardSettings,
  hasTitleOnlyBoardSettings,
  isAcceptedBoardSettingsShape,
  nextPortfolioProjectId,
  normalizeColumns,
  validateBoardData,
  comparePortfolioRows,
  normalizePortfolioSortDir,
  normalizePortfolioSortKey,
  normalizePortfolioViewMode,
  portfolioProjectColorKey,
  slugifyColumnName
} from '../../src/domain/board';
import { BOARD_APP_ID, BOARD_SCHEMA_VERSION, MAX_COLUMNS, TASK_TITLE_MAX_LENGTH } from '../../src/domain/constants';


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
    // validateBoardData is now a real module, so assert against it directly
    // rather than against a local re-implementation of its rules.
    expect(() => validateBoardData(createEmptyProjectData('My Project'))).not.toThrow();
    expect(() => validateBoardData(createEmptyProjectData(''))).not.toThrow();
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

describe('validateBoardData', () => {
  // The smallest board that passes validation.
  const validBoard = () => ({
    meta: {
      schemaVersion: BOARD_SCHEMA_VERSION,
      appId: BOARD_APP_ID,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    },
    board: {
      columns: [
        { status: 'backlog', title: 'backlog' },
        { status: 'to-do', title: 'to-do' }
      ],
      tasks: [],
      settings: { title: 'Test Board' }
    },
    extensions: {}
  });

  // validateBoardData requires every one of these 10 keys on a task; anything
  // missing fails the structural check before any field-specific check runs.
  const validTask = (over = {}) => ({
    id: 1,
    title: 'A task',
    description: '',
    checklist: [],
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    dueDate: '',
    priority: null,
    status: 'backlog',
    ...over
  });

  it('accepts a well-formed board', () => {
    expect(() => validateBoardData(validBoard())).not.toThrow();
  });

  it('accepts a board with a well-formed task', () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask())];
    expect(() => validateBoardData(b)).not.toThrow();
  });

  it('rejects a task missing a required key', () => {
    const b = validBoard();
    const t: any = validTask();
    delete t.description;
    b.board.tasks = [fromAny(t)];
    expect(() => validateBoardData(b)).toThrow('Invalid task structure.');
  });

  it('rejects a task carrying an unknown key', () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask({ bogusField: 1 }))];
    expect(() => validateBoardData(b)).toThrow('Invalid task structure.');
  });

  it('rejects a null or non-object root', () => {
    expect(() => validateBoardData(null)).toThrow('Invalid file root structure.');
    expect(() => validateBoardData('nope')).toThrow('Invalid file root structure.');
  });

  it('rejects a root missing one of meta/board/extensions', () => {
    const b: any = validBoard();
    delete b.meta;
    // The root exact-key check runs before the meta-shape check.
    expect(() => validateBoardData(b)).toThrow('Invalid file root structure.');
  });

  it('rejects a non-object meta block', () => {
    const b = validBoard();
    (b.meta as any) = 'nope';
    expect(() => validateBoardData(b)).toThrow('Invalid meta structure.');
  });

  it('rejects an unsupported schemaVersion', () => {
    const b = validBoard();
    b.meta.schemaVersion = 999;
    expect(() => validateBoardData(b)).toThrow(/Unsupported schemaVersion/);
  });

  it('rejects a foreign appId', () => {
    const b = validBoard();
    b.meta.appId = 'some-other-app';
    expect(() => validateBoardData(b)).toThrow('Invalid appId.');
  });

  it('rejects a board with no columns', () => {
    const b = validBoard();
    b.board.columns = [];
    expect(() => validateBoardData(b)).toThrow('Board must include at least one column.');
  });

  it('rejects more columns than MAX_COLUMNS', () => {
    const b = validBoard();
    b.board.columns = Array.from({ length: MAX_COLUMNS + 1 }, (_, i) => ({
      status: `s${i}`, title: `t${i}`
    }));
    expect(() => validateBoardData(b)).toThrow(/cannot have more than/);
  });

  it('rejects duplicate column statuses', () => {
    const b = validBoard();
    b.board.columns = [
      { status: 'backlog', title: 'one' },
      { status: 'backlog', title: 'two' }
    ];
    expect(() => validateBoardData(b)).toThrow('Column statuses must be unique.');
  });

  it('rejects tasks that are not an array', () => {
    const b = validBoard();
    (b.board.tasks as any) = {};
    expect(() => validateBoardData(b)).toThrow('Board tasks must be an array.');
  });

  it('rejects a non-numeric task id', () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask({ id: 'abc' }))];
    expect(() => validateBoardData(b)).toThrow('Task id must be a number.');
  });

  it('rejects an empty task title', () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask({ title: '' }))];
    expect(() => validateBoardData(b)).toThrow('Task title must be a non-empty string.');
  });

  it(`rejects a task title longer than ${TASK_TITLE_MAX_LENGTH} characters`, () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask({ title: 'x'.repeat(TASK_TITLE_MAX_LENGTH + 1) }))];
    expect(() => validateBoardData(b)).toThrow(/characters or fewer/);
  });

  it('accepts a task title of exactly the maximum length', () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask({ title: 'x'.repeat(TASK_TITLE_MAX_LENGTH) }))];
    expect(() => validateBoardData(b)).not.toThrow();
  });

  it('rejects a non-boolean archived flag', () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask({ archived: 'yes' }))];
    expect(() => validateBoardData(b)).toThrow('Task archived must be boolean.');
  });

  it('rejects a malformed dueDate', () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask({ dueDate: '01/02/2026' }))];
    expect(() => validateBoardData(b)).toThrow(/dueDate must be YYYY-MM-DD/);
  });

  it('accepts null priority but rejects an empty string', () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask({ priority: null }))];
    expect(() => validateBoardData(b)).not.toThrow();
    b.board.tasks = [fromAny(validTask({ priority: '' }))];
    expect(() => validateBoardData(b)).toThrow('Task priority is invalid.');
  });

  it('rejects an invalid priority', () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask({ priority: 'urgent' }))];
    expect(() => validateBoardData(b)).toThrow('Task priority is invalid.');
  });

  it('rejects an invalid effort bucket', () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask({ effort: 'XXL' }))];
    expect(() => validateBoardData(b)).toThrow('Task effort is invalid.');
  });

  it('rejects a non-array checklist', () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask({ checklist: 'a,b' }))];
    expect(() => validateBoardData(b)).toThrow('Task checklist must be an array.');
  });

  it('rejects a non-string-array assignees list', () => {
    const b = validBoard();
    b.board.tasks = [fromAny(validTask({ assignees: [1, 2] }))];
    expect(() => validateBoardData(b)).toThrow('Task assignees must be a string array.');
  });

  it('rejects a malformed settings block', () => {
    const b = validBoard();
    (b.board.settings as any) = 'Test Board';
    expect(() => validateBoardData(b)).toThrow('Invalid board.settings structure.');
  });

  it('rejects a malformed extensions block', () => {
    const b = validBoard();
    b.extensions = 'none';
    expect(() => validateBoardData(b)).toThrow('Invalid extensions structure.');
  });
});

describe('comparePortfolioRows', () => {
  // Rows are portfolio rows: a board-level wrapper around a nested task.
  const row = (task = {}, over = {}) => ({
    boardTitle: 'Board',
    boardFileName: 'b.board.json',
    task: { title: 'A', status: 'backlog', priority: null, effort: null, dueDate: '', ...task },
    ...over
  });

  it('orders by column (status) rank ascending', () => {
    expect(comparePortfolioRows(fromAny(row({ status: 'backlog' })), fromAny(row({ status: 'done' })), 'column', 'asc'))
      .toBeLessThan(0);
  });

  it('reverses when direction is desc', () => {
    const asc = comparePortfolioRows(fromAny(row({ status: 'backlog' })), fromAny(row({ status: 'done' })), 'column', 'asc');
    const desc = comparePortfolioRows(fromAny(row({ status: 'backlog' })), fromAny(row({ status: 'done' })), 'column', 'desc');
    expect(Math.sign(asc)).toBe(-Math.sign(desc));
  });

  it('orders by task title when sorting by task', () => {
    expect(comparePortfolioRows(fromAny(row({ title: 'Alpha' })), fromAny(row({ title: 'Beta' })), 'task', 'asc'))
      .toBeLessThan(0);
  });

  it('sorts rows with no score after rows that have one', () => {
    const scored = row({ priority: 'high', effort: 'M' });
    const unscored = row({ priority: null, effort: null });
    expect(comparePortfolioRows(fromAny(scored), fromAny(unscored), 'score', 'asc')).toBeLessThan(0);
    expect(comparePortfolioRows(fromAny(unscored), fromAny(scored), 'score', 'asc')).toBeGreaterThan(0);
  });

  it('is antisymmetric for differing rows', () => {
    const a = row({ status: 'backlog' });
    const b = row({ status: 'doing' });
    expect(Math.sign(comparePortfolioRows(fromAny(a), fromAny(b), 'column', 'asc')))
      .toBe(-Math.sign(comparePortfolioRows(fromAny(b), fromAny(a), 'column', 'asc')));
  });
});
