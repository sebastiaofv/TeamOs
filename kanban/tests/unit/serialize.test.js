import { describe, it, expect } from 'vitest';
import {
  normalizeBoardExtensionsValue,
  areSerializableValuesEqual,
  cloneSerializable,
  getBoardExtensionsObject,
  hashTextContent,
  getTeamOsExtensionsObject,
  createBoardStateSnapshot,
  serializeBoardDataFromObject
} from '../../src/domain/serialize.js';
import { validateBoardData } from '../../src/domain/board.js';
import { BOARD_SCHEMA_VERSION, BOARD_APP_ID, DEFAULT_BOARD_TITLE } from '../../src/domain/constants.js';

describe('cloneSerializable', () => {
  it('returns undefined for undefined (special-cased ahead of the JSON round-trip)', () => {
    expect(cloneSerializable(undefined)).toBe(undefined);
  });

  it('round-trips null', () => {
    expect(cloneSerializable(null)).toBe(null);
  });

  it('produces a genuinely deep clone: mutating the clone leaves the original untouched', () => {
    const original = { nested: { list: [1, 2, { deep: 'value' }] } };
    const clone = cloneSerializable(original);
    clone.nested.list[2].deep = 'mutated';
    clone.nested.list.push(99);
    expect(original.nested.list[2].deep).toBe('value');
    expect(original.nested.list).toHaveLength(3);
    expect(clone).not.toBe(original);
    expect(clone.nested).not.toBe(original.nested);
  });

  it('clones arrays deeply, independent of the original', () => {
    const original = [{ a: 1 }, { a: 2 }];
    const clone = cloneSerializable(original);
    expect(clone).toEqual(original);
    clone[0].a = 999;
    expect(original[0].a).toBe(1);
  });

  it('drops function-valued properties, since JSON.stringify omits them', () => {
    const original = { keep: 'value', fn: function namedFn() {} };
    expect(cloneSerializable(original)).toEqual({ keep: 'value' });
  });

  it('throws when cloning a bare function, because JSON.stringify(fn) is undefined and JSON.parse(undefined) is invalid JSON', () => {
    expect(() => cloneSerializable(function () {})).toThrow(SyntaxError);
  });

  it('turns a Date into its ISO string, because Date defines toJSON', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const cloned = cloneSerializable(date);
    expect(cloned).toBe('2024-01-01T00:00:00.000Z');
    expect(cloned).not.toBeInstanceOf(Date);
  });

  it('reduces a Map to an empty plain object, since Map has no enumerable own properties', () => {
    const map = new Map([['a', 1]]);
    expect(cloneSerializable(map)).toEqual({});
  });
});

describe('areSerializableValuesEqual', () => {
  it('treats deeply-equal nested structures as equal', () => {
    const a = { id: 1, tags: ['x', 'y'], meta: { nested: [1, 2, 3] } };
    const b = { id: 1, tags: ['x', 'y'], meta: { nested: [1, 2, 3] } };
    expect(areSerializableValuesEqual(a, b)).toBe(true);
  });

  it('detects a difference buried deep inside otherwise-identical structures', () => {
    const a = { id: 1, meta: { nested: [1, 2, 3] } };
    const b = { id: 1, meta: { nested: [1, 2, 4] } };
    expect(areSerializableValuesEqual(a, b)).toBe(false);
  });

  it('treats differing key order as NOT equal, because JSON.stringify preserves insertion order', () => {
    const a = { a: 1, b: 2 };
    const b = { b: 2, a: 1 };
    expect(areSerializableValuesEqual(a, b)).toBe(false);
  });

  it('treats undefined and undefined as equal', () => {
    expect(areSerializableValuesEqual(undefined, undefined)).toBe(true);
  });

  it('treats null and undefined as different (JSON.stringify(undefined) is undefined, not a string)', () => {
    expect(areSerializableValuesEqual(null, undefined)).toBe(false);
  });
});

