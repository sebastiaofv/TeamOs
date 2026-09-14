import { describe, it, expect } from 'vitest';
import {
  attachmentDuplicateKey,
  attachmentTaskKey,
  classifyAttachmentKind,
  createAttachmentId,
  estimateAttachmentDataUrlSizeBytes,
  normalizeAttachmentRecord,
  stripLegacyTaskAttachmentsFromExtensions,
  getTaskAttachmentsMap,
  getLegacyTaskAttachmentsFromExtensions,
  normalizeTaskAttachments,
  removeLegacyTaskAttachmentsFromExtensions,
  calculateBoardAttachmentBytes,
  getTaskAttachments,
  setTaskAttachments
} from '../../src/domain/attachments.js';
import { ATTACHMENT_HARD_MAX_BYTES, ATTACHMENT_MAX_COUNT } from '../../src/domain/constants.js';

// A valid data: URL whose base64 payload decodes to the 5-byte string
// "Hello" (estimateAttachmentDataUrlSizeBytes computes 5 for it, verified
// against estimateAttachmentDataUrlSizeBytes's own test coverage below).
const HELLO_DATA_URL = 'data:text/plain;base64,SGVsbG8=';

describe('attachmentDuplicateKey', () => {
  it('builds a key from lowercased name, lowercased mime, and rounded size', () => {
    expect(attachmentDuplicateKey({ name: 'Photo.PNG', mime: 'Image/PNG', sizeBytes: 1024 }))
      .toBe('photo.png::image/png::1024');
  });

  it('trims and lowercases the name for deduplication purposes', () => {
    const a = attachmentDuplicateKey({ name: '  Report.pdf  ', mime: 'application/pdf', sizeBytes: 10 });
    const b = attachmentDuplicateKey({ name: 'report.pdf', mime: 'application/pdf', sizeBytes: 10 });
    expect(a).toBe(b);
  });

  it('returns empty string when name is missing or blank', () => {
    expect(attachmentDuplicateKey({ mime: 'text/plain', sizeBytes: 5 })).toBe('');
    expect(attachmentDuplicateKey({ name: '   ', mime: 'text/plain', sizeBytes: 5 })).toBe('');
  });

  it('returns empty string for non-object input', () => {
    expect(attachmentDuplicateKey(null)).toBe('');
    expect(attachmentDuplicateKey(undefined)).toBe('');
    expect(attachmentDuplicateKey('name.txt')).toBe('');
  });

  it('treats a missing mime as an empty string', () => {
    expect(attachmentDuplicateKey({ name: 'file.txt', sizeBytes: 0 })).toBe('file.txt::::0');
  });

  it('clamps a negative sizeBytes to 0', () => {
    expect(attachmentDuplicateKey({ name: 'a', mime: 'x', sizeBytes: -50 })).toBe('a::x::0');
  });

  it('falls back to 0 for a non-finite sizeBytes', () => {
    expect(attachmentDuplicateKey({ name: 'a', mime: 'x', sizeBytes: NaN })).toBe('a::x::0');
    expect(attachmentDuplicateKey({ name: 'a', mime: 'x' })).toBe('a::x::0');
  });

  it('rounds a fractional sizeBytes', () => {
    expect(attachmentDuplicateKey({ name: 'a', mime: 'x', sizeBytes: 10.6 })).toBe('a::x::11');
  });
});

describe('attachmentTaskKey', () => {
  it('prefixes the numeric task id', () => {
    expect(attachmentTaskKey(5)).toBe('task:5');
  });

  it('coerces a numeric string to a number', () => {
    expect(attachmentTaskKey('7')).toBe('task:7');
  });

  it('produces NaN in the key for a non-numeric id', () => {
    expect(attachmentTaskKey('abc')).toBe('task:NaN');
  });
});

