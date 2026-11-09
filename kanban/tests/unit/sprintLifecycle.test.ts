import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addBusinessDays, businessDaysBetween } from '@/domain/businessDays';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '@/domain/board';
import { defaultHierarchyAutomations } from '@/domain/hierarchyAutomations';
import { defaultWorkflow } from '@/domain/workflow';
import { normalizeTask } from '@/domain/task';
import type { Task, WorkitemType } from '@/domain/types';
import { createAppStore } from '@/features/portfolio/state/store';
import { createPortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';
import { closeSprint, developmentCompleted, parseSprintResults, recordSprintCredits, sprintPointSummary } from '@/domain/sprintResults';
import { buildPortfolioRoadmapView } from '@/features/portfolio/queries/portfolioRoadmapViews';
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
    data.extensions.workflow!.transitions.doing.push('backlog');
    data.board.tasks = [item(1, 'story', { storyPoints: 8, acceptanceCriteria: 'Accepted', status: 'ready-to-test' }), item(2, 'task', { parentId: 1, status: 'done' }), item(3, 'task', { parentId: 1 }), item(4, 'task', { storyPoints: 3 }), item(5, 'bug', { storyPoints: 5 }), item(6, 'story', { storyPoints: 2, acceptanceCriteria: 'Accepted' })];
    const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Sprint lifecycle', handle: {}, data })], selectedPortfolioBoardId: 'p' });
    const choose = vi.fn(async (): Promise<string | null> => choice); const alert = vi.fn(); const save = vi.fn(async () => true); const confirm = vi.fn(async (_text: string, _options?: import('@/app/overlays/appMessages').ConfirmOptions) => true);
    const prompt = vi.fn(async (): Promise<string | null> => 'Ana');
    const actions = createPortfolioMutationActions({ store, choose: async (_text, choices) => { const answer = await choose(); return choices.find((option) => option.value === answer)?.value ?? null; }, alert, confirm, prompt, enqueueSave: save, markDirty: vi.fn(), closeDialogFn: vi.fn(), openDialogFn: vi.fn() });
    return { store, actions, choose, alert, save, confirm, prompt, data: () => store.getState().portfolioBoards[0].data };
}

describe('Sprint durations in business days (US-22)', () => {
    it('adds business days to the start date, skipping weekends', () => {
        expect(addBusinessDays('2026-11-04', 10)).toBe('2026-11-18');
        expect(addBusinessDays('2026-11-04', 0)).toBe('2026-11-04');
        expect(addBusinessDays('2026-11-06', 1)).toBe('2026-11-09');
        expect(addBusinessDays('2026-11-07', 1)).toBe('2026-11-09');
        expect(addBusinessDays('2026-12-28', 5)).toBe('2027-01-04');
        expect(addBusinessDays('bad', 3)).toBe('');
        expect(addBusinessDays('2026-11-04', -1)).toBe('');
        expect(addBusinessDays('2026-11-04', 1.5)).toBe('');
    });
    it('counts the business days between two dates as the inverse of adding them', () => {
        expect(businessDaysBetween('2026-11-04', '2026-11-18')).toBe(10);
        expect(businessDaysBetween('2026-11-04', '2026-11-04')).toBe(0);
        expect(businessDaysBetween('2026-11-06', '2026-11-08')).toBe(0);
        expect(businessDaysBetween('2026-11-18', '2026-11-04')).toBeNull();
        expect(businessDaysBetween('', '2026-11-04')).toBeNull();
        for (const start of ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-07', '2026-11-08']) {
            for (let days = 0; days <= 40; days += 1) expect(businessDaysBetween(start, addBusinessDays(start, days))).toBe(days);
        }
    });
});

