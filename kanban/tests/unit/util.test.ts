import { fromPartial } from '@total-typescript/shoehorn';
import { describe, it, expect, afterEach } from 'vitest';
import {
  isAbortError,
  formatErrorMessage,
  isFileDrag,
  nowIso,
  compareText,
  hasExactKeys,
  escapeRegExp,
  readFileAsDataUrl,
  formatFileSize,
  hasRequiredExtension,
  normalizeTheme,
  normalizeTimestamp,
  assertRequiredExtension,
  portfolioSortSelectValueFromKey
} from '../../src/domain/util';

describe('isAbortError', () => {
  it('detects an AbortError by name', () => {
    const err = new Error('cancelled');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('returns false for an ordinary error', () => {
    expect(isAbortError(new Error('other'))).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});

describe('formatErrorMessage', () => {
  it('returns the message from an Error', () => {
    expect(formatErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns the default fallback when the value has no message', () => {
    expect(formatErrorMessage('plain string')).toBe('Unexpected error.');
    expect(formatErrorMessage(null)).toBe('Unexpected error.');
  });

  it('returns a custom fallback when supplied', () => {
    expect(formatErrorMessage({}, 'custom fallback')).toBe('custom fallback');
  });

  it('stringifies a non-string message', () => {
    expect(formatErrorMessage({ message: 404 })).toBe('404');
  });
});

describe('isFileDrag', () => {
  it('returns true when dataTransfer.types includes "Files"', () => {
    expect(isFileDrag(fromPartial({ dataTransfer: fromPartial({ types: ['Files', 'text/plain'] }) }))).toBe(true);
  });

  it('returns false when dataTransfer is missing', () => {
    expect(isFileDrag(fromPartial({}))).toBe(false);
  });

  it('returns false when types does not include "Files"', () => {
    expect(isFileDrag(fromPartial({ dataTransfer: fromPartial({ types: ['text/plain'] }) }))).toBe(false);
  });

  it('returns false when dataTransfer.types is missing', () => {
    expect(isFileDrag(fromPartial({ dataTransfer: fromPartial({}) }))).toBe(false);
  });
});

describe('nowIso', () => {
  it('returns the current time as an ISO 8601 string', () => {
    const before = Date.now();
    const result = nowIso();
    const after = Date.now();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const parsed = new Date(result).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});

describe('compareText', () => {
  it('treats case differences as equal (base sensitivity)', () => {
    expect(compareText('a', 'A')).toBe(0);
  });

  it('orders "a" before "b"', () => {
    expect(compareText('a', 'b')).toBeLessThan(0);
  });

  it('orders "b" after "a"', () => {
    expect(compareText('b', 'a')).toBeGreaterThan(0);
  });

  it('coerces non-string arguments to strings', () => {
    expect(compareText(1, 2)).toBeLessThan(0);
  });
});

describe('hasExactKeys', () => {
  it('returns true when the object has exactly the expected keys, in any order', () => {
    expect(hasExactKeys({ b: 1, a: 2 }, ['a', 'b'])).toBe(true);
  });

  it('returns false when the object has an extra key', () => {
    expect(hasExactKeys({ a: 1, b: 2, c: 3 }, ['a', 'b'])).toBe(false);
  });

  it('returns false when the object is missing a key', () => {
    expect(hasExactKeys({ a: 1 }, ['a', 'b'])).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(hasExactKeys(['a', 'b'], ['0', '1'])).toBe(false);
  });

  it('returns false for null', () => {
    expect(hasExactKeys(null, ['a'])).toBe(false);
  });
});

describe('escapeRegExp', () => {
  it('escapes regex special characters', () => {
    expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
  });

  it('produces a string that matches the original text literally when used in a RegExp', () => {
    const raw = 'price: $5.00 (usd)?';
    const escaped = escapeRegExp(raw);
    const re = new RegExp(escaped);
    expect(re.test(`the ${raw} tag`)).toBe(true);
  });

  it('leaves plain alphanumeric text unchanged', () => {
    expect(escapeRegExp('hello world')).toBe('hello world');
  });

  it('escapes every special character in the class (including [ ] { } | ^ + \\), matching literally as a strict-mode RegExp', () => {
    // Interspersed with letters so an unescaped backslash can't accidentally
    // form an unrelated escape sequence (e.g. \d) and mask a dropped member.
    const raw = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o';
    const escaped = escapeRegExp(raw);
    // The 'u' flag makes JS strict about regex syntax: a stray unescaped
    // ] { } or an unknown \-escape throws a SyntaxError instead of being
    // leniently reinterpreted, so a dropped class member fails loudly here
    // rather than silently matching anyway.
    const re = new RegExp(`^${escaped}$`, 'u');
    expect(re.test(raw)).toBe(true);
  });
});

describe('readFileAsDataUrl', () => {
  const originalFileReader = globalThis.FileReader;

  afterEach(() => {
    globalThis.FileReader = originalFileReader;
  });

  it('resolves with the data URL on a successful read', async () => {
    class FakeFileReader {
      [key: string]: any;
      readAsDataURL() {
        this.result = 'data:text/plain;base64,aGVsbG8=';
        this.onload?.();
      }
    }
    (globalThis.FileReader as any) = FakeFileReader;

    await expect(readFileAsDataUrl(fromPartial({}))).resolves.toBe('data:text/plain;base64,aGVsbG8=');
  });

  it('rejects with the reader error on a failed read', async () => {
    const readError = new Error('boom');
    class FakeFileReader {
      [key: string]: any;
      readAsDataURL() {
        this.error = readError;
        this.onerror?.();
      }
    }
    (globalThis.FileReader as any) = FakeFileReader;

    await expect(readFileAsDataUrl(fromPartial({}))).rejects.toBe(readError);
  });

  it('rejects with a generic error when the reader reports none', async () => {
    class FakeFileReader {
      [key: string]: any;
      readAsDataURL() {
        this.onerror?.();
      }
    }
    (globalThis.FileReader as any) = FakeFileReader;

    await expect(readFileAsDataUrl(fromPartial({}))).rejects.toThrow('File read failed.');
  });
});

describe('formatFileSize', () => {
  it('returns "0 B" for zero', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('returns "0 B" for a negative value', () => {
    expect(formatFileSize(-5)).toBe('0 B');
  });

  it('returns "0 B" for non-finite input (NaN, Infinity)', () => {
    expect(formatFileSize(NaN)).toBe('0 B');
    expect(formatFileSize(Infinity)).toBe('0 B');
    expect(formatFileSize(-Infinity)).toBe('0 B');
  });

  it('formats a bytes value under 1024 as whole bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats a KB value below the 10-unit toFixed boundary with one decimal', () => {
    expect(formatFileSize(9216)).toBe('9.0 KB'); // 9 KB, < 10 * 1024
  });

  it('formats a KB value at the 10-unit toFixed boundary with zero decimals', () => {
    expect(formatFileSize(10240)).toBe('10 KB'); // 10 KB, >= 10 * 1024
  });

  it('formats an MB value with one decimal', () => {
    expect(formatFileSize(3670016)).toBe('3.5 MB'); // 3.5 MB
  });

  it('formats exactly 1024 bytes as the KB unit, not the byte unit', () => {
    // value < 1024 is false at the threshold itself, so 1024 falls through
    // to the KB branch: 1024 / 1024 = 1, and 1 < 10 * 1024 so toFixed(1).
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats exactly 1048576 bytes (1024^2) as the MB unit, not the KB unit', () => {
    // value < 1024 * 1024 is false at the threshold itself, so 1048576 falls
    // through to the MB branch: 1048576 / 1048576 = 1, and 1 < 10 * 1024 * 1024
    // so toFixed(1).
    expect(formatFileSize(1048576)).toBe('1.0 MB');
  });

  it('formats an MB value below the 10-unit toFixed boundary with one decimal', () => {
    expect(formatFileSize(9 * 1024 * 1024)).toBe('9.0 MB'); // 9 MB, < 10 * 1024 * 1024
  });

  it('formats an MB value at the 10-unit toFixed boundary with zero decimals', () => {
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB'); // 10 MB, >= 10 * 1024 * 1024
  });
});

describe('hasRequiredExtension', () => {
  it('returns true when the filename ends with the extension', () => {
    expect(hasRequiredExtension('board.json', '.json')).toBe(true);
  });

  it('lowercases the filename but not the extension before comparing', () => {
    expect(hasRequiredExtension('board.JSON', '.json')).toBe(true);
    expect(hasRequiredExtension('board.JSON', '.JSON')).toBe(false);
  });

  it('returns false when the filename has a different extension', () => {
    expect(hasRequiredExtension('board.txt', '.json')).toBe(false);
  });

  it('returns false for non-string fileName', () => {
    expect(hasRequiredExtension(null, '.json')).toBe(false);
    expect(hasRequiredExtension(undefined, '.json')).toBe(false);
    expect(hasRequiredExtension(123, '.json')).toBe(false);
  });
});

describe('normalizeTheme', () => {
  it('passes through "dark"', () => {
    expect(normalizeTheme('dark')).toBe('dark');
  });

  it('defaults to "light" for anything else, including near-misses', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('Dark')).toBe('light');
    expect(normalizeTheme(undefined)).toBe('light');
    expect(normalizeTheme(null)).toBe('light');
    expect(normalizeTheme('')).toBe('light');
  });
});

describe('normalizeTimestamp', () => {
  it('passes through a string that Date.parse can parse', () => {
    expect(normalizeTimestamp('2024-03-15T10:00:00.000Z')).toBe('2024-03-15T10:00:00.000Z');
  });

  it('returns empty string for a string Date.parse cannot parse', () => {
    expect(normalizeTimestamp('not-a-date')).toBe('');
  });

  it('returns empty string for a falsy or non-string value', () => {
    expect(normalizeTimestamp('')).toBe('');
    expect(normalizeTimestamp(null)).toBe('');
    expect(normalizeTimestamp(undefined)).toBe('');
    expect(normalizeTimestamp(1700000000000)).toBe('');
  });
});

describe('assertRequiredExtension', () => {
  it('does not throw when the filename has the required extension', () => {
    expect(() => assertRequiredExtension('board.json', '.json', 'Project file')).not.toThrow();
  });

  it('throws with the exact "<label> must use <extension> extension." message when the extension is missing', () => {
    expect(() => assertRequiredExtension('board.txt', '.json', 'Project file'))
      .toThrow('Project file must use .json extension.');
  });

  it('throws for a non-string filename', () => {
    expect(() => assertRequiredExtension(null, '.json', 'Project file'))
      .toThrow('Project file must use .json extension.');
  });
});

describe('portfolioSortSelectValueFromKey', () => {
  it('maps "task" to "name"', () => {
    expect(portfolioSortSelectValueFromKey('task')).toBe('name');
  });

  it('passes through priority, effort, and score unchanged', () => {
    expect(portfolioSortSelectValueFromKey('priority')).toBe('priority');
    expect(portfolioSortSelectValueFromKey('effort')).toBe('effort');
    expect(portfolioSortSelectValueFromKey('score')).toBe('score');
  });

  it('falls back to "priority" for other known sort keys (board, column, dueDate, updatedAt)', () => {
    expect(portfolioSortSelectValueFromKey('board')).toBe('priority');
    expect(portfolioSortSelectValueFromKey('column')).toBe('priority');
    expect(portfolioSortSelectValueFromKey('dueDate')).toBe('priority');
    expect(portfolioSortSelectValueFromKey('updatedAt')).toBe('priority');
  });

  it('falls back to "priority" for an unknown sort key, via normalizePortfolioSortKey', () => {
    expect(portfolioSortSelectValueFromKey('bogus')).toBe('priority');
    expect(portfolioSortSelectValueFromKey(undefined)).toBe('priority');
  });
});