describe('classifyAttachmentKind', () => {
  it('classifies any image/* mime as image', () => {
    expect(classifyAttachmentKind('image/png', 'file.dat')).toBe('image');
    expect(classifyAttachmentKind('IMAGE/JPEG', 'file.dat')).toBe('image');
  });

  it('classifies a recognized image extension as image when mime is absent', () => {
    expect(classifyAttachmentKind('', 'photo.PNG')).toBe('image');
    expect(classifyAttachmentKind(undefined, 'icon.svg')).toBe('image');
    expect(classifyAttachmentKind('', 'shot.heic')).toBe('image');
  });

  it('classifies a non-image mime with a non-image extension as file', () => {
    expect(classifyAttachmentKind('application/pdf', 'doc.pdf')).toBe('file');
  });

  it('defaults to file when both mime and fileName are missing', () => {
    expect(classifyAttachmentKind(undefined, undefined)).toBe('file');
  });

  it('classifies an unrecognized extension as file even with no mime', () => {
    expect(classifyAttachmentKind('', 'archive.zip')).toBe('file');
  });
});

describe('createAttachmentId', () => {
  it('returns a string with the att_ prefix', () => {
    expect(createAttachmentId()).toMatch(/^att_\d+_[a-z0-9]*$/);
  });

  it('produces different ids across calls', () => {
    const a = createAttachmentId();
    const b = createAttachmentId();
    expect(a).not.toBe(b);
  });
});

describe('estimateAttachmentDataUrlSizeBytes', () => {
  it('returns 0 for non-string input', () => {
    expect(estimateAttachmentDataUrlSizeBytes(null)).toBe(0);
    expect(estimateAttachmentDataUrlSizeBytes(undefined)).toBe(0);
    expect(estimateAttachmentDataUrlSizeBytes(42)).toBe(0);
  });

  it('returns 0 for a string that is not a data URL', () => {
    expect(estimateAttachmentDataUrlSizeBytes('not-a-data-url')).toBe(0);
  });

  it('returns 0 when there is no comma separating header from payload', () => {
    expect(estimateAttachmentDataUrlSizeBytes('data:text/plain;base64')).toBe(0);
  });

  it('returns 0 for an empty payload', () => {
    expect(estimateAttachmentDataUrlSizeBytes('data:text/plain;base64,')).toBe(0);
  });

  it('computes exact byte size for base64 with single padding character', () => {
    // "SGVsbG8=" is base64 for "Hello" (5 bytes), 1 padding char.
    // floor(8 * 3 / 4) - 1 = 6 - 1 = 5.
    expect(estimateAttachmentDataUrlSizeBytes('data:text/plain;base64,SGVsbG8=')).toBe(5);
  });

  it('computes exact byte size for base64 with no padding', () => {
    // "SGVsbG8h" is base64 for "Hello!" (6 bytes), no padding.
    expect(estimateAttachmentDataUrlSizeBytes('data:text/plain;base64,SGVsbG8h')).toBe(6);
  });

  it('computes exact byte size for base64 with double padding (off-by-one boundary)', () => {
    // "QQ==" is base64 for "A" (1 byte), 2 padding chars.
    // floor(4 * 3 / 4) - 2 = 3 - 2 = 1.
    expect(estimateAttachmentDataUrlSizeBytes('data:image/png;base64,QQ==')).toBe(1);
  });

  it('is case-insensitive when detecting the ;base64 marker', () => {
    expect(estimateAttachmentDataUrlSizeBytes('data:text/plain;BASE64,QQ==')).toBe(1);
  });

  it('falls back to Blob size for a non-base64 (URL-encoded) data URL', () => {
    expect(estimateAttachmentDataUrlSizeBytes('data:text/plain,Hello%20World')).toBe(11);
  });

  it('falls back to raw payload length when decodeURIComponent throws', () => {
    // A lone "%" is not valid percent-encoding and throws a URIError.
    expect(estimateAttachmentDataUrlSizeBytes('data:text/plain,%')).toBe(1);
  });
});

