import { fromPartial } from '@total-typescript/shoehorn';
import { describe, it, expect } from 'vitest';
import { isFileDrag } from '../../src/adapters/browser/fileDrop';

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
