import type { Attachment, BoardData, LooseBoardData, Task, TimelineEvent } from './types';
import { CommentError, validateCommentImage } from './commentImages';
import { cloneSerializable } from './serializable';
import { hasExactKeys, normalizeTimestamp, nowIso } from './util';

export type WorkitemComment = {
    id: string; taskId: number; workitemKey: string; workitemCreatedAt: string; eventId: string; at: string;
    author: { name: string; kind: 'local'; memberId?: string }; text: string; images: Attachment[];
};
export type Conversations = { version: 1; entries: WorkitemComment[] };
export type CommentInput = { id: string; author: string; memberId?: string; text: string; images: Attachment[] };

function events(data: LooseBoardData): TimelineEvent[] {
    const timeline = data.extensions?.timeline as { events?: TimelineEvent[] } | undefined;
    return Array.isArray(timeline?.events) ? timeline.events : [];
}
const signature = (task: Pick<Task, 'id' | 'createdAt'>) => `${task.id}:${normalizeTimestamp(task.createdAt)}`;

/** Same canonical lifecycle boundaries as history: no title, author or timestamp proximity guesses. */
export function conversationWorkitemKey(data: LooseBoardData, task: Pick<Task, 'id' | 'createdAt'>, cutoff?: number): string | null {
    const sequence = events(data);
    const registry = new Map<string, Set<string>>();
    let currentSignature = ''; let active: string | null = null;
    const register = (item: Pick<Task, 'id' | 'createdAt'>, key: string) => { currentSignature = signature(item); registry.set(currentSignature, new Set([...(registry.get(currentSignature) || []), key])); active = key; };
    const initial = sequence[0]?.snapshot?.board?.tasks?.find((item) => item.id === task.id);
    if (initial) register(initial, `baseline:${sequence[0].id}:${task.id}`);
    const end = cutoff === undefined ? sequence.length - 1 : Math.min(cutoff, sequence.length - 1);
    for (let index = 1; index <= end; index++) {
        const event = sequence[index];
        if (event.kind === 'task.created' && Number(event.entityId) === task.id && event.snapshot) register(event.snapshot as Task, `created:${event.id}:${index}`);
        else if (event.kind === 'task.deleted' && Number(event.entityId) === task.id) { active = null; currentSignature = ''; }
        else if (event.kind === 'board.restored' && event.snapshot?.board) {
            const restored = event.snapshot.board.tasks.find((item) => item.id === task.id);
            if (!restored) { active = null; currentSignature = ''; continue; }
            const known = registry.get(signature(restored));
            if (known?.size === 1) { active = [...known][0]; currentSignature = signature(restored); }
            else if (known?.size) { active = null; currentSignature = ''; }
            else register(restored, `snapshot:${event.id}:${task.id}`);
        }
    }
    if (active && currentSignature === signature(task)) return active;
    const matching = registry.get(signature(task));
    if (matching?.size === 1) return [...matching][0];
    if (registry.size || sequence.slice(0, end + 1).some((event) => Number(event.entityId) === task.id && ['task.created', 'task.deleted'].includes(event.kind))) return null;
    return `legacy:${signature(task)}`;
}

export function validateCommentInput(input: CommentInput): void {
    if (typeof input.id !== 'string' || !input.id) throw new CommentError('record');
    if (typeof input.author !== 'string' || !input.author.trim()) throw new CommentError('author');
    if (typeof input.text !== 'string' || input.text.length > 10000) throw new CommentError('length');
    if (!Array.isArray(input.images) || input.images.length > 10) throw new CommentError('count');
    if (!input.text.trim() && !input.images.length) throw new CommentError('body');
    const ids = new Set<string>();
    input.images.forEach((image) => { validateCommentImage(image); if (ids.has(image.id)) throw new CommentError('record'); ids.add(image.id); });
}