describe('stripLegacyTaskAttachmentsFromExtensions', () => {
  it('returns an empty object for non-object input', () => {
    expect(stripLegacyTaskAttachmentsFromExtensions(null)).toEqual({});
    expect(stripLegacyTaskAttachmentsFromExtensions(undefined)).toEqual({});
    expect(stripLegacyTaskAttachmentsFromExtensions('nope')).toEqual({});
  });

  it('returns the same extensions object unchanged when there is no teamOsKanban key', () => {
    const extensions = { roadmap: { some: 'thing' } };
    const result = stripLegacyTaskAttachmentsFromExtensions(extensions);
    expect(result).toBe(extensions);
  });

  it('returns the same extensions object unchanged when teamOsKanban has no taskAttachments key', () => {
    const extensions = { teamOsKanban: { otherThing: 1 } };
    const result = stripLegacyTaskAttachmentsFromExtensions(extensions);
    expect(result).toBe(extensions);
  });

  it('strips taskAttachments but keeps sibling teamOsKanban keys, without mutating the input', () => {
    const extensions = { teamOsKanban: { taskAttachments: { 'task:1': [] }, otherThing: 1 }, roadmap: {} };
    const result = stripLegacyTaskAttachmentsFromExtensions(extensions);

    expect(result).toEqual({ teamOsKanban: { otherThing: 1 }, roadmap: {} });
    expect(result).not.toBe(extensions);
    expect(extensions.teamOsKanban.taskAttachments).toEqual({ 'task:1': [] });
  });

  it('removes the entire teamOsKanban key when taskAttachments was its only key', () => {
    const extensions = { teamOsKanban: { taskAttachments: {} }, roadmap: {} };
    const result = stripLegacyTaskAttachmentsFromExtensions(extensions);

    expect(result).toEqual({ roadmap: {} });
    expect(Object.prototype.hasOwnProperty.call(result, 'teamOsKanban')).toBe(false);
  });
});

describe('normalizeAttachmentRecord', () => {
  it('returns null for non-object input', () => {
    expect(normalizeAttachmentRecord(null)).toBeNull();
    expect(normalizeAttachmentRecord(undefined)).toBeNull();
    expect(normalizeAttachmentRecord('a string')).toBeNull();
    expect(normalizeAttachmentRecord(42)).toBeNull();
  });

  it('returns null for an array, even though typeof is object', () => {
    expect(normalizeAttachmentRecord([])).toBeNull();
  });

  it('returns null when dataUrl is missing or not a data: URL', () => {
    expect(normalizeAttachmentRecord({})).toBeNull();
    expect(normalizeAttachmentRecord({ dataUrl: 'https://example.com/a.png' })).toBeNull();
    expect(normalizeAttachmentRecord({ dataUrl: 42 })).toBeNull();
  });

  it('defaults name to "Attachment" when missing or blank', () => {
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL }).name).toBe('Attachment');
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, name: '   ' }).name).toBe('Attachment');
  });

  it('trims a provided name', () => {
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, name: '  photo.png  ' }).name).toBe('photo.png');
  });

  it('defaults mime to an empty string when missing or not a string', () => {
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL }).mime).toBe('');
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, mime: 7 }).mime).toBe('');
  });

  it('uses a valid, non-negative sizeBytes as-is (rounded)', () => {
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, sizeBytes: 1024.6 }).sizeBytes).toBe(1025);
  });

  it('falls back to estimateAttachmentDataUrlSizeBytes when sizeBytes is missing, negative, or non-finite', () => {
    const estimated = estimateAttachmentDataUrlSizeBytes(HELLO_DATA_URL);
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL }).sizeBytes).toBe(estimated);
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, sizeBytes: -5 }).sizeBytes).toBe(estimated);
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, sizeBytes: NaN }).sizeBytes).toBe(estimated);
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, sizeBytes: 'not-a-number' }).sizeBytes).toBe(estimated);
  });

  // normalizeAttachmentRecord does not enforce ATTACHMENT_HARD_MAX_BYTES at
  // all -- that limit is only checked at the call sites that accept new
  // attachments (picker validation in src/domain/taskDraft.js and the save
  // check in src/actions/taskActions.js), not inside normalization itself. A record already
  // carrying an oversized sizeBytes is passed through unchanged.
  it('does not clamp or reject a sizeBytes that exceeds ATTACHMENT_HARD_MAX_BYTES', () => {
    const oversized = ATTACHMENT_HARD_MAX_BYTES + 1000;
    const result = normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, sizeBytes: oversized });
    expect(result.sizeBytes).toBe(oversized);
  });

  it('keeps an explicit kind of "image" or "file" as-is', () => {
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, kind: 'image', mime: 'application/pdf' }).kind).toBe('image');
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, kind: 'file', mime: 'image/png' }).kind).toBe('file');
  });

  it('derives kind via classifyAttachmentKind when kind is absent or not one of the two accepted values', () => {
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, mime: 'image/png' }).kind).toBe('image');
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, mime: 'text/plain' }).kind).toBe('file');
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, kind: 'bogus', mime: 'image/png' }).kind).toBe('image');
  });

  it('keeps a provided, trimmed id', () => {
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, id: '  keep-me  ' }).id).toBe('keep-me');
  });

  it('generates an id via createAttachmentId when id is missing or blank', () => {
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL }).id).toMatch(/^att_\d+_[a-z0-9]+$/);
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, id: '   ' }).id).toMatch(/^att_\d+_[a-z0-9]+$/);
  });

  it('keeps a valid createdAt timestamp as-is', () => {
    const createdAt = '2024-03-01T00:00:00.000Z';
    expect(normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, createdAt }).createdAt).toBe(createdAt);
  });

  it('falls back to nowIso() when createdAt is missing or unparseable', () => {
    const before = Date.now();
    const result = normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL, createdAt: 'not-a-date' });
    const after = Date.now();
    expect(Number.isNaN(Date.parse(result.createdAt))).toBe(false);
    const parsed = Date.parse(result.createdAt);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it('returns the full expected shape for a minimal valid record', () => {
    const result = normalizeAttachmentRecord({ dataUrl: HELLO_DATA_URL });
    expect(Object.keys(result).sort()).toEqual(
      ['createdAt', 'dataUrl', 'id', 'kind', 'mime', 'name', 'sizeBytes'].sort()
    );
    expect(result.dataUrl).toBe(HELLO_DATA_URL);
  });
});

