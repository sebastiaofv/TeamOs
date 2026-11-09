import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { referenceFor, permanentBlockedIds } from '@/domain/permanentRelations';
import { setTaskRelation } from '@/domain/taskRelations';
import { DEFAULT_PORTFOLIO_FILTERS } from '@/domain/portfolioFilters';
import { dashboardMetrics } from '@/domain/dashboard';
import { buildPortfolioTasks, buildPortfolioRowsFromBoardData } from '@/features/portfolio/queries/portfolioRowViews';
import { buildPortfolioRoadmapView } from '@/features/portfolio/queries/portfolioRoadmapViews';
import { filterTableRows, sortTableRows, buildTableCsv } from '@/features/portfolio/table/tableModel';
import { createAppStore } from '@/features/portfolio/state/store';
import { createPortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';
import type { showConfirm } from '@/app/overlays/appMessages';
import type { BoardRecord } from '@/features/portfolio/types';

function setup() {
    const data = createEmptyProjectData('Feedback', 'FDB');
    data.extensions.roadmap = { version: 5, phases: [{ id: 'phase', title: 'Phase', startDate: '2026-11-01', endDate: '2026-11-15' }], milestones: [], sprints: [{ id: 'sprint', title: 'Sprint', status: 'planned', startDate: '2026-11-01', endDate: '2026-11-30' }] };
    const board = fromPartial<BoardRecord>({ id: 'p', title: 'Feedback', fileName: 'project.json', handle: {}, data });
    return { data, board };
}

describe('November 9 review feedback', () => {
    it('keeps manual and dependency flags independent across filters, CSV, sorting, Roadmap and Dashboard', () => {
        const { data, board } = setup();
        data.board.tasks = [
            normalizeTask({ id: 1, title: 'Blocker' }),
            normalizeTask({ id: 2, title: 'Manual', blocked: true, blockerReason: 'External' }),
            normalizeTask({ id: 3, title: 'Dependency' }),
            normalizeTask({ id: 4, title: 'Both', blocked: true, blockerReason: 'External', phaseId: 'phase', phaseMode: 'explicit', sprintId: 'sprint' })
        ];
        setTaskRelation(data, 1, 3, 'blocks'); setTaskRelation(data, 1, 4, 'blocks');
        const state = { portfolioBoards: [board], selectedPortfolioBoardId: 'p' };
        const rows = buildPortfolioTasks(state);
        expect(rows.map(row => [row.manuallyBlocked, row.dependencyBlocked, row.task.blocked])).toEqual([[false, false, false], [true, false, true], [false, true, true], [true, true, true]]);
        const ids = (filters: Partial<typeof DEFAULT_PORTFOLIO_FILTERS>) => filterTableRows(rows, { ...DEFAULT_PORTFOLIO_FILTERS, ...filters }).map(row => row.taskId);
        expect(ids({ manuallyBlocked: 'blocked' })).toEqual([2, 4]);
        expect(ids({ dependencyBlocked: 'blocked' })).toEqual([3, 4]);
        expect(ids({ manuallyBlocked: 'blocked', dependencyBlocked: 'blocked' })).toEqual([4]);
        expect(ids({ blocked: 'blocked' })).toEqual([2, 3, 4]);
        expect(sortTableRows(rows, 'dependencyBlocked', 'desc', data).map(row => row.taskId)).toEqual([3, 4, 1, 2]);
        expect(buildTableCsv(rows, ['id', 'blocked', 'dependencyBlocked'], data)).toContain('4,true,true');
        expect(dashboardMetrics(data, data.board.tasks, '2026-11-09').blocked.map(task => task.id)).toEqual([2, 3, 4]);
        for (const row of [buildPortfolioRoadmapView(state)!.phaseRows[0].rows[0], buildPortfolioRoadmapView(state)!.sprintRows[0].rows[0]]) {
            expect(row).toMatchObject({ manuallyBlocked: true, dependencyBlocked: true });
        }
        data.board.tasks[3].blocked = false;
        expect(buildPortfolioTasks(state, rows)[3]).toMatchObject({ manuallyBlocked: false, dependencyBlocked: true, task: { blocked: true } });
        data.board.tasks[3].blocked = true;
        const frozen = structuredClone(data);
        data.board.tasks[0].status = 'done';
        const completedRows = buildPortfolioTasks(state, rows);
        expect(completedRows[3]).toMatchObject({ manuallyBlocked: true, dependencyBlocked: false, task: { blocked: true } });
        expect(completedRows[2]).toMatchObject({ manuallyBlocked: false, dependencyBlocked: false, task: { blocked: false } });
        expect(dashboardMetrics(data, data.board.tasks, '2026-11-09').blocked.map(task => task.id)).toEqual([2, 4]);
        expect(buildPortfolioRowsFromBoardData(state, board, frozen, { historical: true })[3]).toMatchObject({ manuallyBlocked: true, dependencyBlocked: true });
        expect(data.board.tasks[3].blocked).toBe(true);
        expect(data.extensions.taskRelations!.relations).toHaveLength(2);
    });

    it('recalculates dependencies across projects and includes them in Dashboard monitoring', () => {
        const { board, data } = setup();
        const other = { ...setup().board, id: 'other' };
        data.board.tasks = [normalizeTask({ id: 1, permanentId: 'target', title: 'Target', blocked: true, blockerReason: 'Manual' })];
        other.data.board.tasks = [normalizeTask({ id: 1, permanentId: 'source', title: 'External blocker' })];
        data.extensions.permanentRelations = { version: 1, relations: [{ kind: 'blocks', source: referenceFor(other, other.data.board.tasks[0]), target: referenceFor(board, data.board.tasks[0]) }] };
        const state = { portfolioBoards: [board, other] };
        expect(buildPortfolioTasks(state)[0]).toMatchObject({ manuallyBlocked: true, dependencyBlocked: true });
        expect(dashboardMetrics(data, data.board.tasks, '2026-11-09', permanentBlockedIds(data, state.portfolioBoards)).blocked).toHaveLength(1);
        other.data.board.tasks[0].status = 'done';
        expect(buildPortfolioTasks(state)[0]).toMatchObject({ manuallyBlocked: true, dependencyBlocked: false });
        expect(dashboardMetrics(data, data.board.tasks, '2026-11-09', permanentBlockedIds(data, state.portfolioBoards)).blocked).toHaveLength(1);
    });

    it('reviews only the selected Stories requiring phase extension in a bulk allocation', async () => {
        const { data, board } = setup();
        data.extensions.roadmap!.phases.push({ id: 'wide', title: 'Wide', startDate: '2026-11-01', endDate: '2026-12-31' });
        data.board.tasks = [
            normalizeTask({ id: 1, type: 'story', title: 'Selected one', phaseId: 'phase', phaseMode: 'explicit' }),
            normalizeTask({ id: 2, type: 'story', title: 'Selected two', phaseId: 'phase', phaseMode: 'explicit' }),
            normalizeTask({ id: 3, type: 'story', title: 'No conflict', phaseId: 'wide', phaseMode: 'explicit' }),
            normalizeTask({ id: 4, type: 'story', title: 'Unselected', phaseId: 'phase', phaseMode: 'explicit' }),
            normalizeTask({ id: 5, parentId: 1, title: 'Inherited child', phaseMode: 'inherit' })
        ];
        const store = createAppStore({ portfolioBoards: [board], selectedPortfolioBoardId: 'p' });
        const confirm = vi.fn<typeof showConfirm>(async () => ({ phase: 'update' }));
        const actions = createPortfolioMutationActions({ store, confirm, alert: vi.fn(), prompt: async () => 'Ana', enqueueSave: async () => true, markDirty: vi.fn(), openDialogFn: vi.fn(), closeDialogFn: vi.fn() });
        actions.openRoadmapEntityModal('sprints', '', { boardId: 'p', mode: 'assign-sprint-from-selection', unplannedTaskIds: [1, 2, 3] });
        await actions.saveRoadmapEntity({ kind: 'sprints', existingSprintId: 'sprint' });
        const review = confirm.mock.calls.find(call => call[0]?.includes('falls outside'));
        expect(review?.[1]?.workitems?.rows.map(row => row.title)).toEqual(['Selected one', 'Selected two']);
        const saved = store.getState().portfolioBoards[0].data;
        expect(saved.board.tasks.filter(task => task.sprintId === 'sprint').map(task => task.id)).toEqual([1, 2, 3, 5]);
        expect(saved.extensions.roadmap!.phases[0].endDate).toBe('2026-11-30');
    });
});
