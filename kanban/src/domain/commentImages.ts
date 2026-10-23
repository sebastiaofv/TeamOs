import type { Attachment } from './types';
import { ATTACHMENT_HARD_MAX_BYTES } from './constants';
import { hasExactKeys, normalizeTimestamp } from './util';

export type CommentErrorCode = 'author' | 'body' | 'length' | 'count' | 'size' | 'format' | 'identity' | 'readOnly' | 'record';
export class CommentError extends Error {
    constructor(public readonly code: CommentErrorCode) { super(`Invalid comment: ${code}.`); }
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function decodeCommentImage(dataUrl: string): { mime: string; bytes: Uint8Array } {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
    if (!match || match[2].length % 4 || !match[2].length) throw new CommentError('format');
    const encoded = match[2];
    const size = encoded.length / 4 * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
    if (size > ATTACHMENT_HARD_MAX_BYTES) throw new CommentError('size');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (let i = 0; i < encoded.length; i += 4) {
        const bits = (alphabet.indexOf(encoded[i]) << 18) | (alphabet.indexOf(encoded[i + 1]) << 12) | ((alphabet.indexOf(encoded[i + 2]) & 63) << 6) | (alphabet.indexOf(encoded[i + 3]) & 63);
        if (offset < size) bytes[offset++] = bits >>> 16 & 255;
        if (offset < size) bytes[offset++] = bits >>> 8 & 255;
        if (offset < size) bytes[offset++] = bits & 255;
    }
    return { mime: match[1], bytes };
}

/** Structural checks are pure; the browser adapter additionally decodes the actual pixels on import/save/paste. */
export function imageMimeFromBytes(bytes: Uint8Array): string {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const text = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length));
    if (bytes.length >= 33 && bytes.slice(0, 8).every((byte, i) => byte === [137, 80, 78, 71, 13, 10, 26, 10][i])) {
        let offset = 8; let header = false; let pixels = false; let end = false;
        while (offset + 12 <= bytes.length) {
            const length = view.getUint32(offset); const kind = text(offset + 4, 4);
            if (offset + 12 + length > bytes.length) throw new CommentError('format');
            if (!header && (kind !== 'IHDR' || length !== 13 || !view.getUint32(offset + 8) || !view.getUint32(offset + 12))) throw new CommentError('format');
            if (kind === 'IHDR') header = true;
            if (kind === 'IDAT' && length) pixels = true;
            offset += 12 + length;
            if (kind === 'IEND') { end = length === 0 && offset === bytes.length; break; }
        }
        if (header && pixels && end) return 'image/png';
    }
    if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
        let offset = 2; let dimensions = false;
        while (offset + 4 < bytes.length) {
            if (bytes[offset++] !== 255) break;
            while (bytes[offset] === 255) offset++;
            if (offset + 3 >= bytes.length) break;
            const marker = bytes[offset++];
            if (marker === 218 && dimensions) return 'image/jpeg';
            const length = view.getUint16(offset);
            if (length < 2 || offset + length > bytes.length) break;
            if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8 && view.getUint16(offset + 3) && view.getUint16(offset + 5)) dimensions = true;
            offset += length;
        }
    }
    if (bytes.length >= 20 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP' && view.getUint32(4, true) + 8 === bytes.length) {
        let offset = 12; let pixels = false;
        while (offset + 8 <= bytes.length) {
            const kind = text(offset, 4); const length = view.getUint32(offset + 4, true);
            if (offset + 8 + length > bytes.length) throw new CommentError('format');
            if ((kind === 'VP8 ' && length >= 10) || (kind === 'VP8L' && length >= 5 && bytes[offset + 8] === 47) || (kind === 'ANMF' && length > 16)) pixels = true;
            offset += 8 + length + length % 2;
        }
        if (pixels && offset === bytes.length) return 'image/webp';
    }
    throw new CommentError('format');
}

export function validateCommentImage(value: unknown): asserts value is Attachment {
    if (!hasExactKeys(value, ['id', 'name', 'mime', 'sizeBytes', 'kind', 'dataUrl', 'createdAt']) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !value.name.trim() || value.kind !== 'image' || typeof value.dataUrl !== 'string' || !normalizeTimestamp(value.createdAt)) throw new CommentError('format');
    const decoded = decodeCommentImage(value.dataUrl);
    if (imageMimeFromBytes(decoded.bytes) !== decoded.mime || value.mime !== decoded.mime || value.sizeBytes !== decoded.bytes.length) throw new CommentError('format');
}
