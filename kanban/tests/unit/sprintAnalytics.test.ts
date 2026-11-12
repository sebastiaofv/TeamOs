import { describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { appendTimelineEvent, ensureBoardTimelineBaseline } from '@/domain/timeline';
import { createBoardStateSnapshot } from '@/domain/serialize';
import { allSprintAnalytics } from '@/domain/sprintAnalytics';
import { closeSprint, parseSprintResults } from '@/domain/sprintResults';
import { fromProjectFile, toProjectFile, toProjectCheckpoint } from '@/domain/projectFormat';
import { applyProjectPatch, diffProjectState } from '@/domain/projectPatch';

function completedSprint() {
    const data = createEmptyProjectData('Analytics', 'ANA');
    const sprint = { id: 's1', title: 'Sprint 1', startDate: '2026-01-01', endDate: '2026-01-14', status: 'planned' as 'planned' | 'active' | 'done', capacity: 8 };
    data.extensions.roadmap = { version: 5, phases: [], milestones: [], sprints: [sprint] };
    data.board.tasks = [normalizeTask({ id: 1, type: 'story', title: 'Initially planned', status: 'doing', sprintId: 's1', storyPoints: 5 }),
        normalizeTask({ id: 2, type: 'task', parentId: 1, title: 'Child', status: 'doing', sprintId: 's1', storyPoints: 13 }),
        normalizeTask({ id: 3, type: 'bug', title: 'Testing', status: 'doing', sprintId: 's1', storyPoints: 8 })];
    ensureBoardTimelineBaseline(data);
    sprint.status = 'active';
    appendTimelineEvent(data, { kind: 'roadmap.updated', entityType: 'board', entityId: 'board', summary: 'Start', at: '2026-01-01T12:00:00Z', snapshot: createBoardStateSnapshot(data) });
    data.board.tasks[0].status = 'ready-to-test'; // Completed development through child completion is the existing rule.
    data.board.tasks[0].storyPoints = 13; // Initial estimates must remain frozen.
    data.board.tasks[1].status = 'done';
    data.board.tasks.push(normalizeTask({ id: 4, type: 'task', title: 'Added later', status: 'done', sprintId: 's1', storyPoints: 3 }));
    data.extensions.sprintResults = { version: 1, closures: [], credits: [{ taskKey: 'task:1', taskId: 1, sprintId: 's1', storyPoints: 5, at: '2026-01-10T12:00:00Z' }, { taskKey: 'task:4', taskId: 4, sprintId: 's1', storyPoints: 3, at: '2026-01-11T12:00:00Z' }] };
    const before = structuredClone(data);
    closeSprint(data, 's1');
    sprint.status = 'done';
    return { data, before };
}

describe('All Sprints historical metrics', () => {
    it('excludes later additions from predictability and dependent Tasks from points, using initial estimates', () => {
        const { data } = completedSprint();
        const result = allSprintAnalytics(data);
        expect(result.rows[0]).toMatchObject({ planned: 13, completed: 8, capacity: 8, carryover: 8, predictability: 5 / 13 * 100, utilization: 162.5 });
        expect(result.summary).toEqual({ velocity: 8, predictability: 5 / 13 * 100, utilization: 162.5, carryover: 8 });
        expect(data.extensions.sprintResults!.closures[0].initialPlan).toEqual({ plannedPoints: 13, completedPlannedPoints: 5 });
    });
    it('preserves results after later edits, deletion, serialization and project-history patches', () => {
        const { data, before } = completedSprint();
        const expected = allSprintAnalytics(data);
        data.board.tasks = [];
        data.extensions.roadmap!.sprints = [];
        data.extensions.timeline = undefined;
        expect(allSprintAnalytics(data)).toEqual(expected);
        expect(allSprintAnalytics(fromProjectFile(JSON.parse(JSON.stringify(toProjectFile(data)))))).toEqual(expected);
        expect(allSprintAnalytics(applyProjectPatch(before, diffProjectState(toProjectCheckpoint(before), toProjectCheckpoint(data))))).toEqual(expected);
        expect(parseSprintResults(data.extensions.sprintResults)).toEqual(data.extensions.sprintResults);
    });
    it('recovers legacy initial scope from recorded activation, without using the final scope as a baseline', () => {
        const { data } = completedSprint();
        delete data.extensions.sprintResults!.closures[0].initialPlan;
        expect(allSprintAnalytics(data).rows[0].planned).toBe(13);
        delete data.extensions.timeline;
        expect(allSprintAnalytics(data).rows[0]).toMatchObject({ planned: null, predictability: null, utilization: null, completed: 8, carryover: 8 });
    });
    it('shows unavailable initial planning for a baseline already active, and excludes active/planned Sprints', () => {
        const data = createEmptyProjectData('Missing history');
        data.extensions.roadmap = { version: 5, phases: [], milestones: [], sprints: [{ id: 'active', title: 'Active', status: 'active' }, { id: 'planned', title: 'Planned', status: 'planned' }] };
        ensureBoardTimelineBaseline(data);
        closeSprint(data, 'active');
        expect(allSprintAnalytics(data).rows).toHaveLength(1);
        expect(allSprintAnalytics(data).rows[0]).toMatchObject({ planned: null, completed: 0, capacity: null });
    });
    it('averages per-Sprint ratios, handles zero denominators and orders old to new', () => {
        const { data } = completedSprint();
        const closure = data.extensions.sprintResults!.closures[0];
        data.extensions.sprintResults!.closures.push({ ...structuredClone(closure), sprintId: 's2', sprint: { ...closure.sprint, id: 's2', title: 'Sprint 2', startDate: '2026-02-01', capacity: 0 }, initialPlan: { plannedPoints: 0, completedPlannedPoints: 0 }, velocity: 0, carryOverIds: [] });
        data.extensions.sprintResults!.closures.reverse();
        const result = allSprintAnalytics(data);
        expect(result.rows.map(row => row.id)).toEqual(['s1', 's2']);
        expect(result.summary).toMatchObject({ velocity: 4, carryover: 4, predictability: 5 / 13 * 100, utilization: 162.5 });
        expect(result.rows[1]).toMatchObject({ predictability: null, utilization: null });
    });
    it('keeps historical Done Sprints without records as gaps, and returns N/A for empty projects', () => {
        const data = createEmptyProjectData('Empty');
        expect(allSprintAnalytics(data).summary).toEqual({ velocity: null, predictability: null, utilization: null, carryover: null });
        data.extensions.roadmap = { version: 5, phases: [], milestones: [], sprints: [{ id: 'legacy', title: 'Legacy', status: 'done' }] };
        expect(allSprintAnalytics(data)).toMatchObject({ incomplete: true, rows: [{ id: 'legacy', completed: null, planned: null, carryover: null }] });
    });
    it('does not reinterpret an unknown initial commitment from a restart recorded after closure', () => {
        const { data } = completedSprint();
        const closure = data.extensions.sprintResults!.closures[0];
        delete closure.initialPlan;
        delete data.extensions.timeline;
        ensureBoardTimelineBaseline(data);
        data.extensions.roadmap!.sprints[0].status = 'active';
        appendTimelineEvent(data, { kind: 'roadmap.updated', entityType: 'board', entityId: 'board', summary: 'Later edit', at: '2099-01-01T12:00:00Z', snapshot: createBoardStateSnapshot(data) });
        expect(allSprintAnalytics(data).rows[0].planned).toBeNull();
    });
    it('does not count work removed before the Sprint start as initially planned', () => {
        const { data } = completedSprint();
        const baseline = data.extensions.timeline!.events[0].snapshot!;
        const start = data.extensions.timeline!.events[1].snapshot!;
        for (const snapshot of [baseline, start]) snapshot.extensions!.sprintParticipation = { version: 1, entries: [{ sprintId: 's1', task: normalizeTask({ id: 99, title: 'Removed before start', type: 'task', sprintId: 's1', storyPoints: 13 }), at: '2025-12-01T12:00:00Z' }] };
        delete data.extensions.sprintResults!.closures[0].initialPlan;
        expect(allSprintAnalytics(data).rows[0].planned).toBe(13);
    });
    it('captures the commitment when a new Sprint is created directly as active after the baseline', () => {
        const data = createEmptyProjectData('New Sprint');
        ensureBoardTimelineBaseline(data);
        data.extensions.roadmap = { version: 5, phases: [], milestones: [], sprints: [{ id: 's1', title: 'Direct start', status: 'active', startDate: '2026-01-01', endDate: '2026-01-14' }] };
        data.board.tasks = [normalizeTask({ id: 1, title: 'Planned', type: 'task', sprintId: 's1', status: 'doing', storyPoints: 3 })];
        appendTimelineEvent(data, { kind: 'roadmap.updated', entityType: 'board', entityId: 'board', summary: 'Create active', at: '2026-01-01T12:00:00Z', snapshot: createBoardStateSnapshot(data) });
        closeSprint(data, 's1');
        expect(allSprintAnalytics(data).rows[0].planned).toBe(3);
    });
    it.each([{ plannedPoints: -1, completedPlannedPoints: 0 }, { plannedPoints: 3, completedPlannedPoints: 4 }, { plannedPoints: 3, completedPlannedPoints: NaN }])('rejects invalid initial planning %j', initialPlan => {
        const { data } = completedSprint();
        data.extensions.sprintResults!.closures[0].initialPlan = initialPlan;
        expect(() => parseSprintResults(data.extensions.sprintResults)).toThrow('Invalid extensions.sprintResults');
    });
});
