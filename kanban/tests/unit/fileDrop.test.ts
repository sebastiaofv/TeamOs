import { fromPartial } from '@total-typescript/shoehorn';
import { describe, it, expect } from 'vitest';
import { ATTACHMENT_DROP_ZONE_ATTR, isAttachmentDropTarget, isFileDrag } from '../../src/infrastructure/browser/fileDrop';

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

describe('isAttachmentDropTarget', () => {
  it('returns false for null or non-Element targets', () => {
    expect(isAttachmentDropTarget(null)).toBe(false);
    expect(isAttachmentDropTarget({} as EventTarget)).toBe(false);
  });

  it('detects elements inside an attachment drop zone', () => {
    const previousElement = globalThis.Element;
    class FakeElement {
      constructor(private readonly match: boolean) {}
      closest(selector: string) {
        return selector === `[${ATTACHMENT_DROP_ZONE_ATTR}="true"]` && this.match ? this : null;
      }
    }
    globalThis.Element = FakeElement as unknown as typeof Element;
    try {
      expect(isAttachmentDropTarget(new FakeElement(true) as unknown as EventTarget)).toBe(true);
      expect(isAttachmentDropTarget(new FakeElement(false) as unknown as EventTarget)).toBe(false);
    } finally {
      globalThis.Element = previousElement;
    }
  });
});