describe('getTaskAttachmentsMap', () => {
  it('returns null for non-object boardData without create', () => {
    expect(getTaskAttachmentsMap(null)).toBeNull();
    expect(getTaskAttachmentsMap(undefined)).toBeNull();
    expect(getTaskAttachmentsMap('nope')).toBeNull();
  });

  it('returns null when boardData has no extensions and create is not requested', () => {
    expect(getTaskAttachmentsMap({})).toBeNull();
  });

  it('returns null when extensions exist but have no teamOsKanban key, without create', () => {
    expect(getTaskAttachmentsMap({ extensions: {} })).toBeNull();
  });

  it('returns null when teamOsKanban exists but has no taskAttachments key, without create', () => {
    expect(getTaskAttachmentsMap({ extensions: { teamOsKanban: {} } })).toBeNull();
  });

  it('returns null when taskAttachments is not a plain object (e.g. an array), without create', () => {
    expect(getTaskAttachmentsMap({ extensions: { teamOsKanban: { taskAttachments: [] } } })).toBeNull();
  });

  it('returns the existing taskAttachments object as-is (same reference) when present', () => {
    const taskAttachments = { 'task:1': [] };
    const boardData = { extensions: { teamOsKanban: { taskAttachments } } };
    expect(getTaskAttachmentsMap(boardData)).toBe(taskAttachments);
  });

  it('builds the full extensions chain and returns an empty map when create is true and nothing exists', () => {
    const boardData = {};
    const result = getTaskAttachmentsMap(boardData, { create: true });
    expect(result).toEqual({});
    expect(boardData.extensions.teamOsKanban.taskAttachments).toBe(result);
  });

  it('replaces a non-object taskAttachments (an array) with an empty object when create is true', () => {
    const boardData = { extensions: { teamOsKanban: { taskAttachments: [] } } };
    const result = getTaskAttachmentsMap(boardData, { create: true });
    expect(result).toEqual({});
    expect(Array.isArray(result)).toBe(false);
  });

  it('returns the existing taskAttachments object as-is when create is true and it is already valid', () => {
    const taskAttachments = { 'task:2': [] };
    const boardData = { extensions: { teamOsKanban: { taskAttachments } } };
    expect(getTaskAttachmentsMap(boardData, { create: true })).toBe(taskAttachments);
  });
});

