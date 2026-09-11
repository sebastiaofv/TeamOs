import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isAbortError,
  formatErrorMessage,
  isFileDrag,
  nowIso,
  compareText,
  hasExactKeys,
  escapeRegExp,
  readFileAsDataUrl
} from '../../src/domain/util.js';

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
    expect(isFileDrag({ dataTransfer: { types: ['Files', 'text/plain'] } })).toBe(true);
  });

  it('returns false when dataTransfer is missing', () => {
    expect(isFileDrag({})).toBe(false);
  });

  it('returns false when types does not include "Files"', () => {
    expect(isFileDrag({ dataTransfer: { types: ['text/plain'] } })).toBe(false);
  });

  it('returns false when dataTransfer.types is missing', () => {
    expect(isFileDrag({ dataTransfer: {} })).toBe(false);
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
});

describe('readFileAsDataUrl', () => {
  const originalFileReader = globalThis.FileReader;

  afterEach(() => {
    globalThis.FileReader = originalFileReader;
  });

  it('resolves with the data URL on a successful read', async () => {
    class FakeFileReader {
      readAsDataURL() {
        this.result = 'data:text/plain;base64,aGVsbG8=';
        this.onload && this.onload();
      }
    }
    globalThis.FileReader = FakeFileReader;

    await expect(readFileAsDataUrl({})).resolves.toBe('data:text/plain;base64,aGVsbG8=');
  });

  it('rejects with the reader error on a failed read', async () => {
    const readError = new Error('boom');
    class FakeFileReader {
      readAsDataURL() {
        this.error = readError;
        this.onerror && this.onerror();
      }
    }
    globalThis.FileReader = FakeFileReader;

    await expect(readFileAsDataUrl({})).rejects.toBe(readError);
  });

  it('rejects with a generic error when the reader reports none', async () => {
    class FakeFileReader {
      readAsDataURL() {
        this.onerror && this.onerror();
      }
    }
    globalThis.FileReader = FakeFileReader;

    await expect(readFileAsDataUrl({})).rejects.toThrow('File read failed.');
  });
});
