import { describe, it, expect, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from '../../src/domain/serialize';
import { assertWorkitems, applyStoryAutomation, assertAcceptance, childrenOf, effectivePlanning, eligibleSprint, isPlanningUnit, syncWorkitemPlanning, taskInTechnicalBoard, workitemProgress, sprintMembers, assertWorkitemTransfer, transferredAcceptance } from '../../src/domain/workitems';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';
import { reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import type { Task, WorkitemType } from '../../src/domain/types';

const item = (id: number, type: WorkitemType, fields: Partial<Task> = {}) => normalizeTask({ id, title: `${type} ${id}`, type, status: 'to-do', ...fields });
function project() {
    const data = createEmptyProjectData('US-12');
    data.extensions.roadmap = { version: 4, phases: [{ id: 'phase', title: 'Phase', startDate: '2020-01-01', endDate: '2099-12-31' }], milestones: [{ id: 'milestone', title: 'Release', dueDate: '2099-12-31' }], sprints: [{ id: 'a', title: 'Previous', startDate: '2020-01-01', endDate: '2020-02-01' }, { id: 'b', title: 'Current', startDate: '2020-03-01', endDate: '2099-12-31' }] };
    data.board.tasks = [item(1, 'epic'), item(2, 'story', { parentId: 1, acceptanceCriteria: 'Business accepts', sprintId: 'b' }), item(3, 'task', { parentId: 2, sprintId: 'b' }), item(4, 'bug')];
    return data;
}
function setup() {
    const data = project();
    const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'US-12', handle: {}, data })], selectedPortfolioBoardId: 'p' });
    const confirm = vi.fn(async () => true); const alert = vi.fn(); const prompt = vi.fn(async (): Promise<string | null> => 'Ana'); const save = vi.fn(async () => true);
    const actions = createPortfolioMutationActions({ store, confirm, prompt, alert, enqueueSave: save, markDirty: vi.fn() });
    return { store, actions, confirm, prompt, alert, save, data: () => store.getState().portfolioBoards[0].data };
}

