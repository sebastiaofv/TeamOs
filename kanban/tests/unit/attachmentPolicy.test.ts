import { expect, it } from 'vitest';
import { isAcceptedPickedAttachment, isSafeAttachmentPreview, validateNewAttachments } from '../../src/domain/attachmentPolicy';
import { normalizeAttachmentRecord } from '../../src/domain/attachments';

it('accepts documents and raster images but rejects executable/HTML/SVG new uploads', () => {
    expect(isAcceptedPickedAttachment('notes.txt', 'text/plain')).toBe(true);
    expect(isAcceptedPickedAttachment('document.pdf', 'application/pdf')).toBe(true);
    for (const [name, mime] of [['bad.html', 'text/html'], ['bad.svg', 'image/svg+xml'], ['run.exe', 'application/octet-stream'], ['run.js', 'text/javascript']]) expect(isAcceptedPickedAttachment(name, mime)).toBe(false);
});

it('keeps legacy SVG bytes without rendering them, while rejecting a new SVG', () => {
    const legacy = normalizeAttachmentRecord({ id: 'legacy', name: 'old.svg', mime: 'image/svg+xml', kind: 'image', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', createdAt: '2026-01-01T00:00:00Z' })!;
    expect(isSafeAttachmentPreview(legacy)).toBe(false);
    expect(() => validateNewAttachments([legacy], [legacy])).not.toThrow();
    expect(() => validateNewAttachments([], [legacy])).toThrow(/SVG/);
});
