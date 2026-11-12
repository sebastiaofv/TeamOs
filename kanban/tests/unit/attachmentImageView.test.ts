import { describe, expect, it } from 'vitest';
import { attachmentImageSource, attachmentImageView, type AttachmentImageLoad } from '../../src/features/portfolio/task/dialogs/AttachmentMedia';

const stored = (digit: string) => `teamos-attachment:project/${digit.repeat(64)}`;

describe('attachment image view', () => {
  it('shows a plain URL directly, even after a stored image failed', () => {
    const failed: AttachmentImageLoad = { source: attachmentImageSource(stored('a'), 'image/png'), view: { status: 'error', message: 'Missing file' } };
    expect(attachmentImageView('data:image/png;base64,AA==', 'image/png', failed)).toEqual({ status: 'ready', url: 'data:image/png;base64,AA==' });
  });

  it('is loading until a result for the current stored image arrives', () => {
    expect(attachmentImageView(stored('a'), 'image/png', null)).toEqual({ status: 'loading' });
    const ready: AttachmentImageLoad = { source: attachmentImageSource(stored('a'), 'image/png'), view: { status: 'ready', url: 'blob:a' } };
    expect(attachmentImageView(stored('a'), 'image/png', ready)).toEqual({ status: 'ready', url: 'blob:a' });
  });

  it('never shows the result of a previous image or type', () => {
    const failed: AttachmentImageLoad = { source: attachmentImageSource(stored('a'), 'image/png'), view: { status: 'error', message: 'Missing file' } };
    expect(attachmentImageView(stored('b'), 'image/png', failed)).toEqual({ status: 'loading' });
    expect(attachmentImageView(stored('a'), 'image/jpeg', failed)).toEqual({ status: 'loading' });
  });
});
