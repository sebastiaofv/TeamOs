import { describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { appendTimelineEvent, ensureBoardTimelineBaseline } from '@/domain/timeline';
import { createBoardStateSnapshot } from '@/domain/serialize';
import { closeSprint } from '@/domain/sprintResults';
import { sprintBurndown } from '@/domain/sprintBurndown';
import { diffProjectState } from '@/domain/projectPatch';
import { toProjectCheckpoint } from '@/domain/projectFormat';

function fixture() {
    const data = createEmptyProjectData('Burndown');
    data.meta.createdAt = data.meta.updatedAt = '2026-01-01T09:00:00Z';
    data.board.tasks = [3, 2, 5, 10].map((points, index) => normalizeTask({ id: index + 1, title: `Work ${index + 1}`, type: index === 0 ? 'story' : 'task', sprintId: 's1', storyPoints: points, status: 'to-do', createdAt: data.meta.createdAt }));
    data.board.tasks.push(normalizeTask({ id: 99, title: 'Child', type: 'task', parentId: 1, sprintId: 's1', storyPoints: 13, status: 'to-do', createdAt: data.meta.createdAt }));
    data.extensions.roadmap = { version: 5, phases: [], milestones: [], sprints: [{ id: 's1', title: 'Sprint', status: 'planned', startDate: '2026-01-05', endDate: '2026-01-14' }] };
    ensureBoardTimelineBaseline(data);
    const observe = (date: string) => appendTimelineEvent(data, { kind: 'roadmap.updated', entityType: 'board', entityId: 'board', summary: 'Observation', at: `${date}T12:00:00Z`, snapshot: createBoardStateSnapshot(data) });
    data.extensions.roadmap.sprints[0].status = 'active'; observe('2026-01-05');
    return { data, observe };
}

describe('Sprint burndown observations', () => {
    it('applies Testing/Done, additions and removals on the observed day and retains unfinished points at closure', () => {
        const { data, observe } = fixture();
        data.board.tasks[0].status = 'testing'; observe('2026-01-07');
        data.board.tasks.push(normalizeTask({ id: 5, title: 'Added', type: 'bug', sprintId: 's1', storyPoints: 5, status: 'doing' })); observe('2026-01-09');
        data.board.tasks[1].sprintId = ''; observe('2026-01-11');
        data.board.tasks[2].status = 'done'; observe('2026-01-12');
        closeSprint(data, 's1'); data.extensions.sprintResults!.closures[0].closedAt = '2026-01-14T12:00:00Z';
        data.extensions.roadmap!.sprints[0].status = 'done'; observe('2026-01-14');
        const result = sprintBurndown(data, 's1', '2026-11-13');
        expect(result.points.map(point => point.actual)).toEqual([20, 20, 17, 17, 22, 22, 20, 15, 15, 15]);
        expect(result.points[0].ideal).toBe(20);
        expect(result.points.at(-1)?.ideal).toBe(0);
        expect(result.added?.map(task => task.id)).toEqual([5]);
        expect(result.removed?.map(task => task.id)).toEqual([2]);
        const frozen = structuredClone(result);
        data.board.tasks = []; data.extensions.roadmap!.sprints[0].endDate = '2026-03-01'; observe('2026-02-01');
        expect(sprintBurndown(data, 's1', '2026-11-13')).toEqual(frozen);
    });
    it('stops Actual at today while keeping the full Ideal, and preserves same-day Sprints', () => {
        const { data } = fixture();
        const result = sprintBurndown(data, 's1', '2026-01-07');
        expect(result.points.map(point => point.actual)).toEqual([20, 20, 20, null, null, null, null, null, null, null]);
        expect(result.points.at(-1)?.ideal).toBe(0);
        data.extensions.roadmap!.sprints[0].endDate = '2026-01-05';
        expect(sprintBurndown(data, 's1', '2026-01-05').points).toEqual([{ date: '2026-01-05', ideal: 20, actual: 20 }]);
    });
    it('does not remove completed points twice and tracks work both added and removed during the Sprint', () => {
        const { data, observe } = fixture();
        data.board.tasks[0].status = 'testing'; observe('2026-01-06');
        data.board.tasks[0].sprintId = ''; observe('2026-01-07');
        data.board.tasks.push(normalizeTask({ id: 5, title: 'Temporary scope', type: 'bug', sprintId: 's1', storyPoints: 5, status: 'doing' })); observe('2026-01-08');
        data.board.tasks.at(-1)!.sprintId = ''; observe('2026-01-09');
        const result = sprintBurndown(data, 's1', '2026-01-09');
        expect(result.points.slice(0, 5).map(point => point.actual)).toEqual([20, 17, 17, 22, 17]);
        expect(result.added?.map(task => task.id)).toEqual([5]);
        expect(result.removed?.map(task => task.id)).toEqual([1, 5]);
        expect(result.contexts.get(5)?.board.tasks.find(task => task.id === 5)?.sprintId).toBe('s1');
    });
    it('reports missing initial history, missing dates and legacy closures as unavailable', () => {
        const { data } = fixture();
        data.extensions.timeline!.events = data.extensions.timeline!.events.slice(1);
        expect(sprintBurndown(data, 's1', '2026-01-10').points).toEqual([]);
        delete data.extensions.timeline;
        expect(sprintBurndown(data, 's1', '2026-01-10')).toEqual({ points: [], added: null, removed: null, contexts: new Map() });
        delete data.extensions.roadmap!.sprints[0].endDate;
        expect(sprintBurndown(data, 's1', '2026-01-10').points).toEqual([]);
    });
    it('replays native workitem and Sprint patches with the same historical result', () => {
        const { data, observe } = fixture();
        data.board.tasks[1].sprintId = ''; observe('2026-01-07');
        data.board.tasks[0].status = 'testing'; observe('2026-01-08');
        const expected = sprintBurndown(data, 's1', '2026-01-10');
        const events = data.extensions.timeline!.events;
        let previous = createBoardStateSnapshot(events[0].snapshot);
        for (const event of events.slice(1)) {
            const next = createBoardStateSnapshot(event.snapshot);
            event.patch = diffProjectState(toProjectCheckpoint(previous), toProjectCheckpoint(next));
            delete event.snapshot;
            previous = next;
        }
        expect(sprintBurndown(data, 's1', '2026-01-10')).toEqual(expected);
    });
});