describe('normalizeTaskAttachments', () => {
  it('returns an empty array for non-array input', () => {
    expect(normalizeTaskAttachments(null)).toEqual([]);
    expect(normalizeTaskAttachments(undefined)).toEqual([]);
    expect(normalizeTaskAttachments('nope')).toEqual([]);
    expect(normalizeTaskAttachments({})).toEqual([]);
  });

  it('returns an empty array for an empty array', () => {
    expect(normalizeTaskAttachments([])).toEqual([]);
  });

  it('normalizes each record through normalizeAttachmentRecord', () => {
    const result = normalizeTaskAttachments([{ dataUrl: HELLO_DATA_URL, name: 'a.txt' }]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('a.txt');
    expect(result[0].dataUrl).toBe(HELLO_DATA_URL);
  });

  it('drops records that normalize to null (e.g. missing a data: URL)', () => {
    const good = { dataUrl: HELLO_DATA_URL, name: 'keep.txt' };
    const bad = { name: 'no-data-url.txt' };
    const result = normalizeTaskAttachments([bad, good, null, 'not-an-object']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('keep.txt');
  });

  it(`caps the result at ATTACHMENT_MAX_COUNT (${ATTACHMENT_MAX_COUNT})`, () => {
    const records = Array.from({ length: ATTACHMENT_MAX_COUNT + 5 }, (_, i) => ({
      dataUrl: HELLO_DATA_URL,
      name: `file-${i}.txt`
    }));
    const result = normalizeTaskAttachments(records);
    expect(result).toHaveLength(ATTACHMENT_MAX_COUNT);
    expect(result.map((r) => r.name)).toEqual(
      records.slice(0, ATTACHMENT_MAX_COUNT).map((r) => r.name)
    );
  });

  it('applies the cap after dropping invalid records, not before', () => {
    const invalid = Array.from({ length: 3 }, () => ({ name: 'no-data-url' }));
    const valid = Array.from({ length: ATTACHMENT_MAX_COUNT }, (_, i) => ({
      dataUrl: HELLO_DATA_URL,
      name: `file-${i}.txt`
    }));
    const result = normalizeTaskAttachments([...invalid, ...valid]);
    expect(result).toHaveLength(ATTACHMENT_MAX_COUNT);
    expect(result.map((r) => r.name)).toEqual(valid.map((r) => r.name));
  });
});

describe('getLegacyTaskAttachmentsFromExtensions', () => {
  it('returns an empty array when taskId is null, undefined, or empty string', () => {
    const boardData = { extensions: { teamOsKanban: { taskAttachments: { 'task:1': [] } } } };
    expect(getLegacyTaskAttachmentsFromExtensions(boardData, null)).toEqual([]);
    expect(getLegacyTaskAttachmentsFromExtensions(boardData, undefined)).toEqual([]);
    expect(getLegacyTaskAttachmentsFromExtensions(boardData, '')).toEqual([]);
  });

  it('returns an empty array when there is no attachments map at all (absent case)', () => {
    expect(getLegacyTaskAttachmentsFromExtensions({}, 1)).toEqual([]);
    expect(getLegacyTaskAttachmentsFromExtensions(null, 1)).toEqual([]);
  });

  it('returns an empty array when the map has no entry for this task', () => {
    const boardData = { extensions: { teamOsKanban: { taskAttachments: {} } } };
    expect(getLegacyTaskAttachmentsFromExtensions(boardData, 1)).toEqual([]);
  });

  it('returns an empty array when the stored value for the task is not an array', () => {
    const boardData = { extensions: { teamOsKanban: { taskAttachments: { 'task:1': 'nope' } } } };
    expect(getLegacyTaskAttachmentsFromExtensions(boardData, 1)).toEqual([]);
  });

  it('normalizes and returns the legacy attachments when present', () => {
    const boardData = {
      extensions: {
        teamOsKanban: {
          taskAttachments: {
            'task:1': [{ dataUrl: HELLO_DATA_URL, name: 'legacy.txt' }, { name: 'invalid-no-url' }]
          }
        }
      }
    };
    const result = getLegacyTaskAttachmentsFromExtensions(boardData, 1);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('legacy.txt');
  });
});

describe('removeLegacyTaskAttachmentsFromExtensions', () => {
  it('does nothing when taskId is null, undefined, or empty string', () => {
    const boardData = { extensions: { teamOsKanban: { taskAttachments: { 'task:1': [] } } } };
    removeLegacyTaskAttachmentsFromExtensions(boardData, null);
    removeLegacyTaskAttachmentsFromExtensions(boardData, undefined);
    removeLegacyTaskAttachmentsFromExtensions(boardData, '');
    expect(boardData.extensions.teamOsKanban.taskAttachments).toEqual({ 'task:1': [] });
  });

  it('does nothing when there is no attachments map at all (absent case)', () => {
    const boardData = {};
    removeLegacyTaskAttachmentsFromExtensions(boardData, 1);
    expect(boardData).toEqual({});
  });

  it('does nothing when the map exists but has no entry for this task', () => {
    const boardData = { extensions: { teamOsKanban: { taskAttachments: { 'task:2': [] } } } };
    removeLegacyTaskAttachmentsFromExtensions(boardData, 1);
    expect(boardData.extensions.teamOsKanban.taskAttachments).toEqual({ 'task:2': [] });
  });

  it('removes only the matching entry, keeping sibling task entries and the extensions chain (present case)', () => {
    const boardData = {
      extensions: {
        teamOsKanban: { taskAttachments: { 'task:1': [], 'task:2': [] } },
        roadmap: { some: 'thing' }
      }
    };
    removeLegacyTaskAttachmentsFromExtensions(boardData, 1);
    expect(boardData.extensions.teamOsKanban.taskAttachments).toEqual({ 'task:2': [] });
    expect(boardData.extensions.roadmap).toEqual({ some: 'thing' });
  });

  it('removes the taskAttachments key entirely once the map becomes empty', () => {
    const boardData = {
      extensions: {
        teamOsKanban: { taskAttachments: { 'task:1': [] }, otherThing: 1 }
      }
    };
    removeLegacyTaskAttachmentsFromExtensions(boardData, 1);
    expect(Object.prototype.hasOwnProperty.call(boardData.extensions.teamOsKanban, 'taskAttachments')).toBe(false);
    expect(boardData.extensions.teamOsKanban.otherThing).toBe(1);
  });

  it('removes the whole teamOsKanban key when taskAttachments was its only key and the map is now empty', () => {
    const boardData = {
      extensions: {
        teamOsKanban: { taskAttachments: { 'task:1': [] } },
        roadmap: {}
      }
    };
    removeLegacyTaskAttachmentsFromExtensions(boardData, 1);
    expect(Object.prototype.hasOwnProperty.call(boardData.extensions, 'teamOsKanban')).toBe(false);
    expect(boardData.extensions.roadmap).toEqual({});
  });
});

describe('getTaskAttachments', () => {
  it('returns an empty array when taskId is null, undefined, or empty string', () => {
    const boardData = { board: { tasks: [{ id: 1, attachments: [{ dataUrl: HELLO_DATA_URL }] }] } };
    expect(getTaskAttachments(boardData, null)).toEqual([]);
    expect(getTaskAttachments(boardData, undefined)).toEqual([]);
    expect(getTaskAttachments(boardData, '')).toEqual([]);
  });

  it('normalizes and returns the task attachments array when the task has one', () => {
    const boardData = {
      board: { tasks: [{ id: 1, attachments: [{ dataUrl: HELLO_DATA_URL, name: 'a.txt' }] }] }
    };
    const result = getTaskAttachments(boardData, 1);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('a.txt');
  });

  it('falls back to legacy extensions attachments when the task exists but has no attachments array', () => {
    const boardData = {
      board: { tasks: [{ id: 1 }] },
      extensions: {
        teamOsKanban: { taskAttachments: { 'task:1': [{ dataUrl: HELLO_DATA_URL, name: 'legacy.txt' }] } }
      }
    };
    const result = getTaskAttachments(boardData, 1);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('legacy.txt');
  });

  it('falls back to legacy extensions attachments when the task is not found at all', () => {
    const boardData = {
      board: { tasks: [] },
      extensions: {
        teamOsKanban: { taskAttachments: { 'task:9': [{ dataUrl: HELLO_DATA_URL, name: 'orphan.txt' }] } }
      }
    };
    const result = getTaskAttachments(boardData, 9);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('orphan.txt');
  });

  it('returns an empty array when the task is missing and there is no legacy data either', () => {
    expect(getTaskAttachments({ board: { tasks: [] } }, 1)).toEqual([]);
  });
});

describe('setTaskAttachments', () => {
  it('does nothing when taskId is null, undefined, or empty string', () => {
    const task = { id: 1, attachments: [] };
    const boardData = { board: { tasks: [task] } };
    setTaskAttachments(boardData, null, [{ dataUrl: HELLO_DATA_URL }]);
    setTaskAttachments(boardData, undefined, [{ dataUrl: HELLO_DATA_URL }]);
    setTaskAttachments(boardData, '', [{ dataUrl: HELLO_DATA_URL }]);
    expect(task.attachments).toEqual([]);
  });

  it('normalizes and assigns the attachments array on the matching task', () => {
    const task = { id: 1 };
    const boardData = { board: { tasks: [task] } };
    setTaskAttachments(boardData, 1, [{ dataUrl: HELLO_DATA_URL, name: 'a.txt' }]);
    expect(task.attachments).toHaveLength(1);
    expect(task.attachments[0].name).toBe('a.txt');
  });

  it('drops invalid attachment records and caps at ATTACHMENT_MAX_COUNT', () => {
    const task = { id: 1 };
    const boardData = { board: { tasks: [task] } };
    const records = [
      { name: 'no-data-url' },
      ...Array.from({ length: ATTACHMENT_MAX_COUNT + 3 }, (_, i) => ({ dataUrl: HELLO_DATA_URL, name: `f${i}` }))
    ];
    setTaskAttachments(boardData, 1, records);
    expect(task.attachments).toHaveLength(ATTACHMENT_MAX_COUNT);
  });

  it('treats non-array attachments input as an empty list', () => {
    const task = { id: 1, attachments: [{ dataUrl: HELLO_DATA_URL }] };
    const boardData = { board: { tasks: [task] } };
    setTaskAttachments(boardData, 1, null);
    expect(task.attachments).toEqual([]);
  });

  it('is a no-op on the task list when the task does not exist, but still clears legacy extensions', () => {
    const boardData = {
      board: { tasks: [] },
      extensions: { teamOsKanban: { taskAttachments: { 'task:1': [{ dataUrl: HELLO_DATA_URL }] } } }
    };
    setTaskAttachments(boardData, 1, [{ dataUrl: HELLO_DATA_URL }]);
    expect(boardData.board.tasks).toEqual([]);
    // taskAttachments was teamOsKanban's only key, so removing it also
    // removes the now-empty teamOsKanban key entirely (see
    // removeLegacyTaskAttachmentsFromExtensions, which this delegates to).
    expect(Object.prototype.hasOwnProperty.call(boardData.extensions, 'teamOsKanban')).toBe(false);
  });

  it('removes legacy extension attachments for the task once set on the task itself', () => {
    const task = { id: 1 };
    const boardData = {
      board: { tasks: [task] },
      extensions: {
        teamOsKanban: { taskAttachments: { 'task:1': [{ dataUrl: HELLO_DATA_URL }] } },
        roadmap: { some: 'thing' }
      }
    };
    setTaskAttachments(boardData, 1, [{ dataUrl: HELLO_DATA_URL, name: 'new.txt' }]);
    expect(Object.prototype.hasOwnProperty.call(boardData.extensions, 'teamOsKanban')).toBe(false);
    expect(boardData.extensions.roadmap).toEqual({ some: 'thing' });
  });

  it('round-trips with getTaskAttachments: what is set is what is returned', () => {
    const task = { id: 1 };
    const boardData = { board: { tasks: [task] } };
    setTaskAttachments(boardData, 1, [{ dataUrl: HELLO_DATA_URL, name: 'round-trip.txt' }]);
    const result = getTaskAttachments(boardData, 1);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('round-trip.txt');
  });
});

describe('calculateBoardAttachmentBytes', () => {
  it('returns 0 for an empty board (no tasks, no legacy map)', () => {
    expect(calculateBoardAttachmentBytes({ board: { tasks: [] } })).toBe(0);
    expect(calculateBoardAttachmentBytes({})).toBe(0);
  });

  it('sums sizeBytes for a single attachment on a single task', () => {
    const boardData = {
      board: { tasks: [{ id: 1, attachments: [{ dataUrl: HELLO_DATA_URL, sizeBytes: 100 }] }] }
    };
    expect(calculateBoardAttachmentBytes(boardData)).toBe(100);
  });

  it('sums attachment bytes across multiple tasks', () => {
    const boardData = {
      board: {
        tasks: [
          { id: 1, attachments: [{ dataUrl: HELLO_DATA_URL, sizeBytes: 100 }] },
          { id: 2, attachments: [{ dataUrl: HELLO_DATA_URL, sizeBytes: 250 }, { dataUrl: HELLO_DATA_URL, sizeBytes: 50 }] }
        ]
      }
    };
    expect(calculateBoardAttachmentBytes(boardData)).toBe(400);
  });

  it('excludes the task named by options.excludeTaskId from the total', () => {
    const boardData = {
      board: {
        tasks: [
          { id: 1, attachments: [{ dataUrl: HELLO_DATA_URL, sizeBytes: 100 }] },
          { id: 2, attachments: [{ dataUrl: HELLO_DATA_URL, sizeBytes: 250 }] }
        ]
      }
    };
    expect(calculateBoardAttachmentBytes(boardData, { excludeTaskId: 2 })).toBe(100);
  });

  it('falls back to legacy extensions attachments for a task with no attachments array', () => {
    const boardData = {
      board: { tasks: [{ id: 1 }] },
      extensions: { teamOsKanban: { taskAttachments: { 'task:1': [{ dataUrl: HELLO_DATA_URL, sizeBytes: 75 }] } } }
    };
    expect(calculateBoardAttachmentBytes(boardData)).toBe(75);
  });

  it('falls back to the legacy extensions map entirely when boardData has no board.tasks array', () => {
    const boardData = {
      extensions: {
        teamOsKanban: {
          taskAttachments: {
            'task:1': [{ dataUrl: HELLO_DATA_URL, sizeBytes: 30 }],
            'task:2': [{ dataUrl: HELLO_DATA_URL, sizeBytes: 20 }]
          }
        }
      }
    };
    expect(calculateBoardAttachmentBytes(boardData)).toBe(50);
  });

  it('excludes a task key from the legacy-map fallback path via excludeTaskId', () => {
    const boardData = {
      extensions: {
        teamOsKanban: {
          taskAttachments: {
            'task:1': [{ dataUrl: HELLO_DATA_URL, sizeBytes: 30 }],
            'task:2': [{ dataUrl: HELLO_DATA_URL, sizeBytes: 20 }]
          }
        }
      }
    };
    expect(calculateBoardAttachmentBytes(boardData, { excludeTaskId: 2 })).toBe(30);
  });

  it('treats a negative or non-numeric sizeBytes as 0 when summing', () => {
    const boardData = {
      board: {
        tasks: [{ id: 1, attachments: [{ dataUrl: HELLO_DATA_URL, sizeBytes: -50 }] }]
      }
    };
    // normalizeTaskAttachments -> normalizeAttachmentRecord falls back to
    // estimateAttachmentDataUrlSizeBytes for a negative sizeBytes, so this
    // is not actually 0 -- it's the estimated size of HELLO_DATA_URL (5).
    expect(calculateBoardAttachmentBytes(boardData)).toBe(5);
  });
});
