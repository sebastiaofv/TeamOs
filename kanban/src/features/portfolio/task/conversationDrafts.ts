import { useSyncExternalStore } from 'react';
import type { Attachment, Task } from '@/domain/types';
import { normalizeTimestamp } from '@/domain/util';
import type { CommentErrorCode } from '@/domain/commentImages';

export type ConversationDraft = {
    id: string; projectId: string; taskId: number; workitemKey: string; title: string;
    text: string; author: string; images: Attachment[]; error?: CommentErrorCode; reading?: boolean;
};
const drafts = new Map<string, ConversationDraft>();
const authors = new Map<string, string>();
const listeners = new Set<() => void>();
let revision = 0;
const notify = () => { revision++; listeners.forEach((listener) => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const draftKey = (projectId: string, workitemKey: string) => `${projectId}/${workitemKey}`;
export const sessionDraftWorkitemKey = (key: string, task: Pick<Task, 'id' | 'createdAt'>) => /^(created|snapshot):/.test(key) ? key : `legacy:${task.id}:${normalizeTimestamp(task.createdAt)}`;
export function useConversationDraftRevision() { return useSyncExternalStore(subscribe, () => revision, () => 0); }
export function getConversationDraft(key: string) { return drafts.get(key); }
export function allConversationDrafts() { return [...drafts.entries()]; }
export function lastCommentAuthor(projectId: string) { return authors.get(projectId) || ''; }
export function rememberCommentAuthor(projectId: string, name: string) { authors.set(projectId, name); }
export function updateConversationDraft(key: string, context: Omit<ConversationDraft, 'id' | 'text' | 'author' | 'images'>, changes: Partial<ConversationDraft>) {
    const previous = drafts.get(key) || { ...context, id: `comment-${crypto.randomUUID()}`, text: '', author: lastCommentAuthor(context.projectId), images: [] };
    drafts.set(key, { ...previous, ...changes }); notify();
}
export function discardConversationDraft(key: string) { drafts.delete(key); notify(); }
