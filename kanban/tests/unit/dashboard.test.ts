import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { validateBoardData } from '../../src/domain/board';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { dashboardHistory, dashboardMetrics, dashboardPlanning, dashboardSprintScopeChanges, dashboardSprints, dashboardTasks } from '../../src/domain/dashboard';
import type { BoardData } from '../../src/domain/types';
import { createAppStore } from '../../src/features/portfolio/state/store';

const fixture = (): BoardData => JSON.parse(readFileSync('test-board/us-9.board.json', 'utf8'));
const ids = (tasks: { id: number }[]) => tasks.map((task) => task.id);

describe('project dashboard', () => {
    it('validates and round-trips the manual board, preserving identities and historical observations', () => {
        const data = fixture();
        validateBoardData(data);
        const saved = serializeBoardDataFromObject(data);
        validateBoardData(saved);
        expect(ids(saved.board.tasks)).toEqual(ids(data.board.tasks));
        expect(saved.extensions.timeline?.events.map((event) => event.id)).toEqual(data.extensions.timeline?.events.map((event) => event.id));
        expect(dashboardHistory(saved, '', '', '').map((point) => point.metrics.progress)).toEqual(dashboardHistory(data, '', '', '').map((point) => point.metrics.progress));
    });
    it('counts eligible leaves using semantic categories, including archived items without double-counting parents', () => {
        const data = fixture();
        const metrics = dashboardMetrics(data, data.board.tasks, '2026-10-31');
        expect(metrics.progress).toMatchObject({ associated: 9, eligible: 6, completed: 2, cancelled: 1 });
        expect(metrics.progress.percent).toBeCloseTo(100 / 3);
        expect(ids(metrics.eligible)).toEqual([903, 904, 905, 906, 908, 909]);
        expect(ids(metrics.open)).toEqual([904, 905, 906, 909]);
        expect(ids(metrics.blocked)).toEqual([905, 906]);
        expect(ids(metrics.overdue!)).toEqual([904, 906]); // today itself is not overdue
        expect(ids(metrics.unassigned)).toEqual([904, 906, 909]);
        expect(ids(metrics.undated)).toEqual([908, 909]);
    });
    it('keeps inherited phase/milestone associations and both overlapping phases', () => {
        const data = fixture();
        expect(ids(dashboardTasks(data, 'api'))).toEqual([901, 902, 903, 904]);
        expect(dashboardPlanning(data, '', '2026-10-31').filter((row) => row.current).map((row) => row.item.id)).toEqual(['delivery', 'api', 'ux']);
        expect(dashboardPlanning(data, '', '2026-10-31').filter((row) => row.executing).map((row) => row.item.id)).toEqual(['delivery', 'api', 'ux']);
        const release = dashboardPlanning(data, 'delivery', '2026-10-31').find((row) => row.item.id === 'release')!;
        expect(ids(release.tasks)).toEqual([902, 903, 904, 905, 906, 908]);
        expect(release.progress).toMatchObject({ eligible: 5, completed: 2, percent: 40 });
    });
    it('uses N/A for empty/cancelled-only denominators and missing deadlines', () => {
        const data = fixture();
        for (const phase of ['empty', 'cancelled-only']) {
            const metrics = dashboardMetrics(data, dashboardTasks(data, phase), '2026-10-31');
            expect(metrics.progress.percent).toBeNull();
            expect(metrics.overdue).toBeNull();
            expect(dashboardPlanning(data, phase, '2026-10-31')[0].overdue).toBeNull();
        }
        const noDeadlines = data.board.tasks.map((task) => ({ ...task, dueDate: '' }));
        expect(dashboardMetrics(data, noDeadlines, '2026-10-31').overdue).toBeNull();
    });
    it('does not manufacture observations between recorded events and replays historical workitems', () => {
        const data = fixture();
        expect(dashboardHistory(data, '', '2026-10-16', '2026-10-19')).toEqual([]);
        const points = dashboardHistory(data, 'api', '2026-10-15', '2026-10-20');
        expect(points.map((point) => point.at)).toEqual(['2026-10-15T09:00:00.000Z', '2026-10-20T10:00:00.000Z']);
        expect(points.map((point) => point.metrics.completed.length)).toEqual([0, 1]);
        data.board.tasks.find((task) => task.id === 903)!.status = 'backlog';
        expect(dashboardHistory(data, 'api', '', '')[1].metrics.completed.length).toBe(1);
    });
    it('does not substitute current data for a missing historical baseline', () => {
        const data = fixture();
        delete data.extensions.timeline!.events[0].snapshot;
        expect(dashboardHistory(data, '', '', '')).toEqual([]);
    });
    it('keeps same-ID states in independent workflows separate and uses their own semantic category', () => {
        const data = fixture();
        data.extensions.functionalWorkflow = structuredClone(data.extensions.workflow!);
        data.extensions.functionalWorkflow.states.find((state) => state.id === 'accepted')!.category = 'in-progress';
        data.extensions.functionalWorkflow.states.find((state) => state.id === 'testing')!.category = 'completed';
        data.extensions.functionalWorkflow.references.completed = 'testing';
        data.board.tasks.find((task) => task.id === 902)!.status = 'accepted';
        const metrics = dashboardMetrics(data, data.board.tasks, '2026-10-31');
        expect(metrics.states.find((state) => state.id === 'functional:accepted')!.tasks.map((task) => task.id)).toEqual([902]);
        expect(metrics.states.find((state) => state.id === 'technical:accepted')!.tasks.map((task) => task.id)).toEqual([903, 908]);
        expect(metrics.progress.completed).toBe(2);
    });
    it('derives sprint scope changes from saved transitions without presenting them as closure carry-over', () => {
        const data = fixture();
        const changes = dashboardSprintScopeChanges(data, 'active');
        expect(changes).toHaveLength(1);
        expect(changes[0]).toMatchObject({ at: '2026-10-25T12:00:00.000Z', kind: 'removed' });
        expect(ids(changes[0].tasks)).toEqual([906]);
        expect(changes[0].tasks[0].sprintId).toBe('active');
        expect(dashboardSprintScopeChanges(data, 'active', 'api')).toEqual([]);
    });
    it('uses the shared sprint participation context and date-derived status without inventing SP', () => {
        vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
        try {
            const data = fixture();
            const sprints = dashboardSprints(data, '', '2026-10-31');
            expect(sprints.map((sprint) => sprint.status)).toEqual(['done', 'active', 'planned']);
            expect(ids(sprints[1].tasks)).toEqual([902, 903, 904, 905]);
            expect(sprints[1].metrics.progress).toMatchObject({ eligible: 3, completed: 1 });
            expect(sprints[1]).not.toHaveProperty('storyPoints');
        } finally { vi.useRealTimers(); }
    });
    it('requires one selected project and falls back to Board after selecting All', () => {
        const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'a', data: fixture() }), fromPartial({ id: 'b', data: fixture() })], selectedPortfolioBoardId: 'a' });
        store.setState({ selectedPortfolioViewMode: 'dashboard' });
        expect(store.getState().selectedPortfolioViewMode).toBe('dashboard');
        store.setState({ selectedPortfolioBoardId: '' });
        expect(store.getState().selectedPortfolioViewMode).toBe('board');
    });
});