describe('US-12 workitem domain', () => {
    it('validates the supported tree and rejects type changes and missing/invalid parents', () => {
        const data = project(); expect(() => assertWorkitems(data)).not.toThrow();
        for (const parentId of [2, 3, 4, 99]) { const next = structuredClone(data); next.board.tasks[1].parentId = parentId; expect(() => assertWorkitems(next)).toThrow('parent'); }
        const next = structuredClone(data); next.board.tasks[2].type = 'bug'; expect(() => assertWorkitems(next, data)).toThrow();
    });
    it('permits a Task directly under an Epic and independent Stories and Tasks', () => {
        const data = project(); data.board.tasks[2].parentId = 1; expect(() => assertWorkitems(data)).not.toThrow();
        data.board.tasks[1].parentId = null; data.board.tasks[2].parentId = null; expect(() => assertWorkitems(data)).not.toThrow();
    });
    it('rejects parented Bugs and Epic execution fields', () => {
        const data = project(); data.board.tasks[3].parentId = 1; expect(() => assertWorkitems(data)).toThrow('parent');
        delete data.board.tasks[3].parentId; data.board.tasks[0].effort = 'M'; expect(() => assertWorkitems(data)).toThrow('epic');
    });
    it('keeps direct-child progress separate from nested execution and manual Effort', () => {
        const data = project(); data.board.tasks[2].status = 'done'; data.board.tasks[2].effort = 'XL';
        expect(workitemProgress(data, 2)).toMatchObject({ percent: 100, completed: 1 });
        expect(workitemProgress(data, 1)).toMatchObject({ percent: 0, completed: 0 });
        expect(data.board.tasks[1].effort).toBeNull();
    });
    it('excludes cancelled children and returns no percentage for empty/all-cancelled work', () => {
        const data = project(); expect(workitemProgress(data, 4).percent).toBeNull(); data.board.tasks[2].status = 'cancelled';
        expect(workitemProgress(data, 2)).toMatchObject({ percent: null, cancelled: 1 });
        data.board.tasks.push(item(5, 'task', { parentId: 2, status: 'done' })); expect(workitemProgress(data, 2).percent).toBe(100);
    });
    it('requires criteria and terminal Tasks before Story acceptance, including stories without Tasks', () => {
        const data = project(); expect(() => assertAcceptance(data, data.board.tasks[1])).toThrow('pending');
        data.board.tasks[2].status = 'cancelled'; expect(() => assertAcceptance(data, data.board.tasks[1])).not.toThrow();
        data.board.tasks[1].acceptanceCriteria = ''; expect(() => assertAcceptance(data, data.board.tasks[1])).toThrow('criteria');
    });
    it('resolves recursive inheritance, explicit override and None independently', () => {
        const data = project(); data.board.tasks[0].phaseId = 'phase'; data.board.tasks[0].milestoneId = 'milestone';
        data.board.tasks[1].phaseMode = 'inherit'; data.board.tasks[1].milestoneMode = 'none'; data.board.tasks[2].phaseMode = 'inherit'; data.board.tasks[2].milestoneMode = 'inherit';
        expect(effectivePlanning(data, data.board.tasks[2], 'phaseId')).toBe('phase'); expect(effectivePlanning(data, data.board.tasks[2], 'milestoneId')).toBe('');
        data.board.tasks[2].phaseMode = 'none'; expect(effectivePlanning(data, data.board.tasks[2], 'phaseId')).toBe('');
    });
    it('plans unfinished children and leaves completed work in its original Sprint', () => {
        const before = project(); before.board.tasks[1].sprintId = 'a'; before.board.tasks[2].sprintId = 'a'; before.board.tasks[2].status = 'done';
        before.board.tasks.push(item(5, 'task', { parentId: 2, sprintId: 'a' }));
        const next = structuredClone(before); next.board.tasks[1].sprintId = 'b'; syncWorkitemPlanning(next, before);
        expect(next.board.tasks.find((task) => task.id === 3)?.sprintId).toBe('a'); expect(next.board.tasks.find((task) => task.id === 5)?.sprintId).toBe('b');
        expect(sprintMembers(next, 'a').map((task) => task.id)).toContain(5); expect(taskInTechnicalBoard(next, next.board.tasks[2])).toBe(false);
    });
    it('reopening historical work joins the current Sprint without rewriting prior completion', () => {
        const before = project(); before.board.tasks[2].status = 'done'; before.board.tasks[2].sprintId = 'a';
        const next = structuredClone(before); next.board.tasks[2].status = 'doing'; syncWorkitemPlanning(next, before);
        expect(next.board.tasks[2].sprintId).toBe('b'); expect(sprintMembers(next, 'a').find((task) => task.id === 3)?.status).toBe('done');
        expect(taskInTechnicalBoard(next, next.board.tasks[2])).toBe(true);
    });
    it('has no inherited allocation when the Story has no eligible Sprint and retains eligible allocation on detachment', () => {
        const before = project(); const next = structuredClone(before); next.board.tasks[1].sprintId = ''; syncWorkitemPlanning(next, before); expect(next.board.tasks[2].sprintId).toBe('');
        const detached = structuredClone(before); detached.board.tasks[2].parentId = null; syncWorkitemPlanning(detached, before); expect(detached.board.tasks[2].sprintId).toBe('b');
    });
    it('keeps a recorded Sprint roster when work is detached or deleted later', () => {
        const before = project(); const recorded = structuredClone(before); syncWorkitemPlanning(recorded, before);
        const next = structuredClone(recorded); next.board.tasks = next.board.tasks.filter((task) => task.id !== 3); syncWorkitemPlanning(next, recorded);
        expect(sprintMembers(next, 'b').find((task) => task.id === 3)).toMatchObject({ id: 3, parentId: 2, title: 'task 3' });
    });
    it('uses only Stories, independent Tasks and Bugs as Sprint planning units', () => {
        const data = project(); expect(data.board.tasks.map((task) => isPlanningUnit(data, task))).toEqual([false, true, false, true]); expect(eligibleSprint(data, 'a')).toBe(false);
    });
    it('advances once at execution start and finish and never accepts the Story', () => {
        const before = project(); before.extensions.workitemAutomation = { version: 1, start: { from: ['to-do'], to: 'doing' }, finish: { from: ['doing'], to: 'ready-to-test' } };
        const running = structuredClone(before); running.board.tasks[2].status = 'doing'; expect(applyStoryAutomation(running, before)).toEqual([{ storyId: 2, taskId: 3, blocked: false }]);
        expect(running.board.tasks[1].status).toBe('doing');
        const done = structuredClone(running); done.board.tasks[2].status = 'done'; applyStoryAutomation(done, running); expect(done.board.tasks[1].status).toBe('ready-to-test'); expect(done.board.tasks[1].acceptance).toBeUndefined();
        expect(applyStoryAutomation(done, done)).toEqual([]);
    });
    it('does not advance on structural changes or all-cancelled children, or reopen a terminal Story', () => {
        const before = project(); before.extensions.workitemAutomation = { version: 1, finish: { from: ['to-do'], to: 'testing' } };
        const next = structuredClone(before); next.board.tasks[2].status = 'cancelled'; expect(applyStoryAutomation(next, before)).toEqual([]);
        next.board.tasks[2].status = 'done'; next.board.tasks[1].status = 'done'; expect(applyStoryAutomation(next, before)).toEqual([]);
        next.board.tasks[1].status = 'to-do'; next.board.tasks[2].parentId = 1; expect(applyStoryAutomation(next, before)).toEqual([]);
    });
    it('preserves a valid Task update when automation is blocked by workflow', () => {
        const before = project(); before.extensions.workitemAutomation = { version: 1, start: { from: ['to-do'], to: 'testing' } };
        const next = structuredClone(before); next.board.tasks[2].status = 'doing'; expect(applyStoryAutomation(next, before)[0].blocked).toBe(true); expect(next.board.tasks[2].status).toBe('doing'); expect(next.board.tasks[1].status).toBe('to-do');
    });
    it('round-trips fields, parents, inheritance and historical participation without loss', () => {
        const data = project(); data.board.tasks[1].objective = 'Outcome'; data.board.tasks[2].sprintHistory = [{ sprintId: 'a', status: 'done', at: '2026-01-01T00:00:00Z', parentId: 2 }];
        const next = serializeBoardDataFromObject(data); validateBoardData(next); expect(createBoardStateSnapshot(next).board.tasks).toEqual(next.board.tasks); expect(next.board.tasks[2].parentId).toBe(2);
    });
    it('migrates old files to Task without retroactive inheritance or rewritten history', () => {
        const data = project(); data.meta.schemaVersion = 3; data.board.tasks = [normalizeTask({ id: 77, title: 'Legacy', status: 'doing' })];
        const next = serializeBoardDataFromObject(data); expect(next.meta.schemaVersion).toBe(5); expect(next.board.tasks[0]).toMatchObject({ id: 77, type: 'task', phaseMode: 'none', status: 'doing' });
    });
});

