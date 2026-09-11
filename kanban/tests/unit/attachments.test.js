import { describe, it, expect } from 'vitest';
import {
  attachmentDuplicateKey,
  attachmentTaskKey,
  classifyAttachmentKind,
  createAttachmentId,
  estimateAttachmentDataUrlSizeBytes,
  stripLegacyTaskAttachmentsFromExtensions
} from '../../src/domain/attachments.js';

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
