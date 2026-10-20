import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { normalizeTask, nextTaskIdForBoard } from '../../src/domain/task';
import { buildComment, conversationWorkitemKey, getComments, parseConversations, validateCommentInput, visibleComments, type CommentInput } from '../../src/domain/comments';
import { validateCommentImage, imageMimeFromBytes, decodeCommentImage } from '../../src/domain/commentImages';
import { appendTimelineEvent, ensureBoardTimelineBaseline, reconstructBoardStateFromTimeline, recordTaskTimelineEvent } from '../../src/domain/timeline';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from '../../src/domain/serialize';
import { calculateBoardAttachmentBytes } from '../../src/domain/attachments';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';
import { allConversationDrafts, discardConversationDraft, getConversationDraft, updateConversationDraft } from '../../src/features/portfolio/task/conversationDrafts';
import type { BoardData } from '../../src/domain/types';

const stamp = '2026-10-19T10:00:00.000Z';
const fixture = (): BoardData => JSON.parse(readFileSync('test-board/us-7.board.json', 'utf8'));
const input = (id = 'c1'): CommentInput => ({ id, author: 'Explicit Ana', text: 'First line\nSecond @Bruno https://example.test/path', images: [] });
function setup() {
    const data = createEmptyProjectData('Conversation');
    data.board.tasks = [normalizeTask({ id: 1, title: 'Item', description: 'Independent', status: 'done', archived: true, createdAt: stamp })];
    return data;
}
function publish(data: BoardData, value = input()) {
    ensureBoardTimelineBaseline(data);
    const comment = buildComment(data, 1, value, { writable: true, historical: false });
    data.extensions.conversations = { version: 1, entries: [...getComments(data), comment] };
    appendTimelineEvent(data, { id: comment.eventId, at: comment.at, kind: 'task.comment.published', entityType: 'task', entityId: '1', summary: 'Comment published', meta: { commentId: comment.id, workitemKey: comment.workitemKey, author: comment.author } });
    return comment;
}

