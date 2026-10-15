import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { normalizeTask, nextTaskIdForBoard } from '../../src/domain/task';
import { getProjectInfo } from '../../src/domain/project';
import { appendComment, getTaskComments } from '../../src/domain/comments';
import { appendTimelineEvent, ensureBoardTimelineBaseline, reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { getWorkflow, applyWorkflow } from '../../src/domain/workflow';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';
import type { BoardData } from '../../src/domain/types';
import type { BoardRecord } from '../../src/features/portfolio/types';

function board() {
    const data = serializeBoardDataFromObject(createEmptyProjectData('Current project'));
    data.board.tasks = [normalizeTask({ id: 1, title: 'Task', status: 'doing' })];
    return data;
}
function harness(data: BoardData) {
    const record: BoardRecord = { id: 'board', data, title: data.board.settings.title, fileName: 'board.json', colorSeed: 0, handle: fromPartial({ name: 'board.json' }) };
    const store = createAppStore({ portfolioBoards: [record], selectedPortfolioBoardId: record.id });
    const alert = vi.fn();
    const actions = createPortfolioMutationActions({ store, enqueueSave: async () => true, markDirty: vi.fn(), alert, confirm: async () => true, closeDialogFn: vi.fn(), openDialogFn: vi.fn() });
    return { store, actions, alert };
}

describe('business story review regressions', () => {
    it('retains immutable comment content after restoring a pre-comment snapshot', async () => {
        const data = board(); ensureBoardTimelineBaseline(data);
        const comment = appendComment(data, 1, 'Must remain recoverable', [], null);
        appendTimelineEvent(data, { kind: 'workitem.comment.added', entityType: 'task', entityId: '1', summary: 'Comment added', meta: { commentId: comment.id } });
        const { store, actions } = harness(data);
        actions.setPortfolioTimelineSelection('board', 0);
        expect(await actions.restorePortfolioTimelineSelection()).toBe(true);
        const restored = store.getState().portfolioBoards[0].data;
        expect(getTaskComments(restored, 1)).toEqual([comment]);
        expect(getTaskComments(reconstructBoardStateFromTimeline(restored, 1), 1)).toEqual([comment]);
    });

    it('never reuses a restored-away task ID that still owns comments or history', async () => {
        const data = board(); ensureBoardTimelineBaseline(data);
        const added = normalizeTask({ id: 2, title: 'Original second task' }); data.board.tasks.push(added);
        appendTimelineEvent(data, { kind: 'task.created', entityType: 'task', entityId: '2', summary: 'Created', snapshot: added });
        const comment = appendComment(data, 2, 'Belongs only to the old task', [], null);
        appendTimelineEvent(data, { kind: 'workitem.comment.added', entityType: 'task', entityId: '2', summary: 'Comment added', meta: { commentId: comment.id } });
        const { store, actions } = harness(data); actions.setPortfolioTimelineSelection('board', 0);
        expect(await actions.restorePortfolioTimelineSelection()).toBe(true);
        const record = store.getState().portfolioBoards[0];
        const nextId = nextTaskIdForBoard(record);
        expect(nextId).toBe(3);
        expect(getTaskComments(record.data, nextId)).toEqual([]);
        expect(getTaskComments(record.data, 2)).toEqual([comment]);
    });

    it('confirmed restore bypasses ordinary workflow and active-assignment guards', async () => {
        const data = board(), workflow = getWorkflow(data);
        workflow.transitions = [{ from: 'doing', to: 'done' }]; applyWorkflow(data, workflow, {});
        data.extensions.project = { ...getProjectInfo(data), team: [{ id: 'ana', name: 'Ana', role: '', email: '', active: true }] };
        data.board.tasks[0].assigneeId = 'ana'; data.board.tasks[0].assignees = ['Ana'];
        ensureBoardTimelineBaseline(data);
        data.board.tasks[0].status = 'done'; getProjectInfo(data).team[0].active = false;
        appendTimelineEvent(data, { kind: 'task.status.changed', entityType: 'task', entityId: '1', summary: 'Completed', changes: { status: { before: 'doing', after: 'done' } } });
        const { store, actions, alert } = harness(data);
        actions.setPortfolioTimelineSelection('board', 0);
        expect(await actions.restorePortfolioTimelineSelection(), JSON.stringify(alert.mock.calls)).toBe(true);
        expect(store.getState().portfolioBoards[0].data.board.tasks[0].status).toBe('doing');
    });

    it('legacy timeline titles cannot change persistent project identity', () => {
        const data = board(), identity = getProjectInfo(data).id;
        const legacy = createEmptyProjectData('Old project title'); legacy.meta.createdAt = data.meta.createdAt;
        data.extensions.timeline = { version: 1, baselineEventId: 'legacy', events: [{ id: 'legacy', at: data.meta.createdAt, kind: 'board.baseline', entityType: 'board', entityId: 'board', summary: 'Legacy baseline', snapshot: legacy }] };
        expect(getProjectInfo(reconstructBoardStateFromTimeline(data, 0)).id).toBe(identity);
    });

    it('persists the selected unverified local author on the stored audit event', async () => {
        const data = board();
        data.extensions.project = { ...getProjectInfo(data), team: [{ id: 'ana', name: 'Ana', role: '', email: '', active: true }] };
        const { store, actions } = harness(data);
        store.setState({ localProfiles: { [getProjectInfo(data).id]: 'ana' } });
        expect(await actions.movePortfolioTaskToStatus('board', 1, 'done')).toBe(true);
        expect(store.getState().portfolioBoards[0].data.extensions.timeline!.events.at(-1)?.meta?.actor).toEqual({ id: 'ana', name: 'Ana', verified: false });
    });

    it('rejects malformed imported comment images before rendering', () => {
        const data = board();
        data.extensions.conversation = { version: 1, byTaskId: { 1: [{ id: 'comment', at: data.meta.createdAt, author: null, body: 'Bad image', images: [null] }] } };
        expect(() => validateBoardData(data)).toThrow(/comment|image/i);
    });

    it('round-trips valid custom workflow IDs not generated by this UI', () => {
        const data = board(), workflow = getWorkflow(data);
        workflow.states.push({ id: 'review', name: 'Review', color: '#123456', category: 'completed' });
        applyWorkflow(data, workflow, {}); data.board.tasks[0].status = 'review'; validateBoardData(data);
        const reopened = serializeBoardDataFromObject(data);
        expect(reopened.board.tasks[0].status).toBe('review');
        expect(reopened.board.columns.some((column) => column.status === 'review')).toBe(true);
    });
});
