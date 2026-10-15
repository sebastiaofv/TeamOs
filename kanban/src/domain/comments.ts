import type { Attachment, BoardData, LooseBoardData } from './types';
import { newLocalId } from './project';
import { nowIso } from './util';
import { ATTACHMENT_MAX_COUNT } from './constants';
import { exceedsAttachmentHardLimit } from './attachments';

export const COMMENT_MAX_LENGTH = 10000;

export type LocalAuthor = { id: string; name: string; verified: false };
export type WorkitemComment = { id: string; at: string; author: LocalAuthor | null; body: string; images: Attachment[] };
export type Conversation = { version: 1; byTaskId: Record<string, WorkitemComment[]> };
export function getConversation(data: LooseBoardData): Conversation {
    const value = data.extensions?.conversation as Conversation | undefined;
    if (value && (value.version !== 1 || !value.byTaskId || typeof value.byTaskId !== 'object')) throw new Error('Invalid conversation data.');
    if (value) for (const comments of Object.values(value.byTaskId)) {
        if (!Array.isArray(comments) || comments.some((comment) => !comment || typeof comment.id !== 'string' || typeof comment.body !== 'string' || !Number.isFinite(Date.parse(comment.at)) || !Array.isArray(comment.images))) throw new Error('Invalid workitem comments.');
    }
    return value || { version: 1, byTaskId: {} };
}
export function getTaskComments(data: LooseBoardData, taskId: number): WorkitemComment[] {
    return getConversation(data).byTaskId[String(taskId)] || [];
}
export function isSafeCommentImage(image: Attachment): boolean {
    return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(image.dataUrl) && ['image/png', 'image/jpeg', 'image/webp'].includes(image.mime) && image.dataUrl.startsWith(`data:${image.mime};base64,`);
}
export function appendComment(data: BoardData, taskId: number, body: string, images: Attachment[], author: LocalAuthor | null): WorkitemComment {
    if (!data.board.tasks.some((task) => task.id === taskId)) throw new Error('Workitem no longer exists.');
    const text = body.trim();
    if (!text && !images.length) throw new Error('Write a comment or paste an image.');
    if (text.length > COMMENT_MAX_LENGTH) throw new Error('Comments are limited to 10,000 characters.');
    if (images.length > ATTACHMENT_MAX_COUNT || images.some((image) => !isSafeCommentImage(image) || exceedsAttachmentHardLimit(image))) throw new Error('Use PNG/JPEG/WebP images within the attachment limits.');
    const comment: WorkitemComment = { id: newLocalId('comment'), at: nowIso(), body: text, images: structuredClone(images), author };
    data.board.tasks.find((task) => task.id === taskId)!.updatedAt = comment.at;
    const conversation = getConversation(data);
    data.extensions.conversation = { version: 1, byTaskId: { ...conversation.byTaskId, [taskId]: [...getTaskComments(data, taskId), comment] } } satisfies Conversation;
    return comment;
}