describe('hashTextContent', () => {
  it('is stable for identical input', () => {
    expect(hashTextContent('hello world')).toBe(hashTextContent('hello world'));
  });

  it('produces different hashes for different input', () => {
    expect(hashTextContent('hello')).not.toBe(hashTextContent('world'));
  });

  it('returns a fixed hash for the empty string (loop never runs, FNV offset basis in hex)', () => {
    expect(hashTextContent('')).toBe('h811c9dc5');
  });

  it('coerces null/undefined to the empty string via String(text ?? "")', () => {
    expect(hashTextContent(null)).toBe('h811c9dc5');
    expect(hashTextContent(undefined)).toBe('h811c9dc5');
  });

  it('coerces non-string input to a string before hashing', () => {
    expect(hashTextContent(123)).toBe(hashTextContent('123'));
  });
});

describe('getBoardExtensionsObject', () => {
  it('returns null when boardData is not a plain object', () => {
    expect(getBoardExtensionsObject(null)).toBe(null);
    expect(getBoardExtensionsObject(undefined)).toBe(null);
    expect(getBoardExtensionsObject('board')).toBe(null);
    expect(getBoardExtensionsObject([])).toBe(null);
  });

  it('returns null when extensions is missing and create is not requested', () => {
    expect(getBoardExtensionsObject({})).toBe(null);
  });

  it('creates and returns an empty extensions object when create is true and it is missing', () => {
    const board = {};
    const extensions = getBoardExtensionsObject(board, { create: true });
    expect(extensions).toEqual({});
    expect(board.extensions).toBe(extensions);
  });

  it('replaces a non-object extensions value (e.g. an array) with {} when create is true', () => {
    const board = { extensions: [1, 2, 3] };
    const extensions = getBoardExtensionsObject(board, { create: true });
    expect(extensions).toEqual({});
    expect(board.extensions).toBe(extensions);
  });

  it('returns null for an array-valued extensions when create is false', () => {
    expect(getBoardExtensionsObject({ extensions: [] })).toBe(null);
  });

  it('returns the existing extensions object unchanged when it is already valid', () => {
    const existing = { foo: 'bar' };
    const board = { extensions: existing };
    expect(getBoardExtensionsObject(board)).toBe(existing);
  });
});

describe('getTeamOsExtensionsObject', () => {
  it('returns null when boardData has no extensions and create is not requested', () => {
    expect(getTeamOsExtensionsObject({})).toBeNull();
  });

  it('returns null when boardData is not a plain object and create is not requested', () => {
    expect(getTeamOsExtensionsObject(null)).toBeNull();
    expect(getTeamOsExtensionsObject('board')).toBeNull();
  });

  it('returns null when extensions exists but has no teamOsKanban key and create is not requested', () => {
    expect(getTeamOsExtensionsObject({ extensions: {} })).toBeNull();
  });

  it('returns null when teamOsKanban is a non-object value (e.g. array) and create is not requested', () => {
    expect(getTeamOsExtensionsObject({ extensions: { teamOsKanban: [] } })).toBeNull();
    expect(getTeamOsExtensionsObject({ extensions: { teamOsKanban: 'x' } })).toBeNull();
  });

  it('returns the existing teamOsKanban object unchanged when it is already valid', () => {
    const existing = { attachments: {} };
    const board = { extensions: { teamOsKanban: existing } };
    expect(getTeamOsExtensionsObject(board)).toBe(existing);
  });

  it('creates extensions and teamOsKanban from scratch when create is true', () => {
    const board = {};
    const result = getTeamOsExtensionsObject(board, { create: true });
    expect(result).toEqual({});
    expect(board.extensions.teamOsKanban).toBe(result);
  });

  it('creates teamOsKanban in place when extensions already exists but teamOsKanban does not, when create is true', () => {
    const board = { extensions: { other: 'keep' } };
    const result = getTeamOsExtensionsObject(board, { create: true });
    expect(result).toEqual({});
    expect(board.extensions).toEqual({ other: 'keep', teamOsKanban: {} });
  });

  it('replaces a non-object teamOsKanban (e.g. an array) with {} when create is true', () => {
    const board = { extensions: { teamOsKanban: [1, 2] } };
    const result = getTeamOsExtensionsObject(board, { create: true });
    expect(result).toEqual({});
    expect(board.extensions.teamOsKanban).toBe(result);
  });
});