export function parseConversations(value: unknown, sequence?: readonly TimelineEvent[]): Conversations | undefined {
    if (value === undefined) {
        if (sequence?.some((event) => event.kind === 'task.comment.published')) throw new CommentError('record');
        return undefined;
    }
    if (!hasExactKeys(value, ['version', 'entries']) || value.version !== 1 || !Array.isArray(value.entries)) throw new CommentError('record');
    if (value.entries.length && !sequence) throw new CommentError('record');
    const ids = new Set<string>(); const imageIds = new Set<string>();
    const eventIndices = new Map(sequence?.map((event, index) => [event.id, index]));
    let previousIndex = -1;
    for (const item of value.entries) {
        if (!hasExactKeys(item, ['id', 'taskId', 'workitemKey', 'workitemCreatedAt', 'eventId', 'at', 'author', 'text', 'images']) || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !Number.isSafeInteger(item.taskId) || Number(item.taskId) <= 0 || typeof item.workitemKey !== 'string' || !item.workitemKey || typeof item.eventId !== 'string' || !item.eventId || !normalizeTimestamp(item.at) || !normalizeTimestamp(item.workitemCreatedAt)) throw new CommentError('record');
        const author = item.author as WorkitemComment['author'];
        if (!author || author.kind !== 'local' || typeof author.name !== 'string' || (author.memberId !== undefined && typeof author.memberId !== 'string') || Object.keys(author).some((key) => !['name', 'kind', 'memberId'].includes(key))) throw new CommentError('author');
        validateCommentInput({ id: item.id, author: author.name, text: item.text as string, images: item.images as Attachment[] });
        for (const image of item.images as Attachment[]) { if (imageIds.has(image.id)) throw new CommentError('record'); imageIds.add(image.id); }
        ids.add(item.id);
        if (sequence) {
            const index = eventIndices.get(item.eventId);
            if (index === undefined || index <= previousIndex) throw new CommentError('record');
            const event = sequence[index];
            if (sequence.filter((entry) => entry.id === item.eventId).length !== 1) throw new CommentError('record');
            if (event.kind !== 'task.comment.published' || event.entityId !== String(item.taskId) || event.meta?.commentId !== item.id || event.meta.workitemKey !== item.workitemKey || normalizeTimestamp(event.at) !== normalizeTimestamp(item.at)) throw new CommentError('record');
            previousIndex = index;
        }
    }
    if (sequence?.some((event) => event.kind === 'task.comment.published' && !ids.has(String(event.meta?.commentId)))) throw new CommentError('record');
    if (sequence && sequence.filter((event) => event.kind === 'task.comment.published').length !== value.entries.length) throw new CommentError('record');
    return cloneSerializable(value) as Conversations;
}

export function getComments(data: LooseBoardData | null | undefined): WorkitemComment[] {
    const value = data?.extensions?.conversations as Conversations | undefined;
    return Array.isArray(value?.entries) ? value.entries : [];
}

export function visibleComments(data: BoardData, task: Task, cutoff?: number): WorkitemComment[] {
    const key = conversationWorkitemKey(data, task, cutoff);
    const indices = new Map(events(data).map((event, index) => [event.id, index]));
    return getComments(data).filter((comment) => comment.workitemKey === key && (cutoff === undefined || (indices.get(comment.eventId) ?? Infinity) <= cutoff));
}

/** Content is canonical here, once. The caller appends the lightweight canonical event in the same mutation. */
export function buildComment(data: BoardData, taskId: number, input: CommentInput, permission: { writable: boolean; historical: boolean }): WorkitemComment {
    if (!permission.writable || permission.historical) throw new CommentError('readOnly');
    validateCommentInput(input);
    const task = data.board.tasks.find((item) => item.id === taskId);
    const key = task && conversationWorkitemKey(data, task);
    if (!task || !key) throw new CommentError('identity');
    if (getComments(data).some((comment) => comment.id === input.id)) throw new CommentError('record');
    const usedImages = new Set(getComments(data).flatMap((comment) => comment.images).map((image) => image.id));
    if (input.images.some((image) => usedImages.has(image.id)) || events(data).some((event) => event.id === `comment-event-${input.id}`)) throw new CommentError('record');
    return { id: input.id, taskId, workitemKey: key, workitemCreatedAt: task.createdAt, eventId: `comment-event-${input.id}`, at: nowIso(),
        author: { name: input.author.trim(), kind: 'local', ...(input.memberId ? { memberId: input.memberId } : {}) }, text: input.text, images: cloneSerializable(input.images) };
}

export function commentsThrough(data: LooseBoardData, cutoff: number): Conversations | undefined {
    const allowed = new Set(events(data).slice(0, cutoff + 1).filter((event) => event.kind === 'task.comment.published').map((event) => String(event.meta?.commentId)));
    const entries = getComments(data).filter((comment) => allowed.has(comment.id));
    return data.extensions?.conversations ? { version: 1, entries: cloneSerializable(entries) } : undefined;
}