describe('US-12 transfer boundary for US-13', () => {
    it('allows a copy without transferring children but rejects moving an attached parent', () => {
        const data = project(); expect(() => assertWorkitemTransfer(data, 1, 'copy')).not.toThrow(); expect(() => assertWorkitemTransfer(data, 1, 'move')).toThrow('children'); expect(() => assertWorkitemTransfer(data, 3, 'move')).not.toThrow();
    });
    it('preserves acceptance on moves, requires a new local author on copies and clears current acceptance in non-completed destinations', () => {
        const source = item(1, 'story', { acceptance: { author: 'Original', at: '2026-01-01T00:00:00Z', local: true } });
        expect(transferredAcceptance(source, 'move', true)).toEqual(source.acceptance);
        expect(() => transferredAcceptance(source, 'copy', true)).toThrow('author');
        expect(transferredAcceptance(source, 'copy', true, 'Copy reviewer')).toMatchObject({ author: 'Copy reviewer', local: true });
        expect(transferredAcceptance(source, 'move', false)).toBeUndefined();
    });
});

describe('US-12 mutation boundaries' , () => {
    it('records direct and automatic effects as one replayable operation', async () => {
        const { actions, data, confirm } = setup();
        data().board.tasks[1].status = 'doing'; data().board.tasks[2].status = 'doing';
        data().extensions.workitemAutomation = { version: 1, finish: { from: ['doing'], to: 'ready-to-test' } };
        expect(await actions.movePortfolioTaskToStatus('p', 3, 'done')).toBe(true);
        const events = data().extensions.timeline!.events.slice(1);
        expect(events.find((event) => event.entityId === '3' && event.changes?.status)).toMatchObject({ changes: { status: { after: 'done' } } });
        expect(events.find((event) => event.entityId === '2' && event.changes?.status)).toMatchObject({ meta: { automatic: true, causeTaskId: 3 } });
        expect(new Set(events.map((event) => event.meta?.operationId)).size).toBe(1);
        expect(events.every((event) => Boolean(event.meta?.operationId))).toBe(true);
        const replay = reconstructBoardStateFromTimeline(data(), data().extensions.timeline!.events.length - 1);
        expect(replay.board.tasks.map((task) => task.status)).toEqual(data().board.tasks.map((task) => task.status));
        expect(replay.extensions.sprintParticipation).toEqual(data().extensions.sprintParticipation);
        expect(confirm).toHaveBeenCalledTimes(1);
    });

    it('keeps the pre-planning baseline free of later Sprints and participation', async () => {
        const { store, actions, data } = setup();
        data().extensions.roadmap!.sprints = [];
        data().board.tasks.forEach((task) => { task.sprintId = ''; }); data().board.tasks[2].parentId = null;
        store.setState({ portfolioBulkSelectionByBoardId: { p: [3] }, roadmapEntityContext: { boardId: 'p', kind: 'sprints', itemId: '', mode: 'create-sprint-from-selection' } });
        await actions.saveRoadmapEntity({ kind: 'sprints', title: 'New Sprint', startDate: '2026-01-01', endDate: '2099-12-31' });
        expect(data().extensions.roadmap!.sprints).toHaveLength(1);
        expect(reconstructBoardStateFromTimeline(data(), 0).extensions.roadmap!.sprints).toHaveLength(0);
        expect(reconstructBoardStateFromTimeline(data(), 0).extensions.sprintParticipation).toBeUndefined();
    });
    it('records explicit acceptance with a local author and preserves it on replay', async () => {
        const { actions, data, prompt } = setup(); data().board.tasks[1].status = 'testing'; data().board.tasks[2].status = 'done';
        expect(await actions.movePortfolioTaskToStatus('p', 2, 'done')).toBe(true); expect(prompt).toHaveBeenCalledTimes(1);
        expect(data().board.tasks[1].acceptance).toMatchObject({ author: 'Ana', local: true });
        const replay = reconstructBoardStateFromTimeline(data(), data().extensions.timeline!.events.length - 1); expect(replay.board.tasks[1].acceptance?.author).toBe('Ana');
    });
    it('preserves acceptance and Sprint history after JSON save/reopen and another mutation', async () => {
        const { store, actions, data } = setup(); data().board.tasks[1].status = 'testing'; data().board.tasks[2].status = 'done';
        await actions.movePortfolioTaskToStatus('p', 2, 'done');
        const count = data().extensions.timeline!.events.length;
        const saved = serializeBoardDataFromObject(JSON.parse(JSON.stringify(data()))); validateBoardData(saved);
        expect(saved.extensions.timeline!.events).toHaveLength(count);
        store.setState({ portfolioBoards: store.getState().portfolioBoards.map((board) => ({ ...board, data: saved })) });
        await actions.setPortfolioTaskPriority('p', 2, 'high');
        expect(data().extensions.timeline!.events.length).toBeGreaterThan(count);
        expect(reconstructBoardStateFromTimeline(data(), 0).board.tasks[1].status).toBe('testing');
        expect(data().board.tasks[1].acceptance?.author).toBe('Ana');
    });
    it('requires renewed functional acceptance if accepted Story criteria change', async () => {
        const { actions, data, store, prompt } = setup(); data().board.tasks[1].status = 'done'; data().board.tasks[2].status = 'done'; data().board.tasks[1].acceptance = { author: 'Previous reviewer', at: '2026-01-01T00:00:00Z', local: true };
        store.setState({ portfolioEditContext: { boardId: 'p', taskId: 2 } });
        prompt.mockResolvedValueOnce(null);
        const task = data().board.tasks[1];
        await actions.saveTask({ ...task, type: 'story', title: task.title, rawDueDate: '', acceptanceCriteria: 'Changed criteria', attachments: [] });
        expect(data().board.tasks[1].acceptanceCriteria).toBe('Business accepts');
        expect(prompt).toHaveBeenCalledTimes(1);
    });
    it('cancelling acceptance makes no persisted mutation', async () => {
        const { actions, data, prompt, save } = setup(); prompt.mockResolvedValueOnce(null); data().board.tasks[1].status = 'testing'; data().board.tasks[2].status = 'done';
        const original = JSON.stringify(data()); expect(await actions.movePortfolioTaskToStatus('p', 2, 'done')).toBe(false); expect(JSON.stringify(data())).toBe(original); expect(save).not.toHaveBeenCalled();
    });
    it('blocks acceptance with pending children without asking for a name', async () => {
        const { actions, data, prompt, alert } = setup(); data().board.tasks[1].status = 'testing';
        expect(await actions.movePortfolioTaskToStatus('p', 2, 'done')).toBe(false); expect(prompt).not.toHaveBeenCalled(); expect(alert).toHaveBeenCalled();
    });
    it('keeps Epic state manual and confirms completion with pending children', async () => {
        const { actions, data, confirm } = setup(); data().extensions.workflow!.transitions['to-do'].push('done');
        expect(await actions.movePortfolioTaskToStatus('p', 1, 'done')).toBe(true); expect(confirm).toHaveBeenCalled(); expect(childrenOf(data(), 1)[0].status).toBe('to-do');
    });
    it('rejects stale confirmation without changing the newly loaded project', async () => {
        const { actions, data, confirm, store, save } = setup(); data().extensions.workflow!.transitions['to-do'].push('done');
        confirm.mockImplementationOnce(async () => { const boards = store.getState().portfolioBoards; store.setState({ portfolioBoards: boards.map((board) => ({ ...board, data: structuredClone(board.data) })) }); return true; });
        expect(await actions.movePortfolioTaskToStatus('p', 1, 'done')).toBe(false); expect(save).not.toHaveBeenCalled(); expect(data().board.tasks[0].status).toBe('to-do');
    });
});
