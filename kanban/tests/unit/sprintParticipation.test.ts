import { fromPartial } from '@total-typescript/shoehorn';
import { describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { consultSprintParticipation } from '@/domain/workitems';
import { currentSprintRosters } from '@/features/portfolio/table/tableViews';
import { buildPortfolioRoadmapView } from '@/features/portfolio/queries/portfolioRoadmapViews';
import { buildPortfolioTasks } from '@/features/portfolio/queries/portfolioRowViews';
import { createAppStore } from '@/features/portfolio/state/store';

function project() {
    const data = createEmptyProjectData('Participation');
    data.extensions.roadmap = { version: 1, phases: [], milestones: [], sprints: [
        { id: 'old', title: 'Previous', startDate: '2020-01-01', endDate: '2020-01-31' },
        { id: 'current', title: 'Current', startDate: '2020-02-01', endDate: '2099-12-31' }
    ] };
    const story = normalizeTask({ id: 1, title: 'Recorded story', type: 'story', status: 'doing', sprintId: 'old' });
    const child = normalizeTask({ id: 2, title: 'Recorded child', type: 'task', parentId: 1, status: 'done', sprintId: 'old' });
    data.extensions.sprintParticipation = { version: 1, entries: [story, child].map((task) => ({ sprintId: 'old', task, at: '2020-01-30T12:00:00Z' })) };
    data.board.tasks = [{ ...story, title: 'Live story', sprintId: 'current', status: 'to-do' }, { ...child, title: 'Live child', parentId: null, sprintId: 'current', status: 'doing' }];
    return data;
}

describe('Sprint participation consultation', () => {
    it.each([false, true])('Table, Roadmap and tree context agree after a parent changes or disappears (deleted=%s)', (deleted) => {
        const data = project();
        if (deleted) data.board.tasks = [];
        const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Participation', fileName: 'p.json', handle: {}, data })], selectedPortfolioBoardId: 'p' });
        const state = store.getState();
        const before = structuredClone(data);
        const participation = consultSprintParticipation(data, 'old');
        const table = currentSprintRosters(data, buildPortfolioTasks(state)).find((group) => group.sprint.id === 'old')!;
        const roadmap = buildPortfolioRoadmapView(state)!.sprintRows.find((row) => row.item!.id === 'old')!;
        expect(participation.members.map((task) => [task.title, task.parentId, task.status])).toEqual([
            ['Recorded story', undefined, 'doing'], ['Recorded child', 1, 'done']
        ]);
        expect(participation.planningMembers.map((task) => task.id)).toEqual([1]);
        expect(table.rows.map((row) => row.task)).toEqual(participation.planningMembers);
        expect(roadmap.rows.map((row) => row.task)).toEqual(participation.members);
        expect(roadmap.boardData.board.tasks).toEqual(participation.members);
        expect(roadmap.progress).toMatchObject({ eligible: 1, completed: 0 });
        expect([...table.rows, ...roadmap.rows].every((row) => row.historical && !row.canMutate)).toBe(true);
        expect(participation.members.every((task) => !participation.isCurrent(task.id))).toBe(true);
        expect(data).toEqual(before);
    });

    it('allows only still allocated work to be current, even while a Sprint is eligible', () => {
        const data = project();
        const task = normalizeTask({ id: 3, title: 'Deleted later', status: 'done', sprintId: 'current' });
        data.extensions.sprintParticipation!.entries.push({ sprintId: 'current', task, at: '2020-02-01T12:00:00Z' });
        const participation = consultSprintParticipation(data, 'current');
        expect(participation.isCurrent(1)).toBe(true);
        expect(participation.isCurrent(3)).toBe(false);
        participation.members[0].title = 'Changed consultation';
        expect(data.board.tasks[0].title).toBe('Live story');
    });

    it('retains legacy recorded status/parent without inventing an old workflow', () => {
        const data = project(); delete data.extensions.sprintParticipation;
        data.board.tasks[0].sprintHistory = [{ sprintId: 'old', status: 'doing', parentId: null, at: '2020-01-30T12:00:00Z' }];
        const participation = consultSprintParticipation(data, 'old');
        expect(participation.members[0]).toMatchObject({ title: 'Live story', status: 'doing', sprintId: 'old', parentId: null });
        expect(participation.boardData.extensions.workflow).toEqual(data.extensions.workflow);
    });
});
