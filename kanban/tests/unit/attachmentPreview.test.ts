import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getAttachmentPreviewMime } from '../../src/domain/attachments';
import { validateBoardData } from '../../src/domain/board';
import { createAttachmentPreviewUrl } from '../../src/infrastructure/browser/attachmentPreview';

describe('attachment previews', () => {
  it.each([
    ['image/jpeg', 'photo.jpg'], ['image/png', 'photo.png'], ['image/gif', 'photo.gif'],
    ['image/webp', 'photo.webp'], ['image/bmp', 'photo.bmp'], ['image/x-icon', 'icon.ico'],
    ['image/avif', 'photo.avif'], ['application/pdf', 'document.pdf'],
    ['text/plain', 'note.txt'], ['application/json', 'data.json'],
    ['audio/mpeg', 'sound.mp3'], ['audio/wav', 'sound.wav'], ['audio/ogg', 'sound.ogg'],
    ['video/mp4', 'clip.mp4'], ['video/webm', 'clip.webm']
  ])('supports %s with a declared type or a filename fallback', (mime, name) => {
    expect(getAttachmentPreviewMime({ mime, name, dataUrl: `data:${mime};base64,AA==` })).toBe(mime);
    expect(getAttachmentPreviewMime({ mime: '', name: name.toUpperCase(), dataUrl: 'data:;base64,AA==' })).toBe(mime);
    expect(getAttachmentPreviewMime({ mime: 'application/octet-stream', name, dataUrl: 'data:application/octet-stream;base64,AA==' })).toBe(mime);
  });

  it.each([
    ['text/csv', 'table.csv', 'text/plain'], ['application/csv', 'table.csv', 'text/plain'],
    ['application/xml', 'data.xml', 'text/plain'], ['text/xml', 'data.xml', 'text/plain'],
    ['text/json', 'data.json', 'application/json'], ['audio/x-wav', 'sound.wav', 'audio/wav'],
    ['audio/wave', 'sound.wav', 'audio/wav'], ['audio/mp3', 'sound.mp3', 'audio/mpeg'],
    ['application/ogg', 'sound.ogg', 'audio/ogg'], ['image/jpg', 'photo.jpeg', 'image/jpeg']
  ])('uses an inline browser type for %s', (mime, name, previewMime) => {
    expect(getAttachmentPreviewMime({ mime, name, dataUrl: `data:${mime};base64,AA==` })).toBe(previewMime);
    expect(getAttachmentPreviewMime({ mime: '', name, dataUrl: 'data:;base64,AA==' })).toBe(previewMime);
  });

  it('preserves every byte of a 100 KB PDF and a large attachment', async () => {
    for (const size of [100 * 1024, 10 * 1024 * 1024]) {
      const bytes = Buffer.alloc(size);
      for (let index = 0; index < size; index++) bytes[index] = index % 256;
      const url = createAttachmentPreviewUrl(`data:application/pdf;base64,${bytes.toString('base64')}`, 'application/pdf');
      expect(url).toMatch(/^blob:/);
      try {
        expect(Buffer.from(await (await fetch(url!)).arrayBuffer()).equals(bytes)).toBe(true);
      } finally {
        URL.revokeObjectURL(url!);
      }
    }
  });

  it.each(['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/zip', 'text/html', 'image/svg+xml', 'image/heic', 'image/tiff'])('does not offer unsupported %s even with a PDF filename', (mime) => {
    expect(getAttachmentPreviewMime({ mime, name: 'misleading.pdf', dataUrl: `data:${mime};base64,AA==` })).toBeNull();
  });

  it('prefers the embedded type, normalizes case and parameters, and rejects unknown extensions', () => {
    expect(getAttachmentPreviewMime({ mime: 'image/png', name: 'photo.png', dataUrl: 'data:text/html;base64,AA==' })).toBeNull();
    expect(getAttachmentPreviewMime({ mime: ' APPLICATION/PDF; charset=binary ', name: 'document', dataUrl: 'data:;base64,AA==' })).toBe('application/pdf');
    expect(getAttachmentPreviewMime({ mime: '', name: 'constructor', dataUrl: 'data:;base64,AA==' })).toBeNull();
  });

  it.each([
    ['data:application/octet-stream;base64,AP+AQQ==', [0, 255, 128, 65]],
    ['data:image/png,%00%41', [0, 65]],
    ['data:image/png,%00%FF%80A', [0, 255, 128, 65]],
    ['data:application/pdf,%E2%9C%93', [226, 156, 147]]
  ])('preserves the bytes in %s and uses the preview MIME', async (dataUrl, bytes) => {
    const url = createAttachmentPreviewUrl(dataUrl, 'application/pdf');
    expect(url).toMatch(/^blob:/);
    try {
      const response = await fetch(url!);
      expect(response.headers.get('content-type')).toBe('application/pdf');
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual(bytes);
    } finally {
      URL.revokeObjectURL(url!);
    }
  });

  it.each(['invalid', 'data:application/pdf;base64,@@@', 'data:application/pdf,%'])('does not create a preview for malformed data: %s', (dataUrl) => {
    expect(createAttachmentPreviewUrl(dataUrl, 'application/pdf')).toBeNull();
  });

  it('provides a valid manual board with supported, unsupported, generic and empty cases', () => {
    const board: unknown = JSON.parse(readFileSync('tests/fixtures/manual/us-23.board.json', 'utf8'));
    validateBoardData(board);
    expect(board.board.tasks[0].attachments.map(getAttachmentPreviewMime)).toEqual([
      'image/png', 'image/jpeg', 'application/pdf', 'application/pdf', null, null, null
    ]);
    expect(board.board.tasks[1].attachments).toEqual([]);
  });
});