describe('Sprint end date when the start moves to today (US-22)', () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 4, 12)); });
    afterEach(() => { vi.useRealTimers(); });
    const plannedSprint = (setupResult: ReturnType<typeof setup>) => {
        Object.assign(setupResult.data().extensions.roadmap!.sprints[1], { startDate: '2026-11-02', endDate: '2026-11-16' });
        return setupResult;
    };

    it.each([
        ['recalculate', '2026-11-18'],
        ['keep', '2026-11-16']
    ])('starts with today and %s end date', async (answer, endDate) => {
        const { actions, data, choose } = plannedSprint(setup());
        choose.mockResolvedValueOnce('today').mockResolvedValueOnce(answer);
        await actions.changeSprintStatus('p', 's2', 'active');
        expect(choose).toHaveBeenCalledTimes(2);
        expect(data().extensions.roadmap!.sprints[1]).toMatchObject({ status: 'active', startDate: '2026-11-04', endDate });
    });

    it('asks for another end date until it is valid, through the editor as well', async () => {
        const { actions, data, choose, alert, prompt } = plannedSprint(setup());
        choose.mockResolvedValueOnce('today').mockResolvedValueOnce('custom');
        prompt.mockResolvedValueOnce('2026-11-03').mockResolvedValueOnce('2026-11-20');
        actions.openRoadmapEntityModal('sprints', 's2');
        await actions.saveRoadmapEntity({ kind: 'sprints', itemId: 's2', title: 'Next', status: 'active', startDate: '2026-11-02', endDate: '2026-11-16' });
        expect(prompt).toHaveBeenCalledTimes(2);
        expect(alert).toHaveBeenCalledTimes(1);
        expect(data().extensions.roadmap!.sprints[1]).toMatchObject({ status: 'active', startDate: '2026-11-04', endDate: '2026-11-20' });
    });

    it.each(['end choice', 'end prompt'])('cancelling the %s leaves the Sprint untouched', async (step) => {
        const { actions, data, choose, prompt, save } = plannedSprint(setup());
        choose.mockResolvedValueOnce('today').mockResolvedValueOnce(step === 'end choice' ? null : 'custom');
        prompt.mockResolvedValueOnce(null);
        await actions.changeSprintStatus('p', 's2', 'active');
        expect(save).not.toHaveBeenCalled();
        expect(data().extensions.roadmap!.sprints[1]).toMatchObject({ status: 'planned', startDate: '2026-11-02', endDate: '2026-11-16' });
    });

    it('does not ask about the end date when the start is kept or already today', async () => {
        const { actions, data, choose } = plannedSprint(setup('keep'));
        await actions.changeSprintStatus('p', 's2', 'active');
        expect(choose).toHaveBeenCalledTimes(1);
        expect(data().extensions.roadmap!.sprints[1]).toMatchObject({ startDate: '2026-11-02', endDate: '2026-11-16' });
    });
});

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
        // Using today as the start also asks which end date to keep; the mock answers 'today' again, which cancels.
        expect(choose).toHaveBeenCalledTimes(choice === 'today' ? 2 : 1);
        if (choice === null || choice === 'today') {
            // Updating only the start would put it after the planned end; the invalid range cannot be saved.
            expect(save).not.toHaveBeenCalled();
            expect(data().extensions.roadmap!.sprints[1].status).toBe('planned');
        } else {
            expect(data().extensions.roadmap!.sprints[1]).toMatchObject({ status: 'active', startDate: '2000-01-01', endDate: '2000-01-14' });
            expect(eligibleSprint(data(), 's2')).toBe(true);
        }
    });

    it('updates the start to today and keeps the edited end date when selected in the separate closure date prompt', async () => {
        const { actions, data, choose } = setup('today');
        const today = new Date();
        const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        Object.assign(data().extensions.roadmap!.sprints[1], { startDate: '2000-01-01', endDate: '2099-12-31' });
        choose.mockResolvedValueOnce('today').mockResolvedValueOnce('keep');
        await actions.changeSprintStatus('p', 's2', 'active');
        expect(data().extensions.roadmap!.sprints[1].startDate).toBe(date);
        choose.mockResolvedValueOnce('keep');
        actions.openRoadmapEntityModal('sprints', 's2');
        await actions.saveRoadmapEntity({ kind: 'sprints', itemId: 's2', title: 'Next', status: 'done', startDate: date, endDate: '2099-12-31' });
        expect(data().extensions.roadmap!.sprints[1].endDate).toBe('2099-12-31');
        expect(data().extensions.sprintResults!.closures[0].sprintId).toBe('s2');
    });

    it('awards Story points on all Tasks Done without accepting the Story, plus standalone Task, Bug and childless Story points exactly once', async () => {
        const { actions, data, store } = setup();
        await actions.movePortfolioTaskToStatus('p', 3, 'done');
        await actions.movePortfolioTaskToStatus('p', 4, 'done');
        await actions.movePortfolioTaskToStatus('p', 5, 'done');
        await actions.movePortfolioTaskToStatus('p', 6, 'done');
        expect(data().board.tasks[0].status).toBe('ready-to-test');
        expect(data().board.tasks[0].acceptance).toBeUndefined();
        expect(data().extensions.sprintResults!.credits.map((credit) => [credit.taskId, credit.storyPoints])).toEqual([[1, 8], [4, 3], [5, 5], [6, 2]]);
        await actions.changeSprintStatus('p', 's1', 'done');
        const closure = data().extensions.sprintResults!.closures[0];
        expect(closure).toMatchObject({ sprint: { status: 'done', capacity: 21, goal: 'Deliver' }, plannedPoints: 18, velocity: 18, completedIds: [1, 4, 5, 6], carryOverIds: [] });
        // All its Tasks are Done: the Story keeps awaiting validation and does not return to Unplanned.
        expect(data().board.tasks[0]).toMatchObject({ status: 'ready-to-test', sprintId: 's1' });
        expect(unplannedTableRows(buildPortfolioRowsFromBoardData(store.getState(), store.getState().portfolioBoards[0], data(), { canMutate: true })).map((row) => row.taskId)).not.toContain(1);
        expect(data().board.tasks[1]).toMatchObject({ status: 'done', sprintId: 's1' });
        data().extensions.workflow = defaultWorkflow();
        data().extensions.workflow!.transitions.done.push('doing');
        await actions.movePortfolioTaskToStatus('p', 3, 'doing');
        await actions.setPortfolioTaskProperties('p', 1, { sprintId: 's2' });
        expect(data().board.tasks[2].sprintId).toBe('s2');
        await actions.movePortfolioTaskToStatus('p', 1, 'done');
        expect(data().extensions.sprintResults!.credits).toHaveLength(4);
        expect(data().extensions.sprintResults!.closures[0]).toEqual(closure);
    });

    it.each(['button', 'editor'])('freezes all workitems and their states via %s, reviews unfinished Task resets and preserves original child states in FREEZE', async (source) => {
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
        expect(data().board.tasks.map((task) => task.status)).toEqual(['backlog', 'done', 'backlog', 'backlog', 'backlog', 'backlog']);
        expect(data().board.tasks.map((task) => task.sprintId)).toEqual(['', 's1', '', '', '', '']);
        const rows = buildPortfolioRowsFromBoardData(store.getState(), store.getState().portfolioBoards[0], data());
        expect(unplannedTableRows(rows).map((row) => row.taskId)).toEqual([1, 4, 5, 6]);
        expect(buildSprintTableGroups(currentSprintRosters(data(), rows), '2099-01-01').find((group) => group.sprint.id === 's1')).toMatchObject({ source: 'closure', status: 'done', total: 4, completed: 0 });
        await actions.setPortfolioTaskProperties('p', 1, { sprintId: 's2', storyPoints: 13 });
        expect(data().board.tasks[2].sprintId).toBe('s2');
        expect(data().board.tasks[1].status).toBe('done');
        expect(data().extensions.sprintResults!.closures[0]).toEqual(closure);
        expect(consultSprintParticipation(data(), 's1').members).toEqual(closure.tasks);
        expect(taskInTechnicalBoard(data(), data().board.tasks[2])).toBe(true); // #54's all-Sprints Board can display it; the active-only filter is separate.
        const restored = serializeBoardDataFromObject(JSON.parse(JSON.stringify(data())));
        validateBoardData(restored);
        expect(restored.extensions.sprintResults!.closures[0]).toEqual(closure);
        const replay = reconstructBoardStateFromTimeline(data(), data().extensions.timeline!.events.length - 1);
        expect(replay.extensions.sprintResults).toEqual(data().extensions.sprintResults);
        expect(replay.board.tasks.map((task) => [task.id, task.status, task.sprintId])).toEqual(data().board.tasks.map((task) => [task.id, task.status, task.sprintId]));
        expect(reconstructBoardStateFromTimeline(data(), 0).extensions.sprintResults).toBeUndefined();
    });

    it.each(['button', 'editor'])('separates automation approval from Backlog information via %s and excludes implemented Stories', async (source) => {
        const { actions, data, confirm } = setup();
        data().board.tasks[2].status = 'done';
        if (source === 'button') await actions.changeSprintStatus('p', 's1', 'done');
        else {
            actions.openRoadmapEntityModal('sprints', 's1');
            await actions.saveRoadmapEntity({ kind: 'sprints', itemId: 's1', title: 'Delivery', startDate: '2026-01-01', endDate: '2099-12-31', status: 'done' });
        }
        expect(confirm).toHaveBeenCalledTimes(2);
        const options = confirm.mock.calls[1][1];
        expect(options).toMatchObject({ title: 'Finish Sprint', informational: true });
        expect(confirm.mock.calls[0][1]?.workitems?.rules).toMatchObject([{ name: 'Return unfinished Tasks to Backlog' }]);
        expect(options!.workitems!.rows.map((row: { id: string }) => row.id)).toEqual(['#4', '#5', '#6']);
        expect(data().board.tasks[0]).toMatchObject({ status: 'ready-to-test', sprintId: 's1' });
    });

    it.each(['button', 'editor'])('cancels closure atomically via %s when the date choice is cancelled', async (source) => {
        const { actions, data, choose, save } = setup();
        const before = structuredClone(data());
        choose.mockResolvedValueOnce(null);
        if (source === 'button') await actions.changeSprintStatus('p', 's1', 'done');
        else {
            actions.openRoadmapEntityModal('sprints', 's1');
            await actions.saveRoadmapEntity({ kind: 'sprints', itemId: 's1', title: 'Delivery', startDate: '2026-01-01', endDate: '2099-12-31', status: 'done' });
        }
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

describe('Unplanned Stories follow pending Tasks, not their own status (US-22)', () => {
    const unplannedIds = (store: ReturnType<typeof setup>['store']) => unplannedTableRows(buildPortfolioRowsFromBoardData(store.getState(), store.getState().portfolioBoards[0], store.getState().portfolioBoards[0].data, { canMutate: true })).map((row) => row.taskId);
    function unplannedStory() {
        const result = setup();
        // Story 1 leaves the Sprint; its Task 3 is still in progress.
        result.data().board.tasks.forEach((task) => { task.sprintId = ''; });
        return result;
    }

    it('lists a Story outside Sprints only while one of its Tasks has work left, without changing its status', async () => {
        const { actions, data, store } = unplannedStory();
        expect(unplannedIds(store)).toContain(1);
        await actions.movePortfolioTaskToStatus('p', 3, 'done');
        expect(unplannedIds(store)).not.toContain(1);
        expect(data().board.tasks[0].status).toBe('ready-to-test');
        // Reopening a Task brings the Story back.
        data().board.tasks[2].status = 'doing';
        expect(unplannedIds(store)).toContain(1);
        data().board.tasks[2].status = 'cancelled';
        expect(unplannedIds(store)).not.toContain(1);
        // A new Task with work to do brings it back too; Done, Cancelled and Duplication do not.
        for (const [status, listed] of [['done', false], ['duplication', false], ['to-do', true]] as const) {
            data().board.tasks.push(item(20, 'task', { parentId: 1, status, sprintId: '' }));
            expect(unplannedIds(store).includes(1)).toBe(listed);
            data().board.tasks.pop();
        }
        expect(data().board.tasks[0].status).toBe('ready-to-test');
    });

    it('keeps a Story with pending Tasks out of Unplanned while it belongs to an eligible Sprint', () => {
        const { store } = setup();
        expect(unplannedIds(store)).not.toContain(1);
    });

    it('lists a Story without Tasks and other planning units by their own status', () => {
        const { data, store } = unplannedStory();
        expect(unplannedIds(store)).toEqual(expect.arrayContaining([4, 5, 6]));
        data().board.tasks[5].status = 'done';
        expect(unplannedIds(store)).not.toContain(6);
    });
});

describe('Sprint feedback: counts, deletion, Story Point indicators and start (US-22)', () => {
    it('counts only workitems without children in each Roadmap Sprint', () => {
        const { store } = setup();
        const row = buildPortfolioRoadmapView(store.getState())!.sprintRows.find((entry) => entry.item!.id === 's1')!;
        // Story 1 has Tasks 2 and 3 in the Sprint, so it is not counted: 2, 3, 4, 5 and 6.
        expect(row.progress.associated).toBe(5);
        expect(row.visibleCount).toBe(5);
    });

    it('deletes only Planned Sprints, returning their workitems to planning with unchanged statuses', async () => {
        const { actions, data, alert, confirm } = setup();
        data().board.tasks.push(item(7, 'task', { sprintId: 's2', status: 'to-do', storyPoints: 1 }));
        await actions.deleteRoadmapEntity('sprints', 's1');
        expect(alert).toHaveBeenCalledTimes(1);
        expect(data().extensions.roadmap!.sprints.map((sprint) => sprint.id)).toEqual(['s1', 's2']);
        await actions.deleteRoadmapEntity('sprints', 's2');
        expect(confirm).toHaveBeenCalled();
        expect(data().extensions.roadmap!.sprints.map((sprint) => sprint.id)).toEqual(['s1']);
        expect(data().board.tasks.find((task) => task.id === 7)).toMatchObject({ sprintId: '', status: 'to-do' });
    });

    it('reports planned Story Points against capacity and, once Done, the frozen completed points', async () => {
        const { actions, data } = setup();
        expect(sprintPointSummary(data(), 's1')).toEqual({ planned: 18, capacity: 21, completed: null });
        expect(sprintPointSummary(data(), 's2')).toEqual({ planned: 0, capacity: null, completed: null });
        await actions.movePortfolioTaskToStatus('p', 4, 'done');
        await actions.changeSprintStatus('p', 's1', 'done');
        const frozen = sprintPointSummary(data(), 's1');
        expect(frozen).toEqual({ planned: 18, capacity: 21, completed: 3 });
        data().board.tasks.find((task) => task.id === 5)!.storyPoints = 13;
        expect(sprintPointSummary(data(), 's1')).toEqual(frozen);
    });

    it('moves Backlog workitems and their children to the first To do state when the Sprint starts', async () => {
        const { actions, data } = setup('keep');
        data().board.tasks.push(
            item(7, 'task', { sprintId: 's2', status: 'backlog' }),
            item(8, 'story', { sprintId: 's2', status: 'backlog' }),
            item(9, 'task', { parentId: 8, sprintId: 's2', status: 'backlog' }),
            item(10, 'bug', { sprintId: 's2', status: 'doing' }),
            item(11, 'bug', { sprintId: 's2', status: 'backlog' })
        );
        await actions.changeSprintStatus('p', 's2', 'active');
        const status = (id: number) => data().board.tasks.find((task) => task.id === id)!.status;
        expect([7, 8, 9, 10, 11].map(status)).toEqual(['to-do', 'to-do', 'to-do', 'doing', 'to-do']);
    });
});


describe('Sprint closure automation modes and stable associations (#72)', () => {
    it.each(['off', 'confirm', 'automatic'] as const)('respects %s while freezing the original Tasks and only listing visible planning units', async (mode) => {
        const { actions, data, confirm } = setup();
        data().extensions.hierarchyAutomations = defaultHierarchyAutomations();
        data().extensions.hierarchyAutomations!.rules.sprintUnfinishedTasks = mode;
        await actions.changeSprintStatus('p', 's1', 'done');
        expect(data().board.tasks[2].status).toBe(mode === 'off' ? 'doing' : 'backlog');
        expect(data().board.tasks[3].status).toBe(mode === 'off' ? 'doing' : 'backlog');
        const info = confirm.mock.calls.find((call) => call[1]?.title === 'Finish Sprint');
        expect(info?.[1]?.informational).toBe(true);
        expect(info?.[1]?.workitems?.rows.map((row) => row.id)).toEqual(['#1', '#4', '#5', '#6']);
        expect(data().extensions.sprintResults!.closures[0].tasks[2].status).toBe('doing');
        const events = data().extensions.timeline!.events.filter((event) => event.meta?.automationRule === 'sprintUnfinishedTasks');
        expect(events.map((event) => event.meta?.automationOutcome)).toEqual(mode === 'off' ? [] : [mode === 'confirm' ? 'approved' : 'automatic', mode === 'confirm' ? 'approved' : 'automatic']);
    });
    it('keeps rejected Task statuses while closing and preserving frozen participation', async () => {
        const { actions, data, confirm } = setup();
        confirm.mockResolvedValueOnce(false);
        await actions.changeSprintStatus('p', 's1', 'done');
        expect(data().board.tasks[2]).toMatchObject({ status: 'doing', sprintId: '' });
        expect(data().extensions.roadmap!.sprints[0].status).toBe('done');
        expect(data().extensions.timeline!.events.filter((event) => event.meta?.automationOutcome === 'rejected')).toHaveLength(2);
    });
    it.each(['confirm', 'automatic'] as const)('reports forbidden Sprint Task resets in %s and never forces them', async (mode) => {
        const { actions, data, confirm } = setup();
        data().extensions.workflow!.transitions.doing = data().extensions.workflow!.transitions.doing.filter((id) => id !== 'backlog');
        data().extensions.hierarchyAutomations = defaultHierarchyAutomations();
        data().extensions.hierarchyAutomations!.rules.sprintUnfinishedTasks = mode;
        await actions.changeSprintStatus('p', 's1', 'done');
        const blocked = confirm.mock.calls.find((call) => call[1]?.title === 'Review workflow automations');
        expect(blocked?.[1]).toMatchObject({ informational: true });
        expect(blocked?.[1]?.workitems?.rows).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'Status', from: 'In progress', to: 'Backlog' })]));
        expect(blocked?.[1]?.selections).toBeUndefined();
        expect(data().board.tasks[2].status).toBe('doing');
    });
    it('keeps a completed Sprint association on Task and Story reopening, then joins a newly selected Sprint without changing FREEZE', async () => {
        const { actions, data } = setup();
        data().board.tasks[2].status = 'done';
        await actions.changeSprintStatus('p', 's1', 'done');
        const frozen = structuredClone(data().extensions.sprintResults!.closures[0]);
        data().extensions.workflow!.transitions.done.push('doing');
        data().extensions.hierarchyAutomations = defaultHierarchyAutomations();
        data().extensions.hierarchyAutomations!.rules.reopenParent = 'off';
        await actions.movePortfolioTaskToStatus('p', 3, 'doing');
        expect(data().board.tasks[0].sprintId).toBe('s1');
        expect(data().board.tasks[2].sprintId).toBe('s1');
        await actions.movePortfolioTaskToStatus('p', 1, 'doing');
        expect(data().board.tasks[0].sprintId).toBe('s1');
        await actions.setPortfolioTaskProperties('p', 1, { sprintId: 's2' });
        expect(data().board.tasks[2].sprintId).toBe('s2');
        expect(data().extensions.sprintResults!.closures[0]).toEqual(frozen);
    });
    it('validates an end date chosen as today without saving a Sprint whose start is in the future', async () => {
        const { actions, data, choose, save, alert } = setup('today');
        data().extensions.roadmap!.sprints[0].startDate = '2099-01-01';
        await actions.changeSprintStatus('p', 's1', 'done');
        expect(choose).toHaveBeenCalledTimes(1); expect(alert).toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    });
});


it('lists the resulting Backlog after reset decisions, including a cancelled standalone Task only when it is actually reopened', async () => {
    const { actions, data, confirm } = setup();
    data().board.tasks[3].status = 'cancelled';
    data().extensions.workflow!.transitions.cancelled.push('backlog');
    await actions.changeSprintStatus('p', 's1', 'done');
    const info = confirm.mock.calls.find((call) => call[1]?.title === 'Finish Sprint');
    expect(info?.[1]?.workitems?.rows.map((row) => row.id)).toContain('#4');
    expect(data().board.tasks[3].status).toBe('backlog');
});
