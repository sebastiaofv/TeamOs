import type { Attachment, LooseBoardData } from '@/domain/types';
import { CommentError, decodeCommentImage, imageMimeFromBytes, validateCommentImage } from '@/domain/commentImages';
import { getComments } from '@/domain/comments';
import { ATTACHMENT_HARD_MAX_BYTES } from '@/domain/constants';
import { createAttachmentId } from '@/domain/attachments';
import { readFileAsDataUrl } from './fileReader';
import { nowIso } from '@/domain/util';

const decoded = new Set<string>();
let cachedCharacters = 0;
export async function validateCommentImagePixels(image: Attachment): Promise<void> {
    validateCommentImage(image);
    if (decoded.has(image.dataUrl)) return;
    const { bytes, mime } = decodeCommentImage(image.dataUrl);
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mime }));
            if (!bitmap.width || !bitmap.height) throw new CommentError('format');
            bitmap.close();
        } catch { throw new CommentError('format'); }
    } else if (typeof Image !== 'undefined') {
        await new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => img.naturalWidth && img.naturalHeight ? resolve() : reject(new CommentError('format'));
            img.onerror = () => reject(new CommentError('format'));
            img.src = image.dataUrl;
        });
    } else throw new CommentError('format');
    decoded.add(image.dataUrl);
    cachedCharacters += image.dataUrl.length;
    while (cachedCharacters > 16 * 1024 * 1024 && decoded.size > 1) {
        const oldest = decoded.values().next().value!;
        decoded.delete(oldest); cachedCharacters -= oldest.length;
    }
}

export async function readCommentImage(file: File): Promise<Attachment> {
    if (file.size > ATTACHMENT_HARD_MAX_BYTES) throw new CommentError('size');
    const mime = imageMimeFromBytes(new Uint8Array(await file.arrayBuffer()));
    const dataUrl = (await readFileAsDataUrl(file)).replace(/^data:[^,]*,/, `data:${mime};base64,`);
    const image: Attachment = { id: createAttachmentId(), name: file.name || 'Screenshot', mime, sizeBytes: file.size, kind: 'image', dataUrl, createdAt: nowIso() };
    await validateCommentImagePixels(image);
    return image;
}

export async function validateConversationPixels(data: LooseBoardData): Promise<void> {
    for (const comment of getComments(data)) for (const image of comment.images) await validateCommentImagePixels(image);
}