describe('normalizeBoardExtensionsValue', () => {
  it('returns an empty object for null or non-object input', () => {
    expect(normalizeBoardExtensionsValue(null)).toEqual({});
    expect(normalizeBoardExtensionsValue('nope')).toEqual({});
    expect(normalizeBoardExtensionsValue([1, 2])).toEqual({});
  });

  it('does not mutate the input object', () => {
    const input = { roadmap: { version: 1, phases: [], milestones: [], sprints: [] } };
    const snapshot = JSON.stringify(input);
    normalizeBoardExtensionsValue(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('drops a roadmap extension that fails normalization', () => {
    const out = normalizeBoardExtensionsValue({ roadmap: 'garbage' });
    expect('roadmap' in out).toBe(false);
  });

  it('drops the timeline extension when includeTimeline is false', () => {
    const out = normalizeBoardExtensionsValue(
      { timeline: { version: 1, baselineEventId: 'b1', events: [] } },
      { includeTimeline: false }
    );
    expect('timeline' in out).toBe(false);
  });

  it('preserves unrelated extension keys', () => {
    expect(normalizeBoardExtensionsValue({ somethingElse: { a: 1 } }).somethingElse).toEqual({ a: 1 });
  });
});

// Minimal well-formed input accepted by serializeBoardDataFromObject /
// createBoardStateSnapshot: an already-parsed *.board.json-shaped object.
const rawBoardInput = () => ({
  meta: {
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z'
  },
  board: {
    columns: [
      { status: 'backlog', title: 'backlog' },
      { status: 'to-do', title: 'to-do' }
    ],
    tasks: [
      {
        id: 1,
        title: 'Task One',
        status: 'backlog',
        priority: 'URGENT', // invalid -> normalizePriority should drop it to null
        tags: ['Dup', 'dup', 42, 'ok'],
        checklist: [{ text: 'step', done: true }, { text: '  ', done: false }]
      }
    ],
    settings: { title: 'My Board' }
  },
  extensions: {}
});

describe('serializeBoardDataFromObject', () => {
  it('produces output that passes validateBoardData', () => {
    expect(() => validateBoardData(serializeBoardDataFromObject(rawBoardInput()))).not.toThrow();
  });

  it('stamps meta.schemaVersion and meta.appId', () => {
    const out = serializeBoardDataFromObject(rawBoardInput());
    expect(out.meta.schemaVersion).toBe(BOARD_SCHEMA_VERSION);
    expect(out.meta.schemaVersion).toBe(1);
    expect(out.meta.appId).toBe(BOARD_APP_ID);
    expect(out.meta.appId).toBe('teamos-kanban');
  });

  it('always stamps meta.updatedAt to now, regardless of input meta.updatedAt', () => {
    const out = serializeBoardDataFromObject(rawBoardInput());
    // "now" per nowIso() at call time - assert it's a valid, recent timestamp
    // rather than exactly equal to Date.now() (avoids flakiness).
    const ageMs = Date.now() - new Date(out.meta.updatedAt).getTime();
    expect(ageMs).toBeGreaterThanOrEqual(0);
    expect(ageMs).toBeLessThan(5000);
    expect(out.meta.updatedAt).not.toBe('2026-01-02T00:00:00.000Z');
  });

  it('normalizes tasks on the way out: invalid priority, deduped/lowercased tags, blank checklist entry dropped', () => {
    const out = serializeBoardDataFromObject(rawBoardInput());
    const task = out.board.tasks[0];
    expect(task.priority).toBeNull();
    expect(task.tags).toEqual(['dup', 'ok']);
    expect(task.checklist).toEqual([{ text: 'step', done: true }]);
    // includeStatusChangedAt: false -> the key must not appear at all.
    expect('statusChangedAt' in task).toBe(false);
  });

  it('falls back to DEFAULT_BOARD_TITLE when board.settings.title is missing or blank', () => {
    const input = rawBoardInput();
    input.board.settings.title = '   ';
    const out = serializeBoardDataFromObject(input);
    expect(out.board.settings.title).toBe(DEFAULT_BOARD_TITLE);

    delete input.board.settings.title;
    const out2 = serializeBoardDataFromObject(input);
    expect(out2.board.settings.title).toBe(DEFAULT_BOARD_TITLE);
  });

  it('cleans legacy per-task attachment storage out of extensions', () => {
    const input = rawBoardInput();
    input.extensions = {
      teamOsKanban: {
        taskAttachments: { 1: [{ id: 'a1', name: 'file.png' }] }
      }
    };
    const out = serializeBoardDataFromObject(input);
    expect(out.extensions.teamOsKanban).toBeUndefined();
  });

  it('round-trips: serializing an already-serialized board still validates', () => {
    const once = serializeBoardDataFromObject(rawBoardInput());
    const twice = serializeBoardDataFromObject(once);
    expect(() => validateBoardData(twice)).not.toThrow();
  });

  it('falls back to defaultColumns when board.columns is not an array', () => {
    const input = rawBoardInput();
    input.board.columns = null;
    const out = serializeBoardDataFromObject(input);
    expect(out.board.columns.map((c) => c.status)).toEqual(['backlog', 'to-do', 'doing', 'done']);
  });

  it('tolerates entirely absent boardData', () => {
    expect(() => validateBoardData(serializeBoardDataFromObject(undefined))).not.toThrow();
  });
});

describe('createBoardStateSnapshot', () => {
  it('produces output that passes validateBoardData', () => {
    expect(() => validateBoardData(createBoardStateSnapshot(rawBoardInput()))).not.toThrow();
  });

  it('stamps meta.schemaVersion and meta.appId', () => {
    const out = createBoardStateSnapshot(rawBoardInput());
    expect(out.meta.schemaVersion).toBe(1);
    expect(out.meta.appId).toBe('teamos-kanban');
  });

  it('prefers meta.updatedAt from the input over "now" (unlike serializeBoardDataFromObject)', () => {
    const out = createBoardStateSnapshot(rawBoardInput());
    expect(out.meta.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('falls back updatedAt to createdAt, then to now, when meta.updatedAt is missing', () => {
    const input = rawBoardInput();
    delete input.meta.updatedAt;
    const out = createBoardStateSnapshot(input);
    expect(out.meta.updatedAt).toBe('2026-01-01T00:00:00.000Z');

    delete input.meta.createdAt;
    const out2 = createBoardStateSnapshot(input);
    const ageMs = Date.now() - new Date(out2.meta.updatedAt).getTime();
    expect(ageMs).toBeGreaterThanOrEqual(0);
    expect(ageMs).toBeLessThan(5000);
  });

  it('normalizes tasks on the way out, same as serializeBoardDataFromObject', () => {
    const out = createBoardStateSnapshot(rawBoardInput());
    expect(out.board.tasks[0].priority).toBeNull();
    expect(out.board.tasks[0].tags).toEqual(['dup', 'ok']);
  });

  it('falls back to DEFAULT_BOARD_TITLE when board.settings.title is missing', () => {
    const input = rawBoardInput();
    delete input.board.settings.title;
    expect(createBoardStateSnapshot(input).board.settings.title).toBe(DEFAULT_BOARD_TITLE);
  });

  it('strips the timeline extension (includeTimeline: false) but keeps a valid roadmap extension', () => {
    const input = rawBoardInput();
    input.extensions = {
      timeline: { version: 1, baselineEventId: '', events: [] },
      roadmap: { version: 1, milestones: [], phases: [], sprints: [] }
    };
    const out = createBoardStateSnapshot(input);
    expect('timeline' in out.extensions).toBe(false);
    expect(out.extensions.roadmap).toEqual({ version: 1, milestones: [], phases: [], sprints: [] });
  });

  it('tolerates entirely absent boardData', () => {
    expect(() => validateBoardData(createBoardStateSnapshot(undefined))).not.toThrow();
  });
});
