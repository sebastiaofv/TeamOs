import { describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { cloneSerializable } from '../../src/domain/serializable';
import { ensureBoardTimelineBaseline, recordTaskTimelineEvent } from '../../src/domain/timeline';
import { resolveTaskDetailSource } from '../../src/features/portfolio/queries/taskDetailSource';
import type { BoardRecord } from '../../src/features/portfolio/types';
import type { DetailContext } from '../../src/features/portfolio/state/slices';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';

function fixture() {
    const data = createEmptyProjectData('Alpha');
    const task = normalizeTask({ id: 1, title: 'Opened task', createdAt: '2026-10-01T12:00:00Z', checklist: [{ text: 'Review', done: false }] });
    data.board.tasks.push(task);
    ensureBoardTimelineBaseline(data);
    const board: BoardRecord = { id: 'alpha', colorSeed: 0, handle: null, fileName: 'alpha.json', title: 'Alpha', data };
    const context: DetailContext = {
        boardId: board.id, taskId: task.id, task: cloneSerializable(task), readOnly: true,
        eventId: null, openedAtEventId: data.extensions.timeline!.events[0].id
    };
    return { board, context };
}

describe('opened task detail source', () => {
    it('uses preview data for direct/palette openings and preserves its context when refreshed', () => {
        const { board } = fixture();
        const before = cloneSerializable(board.data.board.tasks[0]);
        board.data.board.tasks[0].title = 'Current title';
        recordTaskTimelineEvent(board.data, before, board.data.board.tasks[0]);
        const store = createAppStore({
            portfolioBoards: [board, { ...fixture().board, id: 'other' }], selectedPortfolioBoardId: '',
            portfolioTimelineSelection: { boardId: board.id, eventIndex: 0 }
        });
        const openDialogFn = vi.fn();
        const markDirty = vi.fn();
        const enqueueSave = vi.fn();
        const actions = createPortfolioMutationActions({ store, openDialogFn, markDirty, enqueueSave });
        actions.openPortfolioTaskDetails(board.id, 1);
        expect(openDialogFn.mock.calls.at(-1)![1].fields.title).toBe('Opened task');
        const context = store.getState().portfolioDetailContext!;
        expect(context).toMatchObject({ readOnly: true, eventId: board.data.extensions.timeline!.events[0].id });
        const selected = store.getState().selectedPortfolioCardRef;
        // An independently updated selection must not retarget the open detail.
        store.setState({ selectedPortfolioBoardId: 'other', portfolioTimelineSelection: { boardId: board.id, eventIndex: 1 } });
        actions.refreshTaskDetail(board.id);
        expect(store.getState().portfolioDetailContext).toBe(context);
        expect(store.getState().selectedPortfolioBoardId).toBe('other');
        expect(store.getState().selectedPortfolioCardRef).toBe(selected);
        expect(store.getState().portfolioTimelineSelection.eventIndex).toBe(1);
        expect(openDialogFn.mock.calls.at(-1)![1].fields.title).toBe('Opened task');
        expect(markDirty).not.toHaveBeenCalled();
        expect(enqueueSave).not.toHaveBeenCalled();
    });

    it('reads the opened project and updated data without mutating the loaded record', () => {
        const { board, context } = fixture();
        const before = cloneSerializable(board.data.board.tasks[0]);
        board.data.board.tasks[0].checklist[0].done = true;
        recordTaskTimelineEvent(board.data, before, board.data.board.tasks[0]);
        const loaded = cloneSerializable(board);
        const result = resolveTaskDetailSource(board, context)!;
        expect(result.source.task.checklist[0].done).toBe(true);
        expect(result.source.boardRecord.data.extensions.timeline!.events).toHaveLength(2);
        expect(result.source.boardData).not.toBe(board.data);
        expect(board).toEqual(loaded);
        expect(resolveTaskDetailSource({ ...board, id: 'other' }, context)).toBeNull();
    });

    it('pins the inclusive historical boundary by event identity after a reload', () => {
        const { board, context } = fixture();
        const before = cloneSerializable(board.data.board.tasks[0]);
        board.data.board.tasks[0].title = 'Historical title';
        recordTaskTimelineEvent(board.data, before, board.data.board.tasks[0]);
        context.eventId = board.data.extensions.timeline!.events[1].id;
        const historical = cloneSerializable(board.data.board.tasks[0]);
        board.data.board.tasks[0].title = 'Future title';
        recordTaskTimelineEvent(board.data, historical, board.data.board.tasks[0]);
        const loaded = cloneSerializable(board);
        const result = resolveTaskDetailSource(cloneSerializable(board), context)!;
        expect(result.eventIndex).toBe(1);
        expect(result.source.task.title).toBe('Historical title');
        expect(result.source.boardRecord.data.extensions.timeline!.events).toHaveLength(3);
        expect(board).toEqual(loaded);
        board.data.extensions.timeline!.events.splice(1, 1);
        expect(resolveTaskDetailSource(board, context)).toBeNull();
    });

    it('does not switch to a deleted or reused task, even with identical creation timestamps', () => {
        const { board, context } = fixture();
        const old = board.data.board.tasks.pop()!;
        recordTaskTimelineEvent(board.data, old, null);
        expect(resolveTaskDetailSource(board, context)).toBeNull();
        const replacement = normalizeTask({ ...old, title: 'Another lifecycle' });
        board.data.board.tasks.push(replacement);
        recordTaskTimelineEvent(board.data, null, replacement);
        expect(resolveTaskDetailSource(board, context)).toBeNull();
    });

    it('can recover the original lifecycle through a proven project restoration after reuse', () => {
        const { board, context } = fixture();
        const baseline = cloneSerializable(board.data.extensions.timeline!.events[0]);
        const old = board.data.board.tasks.pop()!;
        recordTaskTimelineEvent(board.data, old, null);
        const replacement = normalizeTask({ ...old, title: 'Other task', createdAt: '2026-10-02T12:00:00Z' });
        board.data.board.tasks.push(replacement);
        recordTaskTimelineEvent(board.data, null, replacement);
        board.data.board.tasks = [old];
        board.data.extensions.timeline!.events.push({
            id: 'restore', at: '2026-10-03T12:00:00Z', kind: 'board.restored', entityId: 'board', entityType: 'board',
            summary: '', snapshot: baseline.snapshot, meta: { fromEventId: baseline.id }
        });
        expect(resolveTaskDetailSource(board, context)?.source.task.title).toBe('Opened task');
    });

    it('marks replaced history or a changed task identity unavailable', () => {
        const { board, context } = fixture();
        board.data.board.tasks[0].createdAt = '2026-10-09T00:00:00Z';
        expect(resolveTaskDetailSource(board, context)).toBeNull();
        board.data.board.tasks[0].createdAt = context.task!.createdAt;
        board.data.extensions.timeline!.events = [];
        expect(resolveTaskDetailSource(board, context)).toBeNull();
    });
});
