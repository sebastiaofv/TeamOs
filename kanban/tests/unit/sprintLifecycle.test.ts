import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import type { Task, WorkitemType } from '@/domain/types';
import { createAppStore } from '@/features/portfolio/state/store';
import { createPortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';
import { closeSprint, developmentCompleted, parseSprintResults, recordSprintCredits } from '@/domain/sprintResults';
import { consultSprintParticipation, eligibleSprint, syncWorkitemPlanning, taskInTechnicalBoard } from '@/domain/workitems';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from '@/domain/serialize';
import { reconstructBoardStateFromTimeline } from '@/domain/timeline';
import { buildSprintTableGroups, currentSprintRosters, unplannedTableRows } from '@/features/portfolio/table/tableViews';
import { buildPortfolioRowsFromBoardData } from '@/features/portfolio/queries';

const item = (id: number, type: WorkitemType, changes: Partial<Task> = {}) => normalizeTask({ id, type, title: `${type} ${id}`, status: 'doing', sprintId: 's1', ...changes });
function setup(choice: string | null = 'keep') {
    const data = createEmptyProjectData('Sprint lifecycle');
    data.extensions.roadmap = { version: 5, phases: [], milestones: [], sprints: [
        { id: 's1', title: 'Delivery', startDate: '2026-01-01', endDate: '2099-12-31', status: 'active', goal: 'Deliver', capacity: 21 },
        { id: 's2', title: 'Next', startDate: '2000-01-01', endDate: '2000-01-14', status: 'planned' }
    ] };
    data.board.tasks = [item(1, 'story', { storyPoints: 8, acceptanceCriteria: 'Accepted', status: 'ready-to-test' }), item(2, 'task', { parentId: 1, status: 'done' }), item(3, 'task', { parentId: 1 }), item(4, 'task', { storyPoints: 3 }), item(5, 'bug', { storyPoints: 5 }), item(6, 'story', { storyPoints: 2, acceptanceCriteria: 'Accepted' })];
    const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Sprint lifecycle', handle: {}, data })], selectedPortfolioBoardId: 'p' });
    const choose = vi.fn(async () => choice); const alert = vi.fn(); const save = vi.fn(async () => true); const confirm = vi.fn(async () => true);
    const actions = createPortfolioMutationActions({ store, choose: async (_text, choices) => { const answer = await choose(); return choices.find((option) => option.value === answer)?.value ?? null; }, alert, confirm, prompt: vi.fn(async () => 'Ana'), enqueueSave: save, markDirty: vi.fn(), closeDialogFn: vi.fn(), openDialogFn: vi.fn() });
    return { store, actions, choose, alert, save, confirm, data: () => store.getState().portfolioBoards[0].data };
}

describe('manual Sprint lifecycle and frozen results (US-22)', () => {
    it('imports and round-trips the US-22 manual acceptance board', () => {
        const input = JSON.parse(readFileSync('test-board/us-22.board.json', 'utf8'));
        validateBoardData(input);
        const saved = serializeBoardDataFromObject(input);
        validateBoardData(saved);
        expect(saved.extensions.roadmap!.sprints.map((sprint) => sprint.status)).toEqual(['planned', 'planned', 'planned']);
        expect(saved.board.tasks.filter((task) => task.storyPoints != null)).toHaveLength(6);
    });
    it('creates Planned Sprints through normal and selection creation regardless of dates, with independent metadata', async () => {
        const { actions, data, store } = setup();
        actions.openRoadmapEntityModal('sprints');
        await actions.saveRoadmapEntity({ kind: 'sprints', title: 'Old dates', status: 'done', startDate: '2000-01-01', endDate: '2000-01-14', goal: 'Goal', capacity: 34, review: 'Review', retrospective: 'Retro' });
        expect(data().extensions.roadmap!.sprints.at(-1)).toMatchObject({ status: 'planned', goal: 'Goal', capacity: 34, review: 'Review', retrospective: 'Retro' });
        store.setState({ portfolioBulkSelectionByBoardId: { p: [4] } });
        actions.openRoadmapEntityModal('sprints', '', { mode: 'create-sprint-from-selection' });
        await actions.saveRoadmapEntity({ kind: 'sprints', title: 'Selected', startDate: '2000-01-01', endDate: '2000-01-14', goal: 'Selected goal', capacity: 13 });
        expect(data().extensions.roadmap!.sprints.at(-1)).toMatchObject({ status: 'planned', goal: 'Selected goal', capacity: 13 });
        expect(eligibleSprint(data(), 'selected')).toBe(true);
    });

    it.each(['today', 'keep', null])('handles date choice %s before starting, and does not advance automatically', async (choice) => {
        const { actions, data, save, choose } = setup(choice);
        await actions.changeSprintStatus('p', 's2', 'active');
        expect(choose).toHaveBeenCalledTimes(1);
        if (choice === null || choice === 'today') {
            // Updating only the start would put it after the planned end; the invalid range cannot be saved.
            expect(save).not.toHaveBeenCalled();
            expect(data().extensions.roadmap!.sprints[1].status).toBe('planned');
        } else {
            expect(data().extensions.roadmap!.sprints[1]).toMatchObject({ status: 'active', startDate: '2000-01-01', endDate: '2000-01-14' });
            expect(eligibleSprint(data(), 's2')).toBe(true);
        }
    });

    it('updates the chosen start/end date to local today through both the button and editor', async () => {
        const { actions, data } = setup('today');
        const today = new Date();
        const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        Object.assign(data().extensions.roadmap!.sprints[1], { startDate: '2000-01-01', endDate: '2099-12-31' });
        await actions.changeSprintStatus('p', 's2', 'active');
        expect(data().extensions.roadmap!.sprints[1].startDate).toBe(date);
        actions.openRoadmapEntityModal('sprints', 's2');
        await actions.saveRoadmapEntity({ kind: 'sprints', itemId: 's2', title: 'Next', status: 'done', startDate: date, endDate: '2099-12-31' });
        expect(data().extensions.roadmap!.sprints[1].endDate).toBe(date);
        expect(data().extensions.sprintResults!.closures[0].sprintId).toBe('s2');
    });

    it('awards Story points on all Tasks Done without accepting the Story, plus standalone Task, Bug and childless Story points exactly once', async () => {
        const { actions, data } = setup();
        await actions.movePortfolioTaskToStatus('p', 3, 'done');
        await actions.movePortfolioTaskToStatus('p', 4, 'done');
        await actions.movePortfolioTaskToStatus('p', 5, 'done');
        await actions.movePortfolioTaskToStatus('p', 6, 'done');
        expect(data().board.tasks[0].status).toBe('ready-to-test');
        expect(data().board.tasks[0].acceptance).toBeUndefined();
        expect(data().extensions.sprintResults!.credits.map((credit) => [credit.taskId, credit.storyPoints])).toEqual([[1, 8], [4, 3], [5, 5], [6, 2]]);
        await actions.changeSprintStatus('p', 's1', 'done');
        const closure = data().extensions.sprintResults!.closures[0];
        expect(closure).toMatchObject({ sprint: { status: 'done', capacity: 21, goal: 'Deliver' }, plannedPoints: 18, velocity: 18, completedIds: [1, 4, 5, 6], carryOverIds: [1] });
        expect(data().board.tasks[0]).toMatchObject({ status: 'backlog', sprintId: '' });
        expect(data().board.tasks[1]).toMatchObject({ status: 'done', sprintId: 's1' });
        await actions.setPortfolioTaskProperties('p', 1, { sprintId: 's2' });
        await actions.movePortfolioTaskToStatus('p', 1, 'done');
        expect(data().extensions.sprintResults!.credits).toHaveLength(4);
        expect(data().extensions.sprintResults!.closures[0]).toEqual(closure);
    });

    it.each(['button', 'editor'])('freezes all workitems and their states via %s, resets only unfinished planning units, and preserves child Task states', async (source) => {
        const { actions, data, store } = setup();
        if (source === 'button') await actions.changeSprintStatus('p', 's1', 'done');
        else {
            actions.openRoadmapEntityModal('sprints', 's1');
            await actions.saveRoadmapEntity({ kind: 'sprints', itemId: 's1', title: 'Delivery', startDate: '2026-01-01', endDate: '2099-12-31', status: 'done', goal: 'Deliver', capacity: 21 });
        }
        const closure = structuredClone(data().extensions.sprintResults!.closures[0]);
        expect(closure.tasks[0]).toMatchObject({ status: 'ready-to-test', storyPoints: 8 });
        expect(closure.tasks[2]).toMatchObject({ status: 'doing', parentId: 1 });
        expect(closure.carryOverIds).toEqual([1, 4, 5, 6]);
        expect(data().board.tasks.map((task) => task.status)).toEqual(['backlog', 'done', 'doing', 'backlog', 'backlog', 'backlog']);
        expect(data().board.tasks.map((task) => task.sprintId)).toEqual(['', 's1', '', '', '', '']);
        const rows = buildPortfolioRowsFromBoardData(store.getState(), store.getState().portfolioBoards[0], data());
        expect(unplannedTableRows(rows).map((row) => row.taskId)).toEqual([1, 4, 5, 6]);
        expect(buildSprintTableGroups(currentSprintRosters(data(), rows), '2099-01-01').find((group) => group.sprint.id === 's1')).toMatchObject({ source: 'closure', status: 'done', total: 4, completed: 0 });
        await actions.setPortfolioTaskProperties('p', 1, { sprintId: 's2', storyPoints: 13 });
        expect(data().board.tasks[2].sprintId).toBe('s2');
        expect(data().board.tasks[1].status).toBe('done');
        expect(data().extensions.sprintResults!.closures[0]).toEqual(closure);
        expect(consultSprintParticipation(data(), 's1').members).toEqual(closure.tasks);
        expect(taskInTechnicalBoard(data(), data().board.tasks[2])).toBe(false);
        const restored = serializeBoardDataFromObject(JSON.parse(JSON.stringify(data())));
        validateBoardData(restored);
        expect(restored.extensions.sprintResults!.closures[0]).toEqual(closure);
        const replay = reconstructBoardStateFromTimeline(data(), data().extensions.timeline!.events.length - 1);
        expect(replay.extensions.sprintResults).toEqual(data().extensions.sprintResults);
        expect(replay.board.tasks.map((task) => [task.id, task.status, task.sprintId])).toEqual(data().board.tasks.map((task) => [task.id, task.status, task.sprintId]));
        expect(reconstructBoardStateFromTimeline(data(), 0).extensions.sprintResults).toBeUndefined();
    });

    it('cancels closure atomically when the carry-over review is declined', async () => {
        const { actions, data, confirm, save } = setup();
        const before = structuredClone(data());
        confirm.mockResolvedValueOnce(false);
        await actions.changeSprintStatus('p', 's1', 'done');
        expect(data()).toEqual(before);
        expect(save).not.toHaveBeenCalled();
    });

    it('rejects invalid capacity and Sprint metadata without changing the project', async () => {
        const { actions, data, save, alert } = setup();
        const before = structuredClone(data());
        actions.openRoadmapEntityModal('sprints');
        await actions.saveRoadmapEntity({ kind: 'sprints', title: 'Invalid capacity', startDate: '2026-01-01', endDate: '2026-01-14', capacity: -1 });
        expect(data()).toEqual(before); expect(save).not.toHaveBeenCalled(); expect(alert).toHaveBeenCalled();
        for (const changes of [{ status: 'unknown' }, { capacity: -1 }, { capacity: '21' }, { goal: 3 }, { review: false }, { retrospective: {} }]) {
            const input = structuredClone(before);
            Object.assign(input.extensions.roadmap!.sprints[0], changes);
            expect(() => validateBoardData(input)).toThrow(/roadmap/);
        }
    });

    it('allows completed Sprint notes to be edited without replacing frozen results', async () => {
        const { actions, data } = setup();
        await actions.changeSprintStatus('p', 's1', 'done');
        const closure = structuredClone(data().extensions.sprintResults!.closures[0]);
        actions.openRoadmapEntityModal('sprints', 's1');
        await actions.saveRoadmapEntity({ kind: 'sprints', itemId: 's1', title: 'Delivery', status: 'done', startDate: '2026-01-01', endDate: '2099-12-31', goal: 'Deliver', capacity: 21, review: 'Demo delivered', retrospective: 'Smaller batches' });
        expect(data().extensions.roadmap!.sprints[0]).toMatchObject({ review: 'Demo delivered', retrospective: 'Smaller batches' });
        expect(data().extensions.sprintResults!.closures[0]).toEqual(closure);
    });

    it('does not award points for cancelled children, completion before the Sprint, or repeated reopen/completion', async () => {
        const { data } = setup();
        data().board.tasks[2].status = 'cancelled';
        expect(developmentCompleted(data(), data().board.tasks[0])).toBe(false);
        const previous = structuredClone(data());
        data().board.tasks[2].status = 'done';
        recordSprintCredits(data(), previous);
        expect(data().extensions.sprintResults!.credits).toHaveLength(1);
        data().board.tasks[2].status = 'doing';
        const reopened = structuredClone(data()); data().board.tasks[2].status = 'done';
        recordSprintCredits(data(), reopened);
        expect(data().extensions.sprintResults!.credits).toHaveLength(1);
        data().board.tasks[3].status = 'done';
        const finishedBefore = structuredClone(data()); data().board.tasks[3].sprintId = 's2';
        recordSprintCredits(data(), finishedBefore);
        expect(data().extensions.sprintResults!.credits).toHaveLength(1);
    });

    it('preserves one-time credits after a legacy workitem receives its permanent identity on save/reopen', () => {
        const { data } = setup();
        const before = structuredClone(data());
        data().board.tasks[3].status = 'done';
        recordSprintCredits(data(), before);
        const reopened = serializeBoardDataFromObject(data());
        reopened.board.tasks[3].status = 'doing';
        const unfinished = structuredClone(reopened);
        reopened.board.tasks[3].status = 'done';
        recordSprintCredits(reopened, unfinished);
        expect(reopened.extensions.sprintResults!.credits).toHaveLength(1);
    });

    it('removes Task Story Points on Story attachment and never changes Effort', async () => {
        const { actions, data } = setup();
        data().board.tasks[3].effort = 'XL';
        await actions.setPortfolioTaskProperties('p', 4, { parentId: 1 });
        expect(data().board.tasks[3].storyPoints).toBeUndefined();
        expect(data().board.tasks[3].effort).toBe('XL');
        expect(serializeBoardDataFromObject(data()).board.tasks[3].storyPoints).toBeUndefined();
    });

    it('rejects stale date prompts, read-only starts, negative capacity and malformed Story Points atomically', async () => {
        const { actions, data, store, choose, save, alert } = setup();
        const previous = data();
        choose.mockImplementationOnce(async () => { store.setState({ portfolioBoards: [{ ...store.getState().portfolioBoards[0], data: structuredClone(previous) }] }); return 'keep'; });
        await actions.changeSprintStatus('p', 's2', 'active');
        expect(save).not.toHaveBeenCalled(); expect(alert).toHaveBeenCalled();
        store.setState({ portfolioBoards: [{ ...store.getState().portfolioBoards[0], handle: null }] });
        await actions.changeSprintStatus('p', 's2', 'active'); expect(save).not.toHaveBeenCalled();
        for (const invalid of [-1, Infinity, NaN]) { const input = structuredClone(previous); input.board.tasks[3].storyPoints = invalid; expect(() => validateBoardData(input)).toThrow(); }
        const input = structuredClone(previous); input.board.tasks[2].storyPoints = 8; expect(() => validateBoardData(input)).toThrow();
    });

    it('retains frozen workflow labels after workflow edits and does not freeze by calendar', () => {
        const { data } = setup();
        syncWorkitemPlanning(data(), structuredClone(data()));
        closeSprint(data(), 's1');
        const snapshot = consultSprintParticipation(data(), 's1');
        const original = snapshot.boardData.extensions.workflow!.states[0].name;
        data().extensions.workflow = structuredClone(snapshot.boardData.extensions.workflow!);
        data().extensions.workflow!.states[0].name = 'Renamed';
        expect(consultSprintParticipation(data(), 's1').boardData.extensions.workflow!.states[0].name).toBe(original);
        const normalized = createBoardStateSnapshot(data());
        expect(normalized.extensions.roadmap!.sprints[1].status).toBe('planned');
    });

    it.each([{ version: 2, credits: [], closures: [] }, { version: 1, credits: [{}], closures: [] }, { version: 1, credits: [], closures: [{}] }])('rejects malformed Sprint result data on import and serialization: %j', (sprintResults) => {
        const input = { ...setup().data(), extensions: { sprintResults } };
        expect(() => validateBoardData(input)).toThrow(/sprintResults/);
        expect(() => serializeBoardDataFromObject(input)).toThrow(/sprintResults/);
        expect(() => parseSprintResults(sprintResults)).toThrow(/sprintResults/);
    });
});
