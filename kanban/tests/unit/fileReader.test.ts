import { fromPartial } from '@total-typescript/shoehorn';
import { describe, it, expect, afterEach } from 'vitest';
import { readFileAsDataUrl } from '../../src/adapters/browser/fileReader';

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
