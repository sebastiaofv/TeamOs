import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { ensureBoardTimelineBaseline, getBoardTimelineData, reconstructBoardStateFromTimeline } from '@/domain/timeline';
import { dashboardHistory, dashboardHistorySummary, dashboardMetrics, dashboardTasks } from '@/domain/dashboard';
import { getWorkflow, withWorkflowReadCache } from '@/domain/workflow';
import { serializeBoardDataFromObject } from '@/domain/serialize';
import * as taskHistory from '@/domain/taskHistory';
import { buildTaskDetailViewModel } from '@/features/portfolio/commands/taskViewModels';
import { createBoardMutationContext } from '@/features/portfolio/commands/mutationContext';
import { createAppStore } from '@/features/portfolio/state/store';
import type { BoardData } from '@/domain/types';
import type { BoardRecord } from '@/features/portfolio/types';

function historyFixture(count = 80) {
    const data = createEmptyProjectData('Performance', 'PERF');
    data.board.tasks = [normalizeTask({ id: 1, title: 'Workitem', type: 'task', status: 'backlog', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })];
    const timeline = ensureBoardTimelineBaseline(data)!;
    timeline.events.push(...Array.from({ length: count }, (_, index) => ({
        id: `event-${index}`, at: '2026-11-09T10:00:00.000Z', kind: 'task.updated', entityType: 'task' as const, entityId: '1', summary: 'Priority changed',
        changes: { priority: { before: index % 2 ? 'high' : 'low', after: index % 2 ? 'low' : 'high' } }
    })));
    return serializeBoardDataFromObject(data);
}

afterEach(() => vi.restoreAllMocks());

describe('performance regressions', () => {
    it('builds dashboard observations without copying a whole board for every historical prefix', () => {
        const data = historyFixture();
        const stringify = vi.spyOn(JSON, 'stringify');
        const points = dashboardHistory(data, '', '', '');
        const wholeBoardCopies = stringify.mock.calls.filter(([value]) => value?.board?.tasks).length;
        expect(points).toHaveLength(81);
        expect(wholeBoardCopies).toBeLessThan(81 * 3);
        expect(points.at(-1)!.metrics.tasks[0].priority).toBe('low');
    });

    it('keeps every dashboard observation equivalent to standalone replay, including legacy workflows and identities', () => {
        const data: BoardData = JSON.parse(readFileSync('test-board/us-9.board.json', 'utf8'));
        data.extensions.conversations = { version: 1, entries: [] };
        const original = structuredClone(data);
        const points = dashboardHistory(data, 'api', '', '');
        for (const point of points) {
            const expected = reconstructBoardStateFromTimeline(data, point.index);
            expect(point.metrics).toEqual(dashboardMetrics(expected, dashboardTasks(expected, 'api'), point.at.slice(0, 10)));
            expect(point.data).toEqual(expected);
        }
        expect(data).toEqual(original);
    });

    it('keeps compact history counts equivalent across scopes, filters, restores and workflow changes', () => {
        const data: BoardData = JSON.parse(readFileSync('test-board/us-9.board.json', 'utf8'));
        for (const phase of ['', 'api', 'delivery', 'empty']) for (const [from, to] of [['', ''], ['2026-10-16', '2026-10-25']]) {
            expect(dashboardHistorySummary(data, phase, from, to)).toEqual(dashboardHistory(data, phase, from, to).map((point) => ({
                index: point.index, at: point.at, completed: point.metrics.completed.length, open: point.metrics.open.length, percent: point.metrics.progress.percent
            })));
        }
    });

    it('invalidates compact counts after events outside the selected date range, preserving canonical order', () => {
        const data = historyFixture(3);
        const events = data.extensions.timeline!.events;
        events[0].at = '2026-11-08T10:00:00.000Z';
        events[1].at = '2026-11-09T10:00:00.000Z';
        events[2].at = '2026-01-01T10:00:00.000Z';
        events[2].changes = { status: { before: 'backlog', after: 'done' } };
        const rows = dashboardHistorySummary(data, '', '2026-11-09', '2026-11-09');
        expect(rows.map((row) => row.completed)).toEqual([0, 1]);
        expect(rows.map((row) => row.index)).toEqual([1, 3]);
        expect(rows[1].percent).toBe(100);
    });

    it('opens workitem details without projecting history until it is requested, then reuses that projection', () => {
        const data = historyFixture();
        const project = fromPartial<BoardRecord>({ id: 'p', title: 'Performance', fileName: 'project.json', data });
        const projectHistory = vi.spyOn(taskHistory, 'projectTaskHistory');
        const vm = buildTaskDetailViewModel({ boardRecord: project, boardData: data, task: data.board.tasks[0], taskIndex: 0 }, 1, false);
        expect(vm.fields.title).toBe('Workitem');
        expect(projectHistory).not.toHaveBeenCalled();
        expect(vm.history?.entries).toHaveLength(80);
        expect(vm.history).toBe(vm.history);
        expect(projectHistory).toHaveBeenCalledTimes(1);
    });

    it('keeps imported historical events immutable across workitem mutations', async () => {
        const data = historyFixture(3);
        const before = structuredClone(data);
        for (const event of data.extensions.timeline!.events) {
            Object.freeze(event);
            if (event.meta) Object.freeze(event.meta);
            if (event.changes) Object.freeze(event.changes);
        }
        const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Performance', fileName: 'project.json', handle: {}, data })], selectedPortfolioBoardId: 'p' });
        const context = createBoardMutationContext({ store, enqueueSave: async () => true, markDirty: () => {}, confirm: async () => true });
        expect(await context.runPortfolioTaskMutation('p', 1, (task) => { task.priority = 'high'; return true; })).toBe(true);
        expect(data).toEqual(before);
        expect(store.getState().portfolioBoards[0].data.extensions.timeline!.events).toHaveLength(5);
    });

    it('does not reuse stale workflow validation after in-place settings edits or leak changes to returned workflows', () => {
        const data = historyFixture(0);
        const original = getWorkflow(data);
        const detached = getWorkflow(data);
        detached.states[0].name = 'Detached draft';
        expect(getWorkflow(data)).toEqual(original);
        data.extensions.workflow!.states[0].name = 'Renamed';
        expect(getWorkflow(data).states[0].name).toBe('Renamed');
        data.extensions.workflow!.states[0].color = 'invalid';
        expect(() => getWorkflow(data)).toThrow();
    });

    it('keeps strict import validation after a timeline has been read by projections', () => {
        const data = historyFixture(3);
        getBoardTimelineData(data);
        data.extensions.timeline!.events[2].at = 'invalid';
        expect(() => validateBoardData(data)).toThrow();
    });

    it('discards a read-only workflow cache after both successful and failed projections', () => {
        const data = historyFixture(0);
        withWorkflowReadCache(() => expect(getWorkflow(data).states[0].name).toBe('Backlog'));
        data.extensions.workflow!.states[0].name = 'New name';
        expect(() => withWorkflowReadCache(() => { getWorkflow(data); throw new Error('Cancelled report'); })).toThrow('Cancelled report');
        data.extensions.workflow!.states[0].color = 'invalid';
        expect(() => getWorkflow(data)).toThrow();
    });
});