describe('offline immutable conversations', () => {
    it('validates and round-trips the manual board, including 55 ordered comments, image-only content and old projects', () => {
        const data = fixture(); validateBoardData(data);
        const next = serializeBoardDataFromObject(data); validateBoardData(next);
        expect(getComments(next)).toEqual(getComments(data));
        expect(visibleComments(next, next.board.tasks[0])).toHaveLength(55);
        expect(visibleComments(next, next.board.tasks[0]).at(-1)?.id).toBe('us7-comment-55');
        expect(getComments(serializeBoardDataFromObject(setup()))).toEqual([]);
    });
    it('requires explicit authors, validates empty/image-only/oversized bodies, and never truncates', () => {
        expect(() => validateCommentInput({ ...input(), author: ' ' })).toThrow(/author/);
        expect(() => validateCommentInput({ ...input(), text: ' \n\t' })).toThrow(/body/);
        expect(() => validateCommentInput({ ...input(), text: 'x'.repeat(10001) })).toThrow(/length/);
        expect(() => validateCommentInput({ ...input(), text: '', images: fixture().extensions.conversations!.entries[0].images })).not.toThrow();
        expect(() => validateCommentInput({ ...input(), images: Array.from({ length: 11 }, () => fixture().extensions.conversations!.entries[0].images[0]) })).toThrow(/count/);
    });
    it('checks real image signatures, data size and safe MIME instead of trusting names', () => {
        const image = fixture().extensions.conversations!.entries[0].images[0];
        expect(() => validateCommentImage(image)).not.toThrow();
        expect(imageMimeFromBytes(decodeCommentImage(image.dataUrl).bytes)).toBe('image/png');
        expect(() => validateCommentImage({ ...image, sizeBytes: 1 })).toThrow(/format/);
        expect(() => validateCommentImage({ ...image, dataUrl: 'data:image/png;base64,PHN2Zz48L3N2Zz4=' })).toThrow(/format/);
        expect(() => validateCommentImage({ ...image, dataUrl: image.dataUrl.replace('image/png', 'image/svg+xml') })).toThrow(/format/);
        expect(() => validateCommentImage({ ...image, dataUrl: image.dataUrl.slice(0, -8) })).toThrow(/format/);
    });
    it('publishes only in writable current contexts and does not change normal task fields', () => {
        const data = setup(); const before = structuredClone(data.board.tasks[0]);
        expect(() => buildComment(data, 1, input(), { writable: false, historical: false })).toThrow(/readOnly/);
        expect(() => buildComment(data, 1, input(), { writable: true, historical: true })).toThrow(/readOnly/);
        const comment = publish(data);
        expect(data.board.tasks[0]).toEqual(before);
        expect(comment.author).toEqual({ name: 'Explicit Ana', kind: 'local' });
        expect(JSON.stringify(data.extensions.timeline)).not.toContain('First line');
        expect(() => publish(data)).toThrow(/record/);
    });
    it('keeps content canonical, replays publication references, and cuts by sequence rather than time', () => {
        const data = setup(); publish(data); publish(data, input('c2'));
        const projected = reconstructBoardStateFromTimeline(data, 1);
        expect(getComments(projected).map((comment) => comment.id)).toEqual(['c1']);
        validateBoardData(projected);
        expect(createBoardStateSnapshot(data).extensions.conversations).toBeUndefined();
        expect(visibleComments(data, data.board.tasks[0], 0)).toEqual([]);
    });
    it('preserves published conversations through project restore, deletion and recovery of the same item', async () => {
        const data = setup(); publish(data);
        const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Conversation', handle: {}, data })], selectedPortfolioBoardId: 'p', portfolioTimelineSelection: { boardId: 'p', eventIndex: 0 } });
        const actions = createPortfolioMutationActions({ store, enqueueSave: async () => true, markDirty: vi.fn(), openDialogFn: vi.fn(), closeDialogFn: vi.fn() });
        expect(await actions.restorePortfolioTimelineSelection()).toBe(true);
        const restored = store.getState().portfolioBoards[0].data;
        expect(visibleComments(restored, restored.board.tasks[0])).toHaveLength(1);
        const old = restored.board.tasks.pop()!; recordTaskTimelineEvent(restored, old, null);
        expect(getComments(serializeBoardDataFromObject(restored))).toHaveLength(1);
        expect(nextTaskIdForBoard({ data: restored })).toBe(2);
    });
    it('separates proven legacy lifecycles instead of linking by numeric ID', () => {
        const data = setup(); publish(data);
        const old = data.board.tasks.pop()!; recordTaskTimelineEvent(data, old, null);
        const fresh = normalizeTask({ ...old, createdAt: '2026-10-20T10:00:00Z' });
        data.board.tasks.push(fresh); recordTaskTimelineEvent(data, null, fresh);
        expect(conversationWorkitemKey(data, fresh)).not.toBe(getComments(data)[0].workitemKey);
        expect(visibleComments(data, fresh)).toHaveLength(0);
    });
    it('publishes atomically once even when saving fails and retains the applied ID/timestamp', async () => {
        const data = setup();
        const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Conversation', handle: {}, data })] });
        const applied = vi.fn(); const alert = vi.fn();
        const actions = createPortfolioMutationActions({ store, enqueueSave: async () => false, markDirty: vi.fn(), openDialogFn: vi.fn(), alert });
        expect(await actions.publishPortfolioComment('p', 1, input(), applied)).toBe(true);
        const current = store.getState().portfolioBoards[0].data;
        const original = getComments(current)[0];
        expect(applied).toHaveBeenCalledTimes(1);
        expect(await actions.publishPortfolioComment('p', 1, input())).toBe(false);
        const reopened = serializeBoardDataFromObject(store.getState().portfolioBoards[0].data);
        expect(getComments(reopened)).toEqual([original]);
        expect(reopened.extensions.timeline!.events.filter((event) => event.kind === 'task.comment.published')).toHaveLength(1);
    });
    it('rejects corrupt identities/references/content and includes canonical images in project byte warnings', () => {
        const data = fixture();
        expect(calculateBoardAttachmentBytes(data)).toBe(210);
        const broken = structuredClone(data.extensions.conversations!); broken.entries[0].eventId = 'missing';
        expect(() => parseConversations(broken, data.extensions.timeline!.events)).toThrow(/record/);
        const oversized = structuredClone(data.extensions.conversations!); oversized.entries[0].text = 'x'.repeat(10001);
        expect(() => parseConversations(oversized, data.extensions.timeline!.events)).toThrow(/length/);
        const missing = structuredClone(data); delete missing.extensions.conversations;
        expect(() => validateBoardData(missing)).toThrow(/record/);
    });
    it('retains drafts in session memory until explicit discard, without storing them in project JSON', () => {
        const key = 'test-project/task';
        updateConversationDraft(key, { projectId: 'test-project', taskId: 1, title: 'Item', workitemKey: 'task' }, { text: 'Unsent', author: 'Ana' });
        expect(getConversationDraft(key)?.text).toBe('Unsent');
        expect(allConversationDrafts().some(([entry]) => entry === key)).toBe(true);
        expect(JSON.stringify(serializeBoardDataFromObject(setup()))).not.toContain('Unsent');
        discardConversationDraft(key); expect(getConversationDraft(key)).toBeUndefined();
    });
});
