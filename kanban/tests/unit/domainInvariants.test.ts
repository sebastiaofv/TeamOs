// Issue #101: each test tries to put the project into a state the domain forbids.
import { describe, expect, it, vi } from 'vitest';
import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { serializeBoardDataFromObject } from '@/domain/serialize';
import { cloneSerializable } from '@/domain/serializable';
import { mergeProject } from '@/domain/projectMerge';
import { assertWorkitemTransition, workitemTransitionViolations } from '@/domain/workitems';
import { tryWithTransferLock } from '@/infrastructure/persistence/projectLock';
import { createAppStore } from '@/features/portfolio/state/store';
import { createBoardMutationContext } from '@/features/portfolio/commands/mutationContext';
import { createProjectTransferActions } from '@/features/portfolio/commands/projectTransferCommands';
import { restoreProjectRecovery, syncProjectSaveStates } from '@/infrastructure/persistence/projectFiles';
import type { ProjectRecovery } from '@/infrastructure/persistence/projectRecovery';
import { useAppStore } from '@/features/portfolio/state/store';
import type { BoardData, Task } from '@/domain/types';
import type { BoardRecord } from '@/features/portfolio/types';

const at = '2026-11-12T10:00:00.000Z';
const acceptance = { author: 'Ana', at, local: true as const };
const task = (input: Parameters<typeof normalizeTask>[0]): Task => ({ ...normalizeTask({ createdAt: at, updatedAt: at, ...input }), assigneeIds: [], responsibleId: '' });
function project(...tasks: Task[]): BoardData {
    const data = serializeBoardDataFromObject(createEmptyProjectData('Inv', 'INV'));
    data.board.tasks.push(...tasks);
    return data;
}
const replicas = (base: BoardData) => ({ base, local: cloneSerializable(base), external: cloneSerializable(base) });
const sprint = { id: 's1', title: 'S1', startDate: '2026-11-02', endDate: '2026-11-13', status: 'planned' as const };
const withSprint = (data: BoardData) => { data.extensions.roadmap = { version: 1, milestones: [], phases: [], sprints: [cloneSerializable(sprint)] }; return data; };
const epicAndStory = (storyStatus: string) => project(
    task({ id: 1, permanentId: 'e', displayId: 'INV-EP-1', type: 'epic', title: 'Epic', status: 'backlog' }),
    task({ id: 2, permanentId: 's', displayId: 'INV-US-2', type: 'story', parentId: 1, title: 'Story', status: storyStatus }));

describe('concurrent creation (identity)', () => {
    it('keeps both workitems when two replicas create the same number', () => {
        const { base, local, external } = replicas(project());
        local.board.tasks.push(task({ id: 1, permanentId: 'L', displayId: 'INV-TK-1', title: 'Local', status: 'backlog' }));
        local.extensions.taskIdentity = { version: 1, highWaterMark: 1 };
        external.board.tasks.push(
            task({ id: 1, permanentId: 'E', displayId: 'INV-TK-1', type: 'story', title: 'External story', status: 'backlog' }),
            task({ id: 2, permanentId: 'E2', displayId: 'INV-TK-2', title: 'External child', status: 'backlog' }));
        external.board.tasks[0].displayId = 'INV-US-1';
        external.board.tasks[1].parentId = 1;
        external.extensions.taskRelations = { version: 1, relations: [{ sourceId: 1, targetId: 2, kind: 'related' }] };
        external.extensions.dayPlanner = { version: 1, blocks: [{ id: 'b', taskId: 1, date: '2026-11-12', start: '09:00', end: '10:00' }] };
        external.extensions.taskIdentity = { version: 1, highWaterMark: 2 };
        const result = mergeProject(base, local, external);
        expect(result.conflicts).toEqual([]);
        const byPermanentId = new Map(result.merged.board.tasks.map((item) => [item.permanentId, item]));
        expect([...byPermanentId.keys()].sort()).toEqual(['E', 'E2', 'L']);
        expect(new Set(result.merged.board.tasks.map((item) => item.id)).size).toBe(3);
        expect(new Set(result.merged.board.tasks.map((item) => item.displayId)).size).toBe(3);
        const story = byPermanentId.get('E')!, child = byPermanentId.get('E2')!;
        expect(byPermanentId.get('L')!.id).toBe(1);
        expect(story.id).not.toBe(1);
        expect(story.displayId).toBe(`INV-US-${story.id}`);
        expect(child.parentId).toBe(story.id);
        expect(result.merged.extensions.taskRelations!.relations).toEqual([{ sourceId: Math.min(story.id, child.id), targetId: Math.max(story.id, child.id), kind: 'related' }]);
        expect(result.merged.extensions.dayPlanner!.blocks[0].taskId).toBe(story.id);
        expect(result.merged.extensions.taskIdentity!.highWaterMark).toBeGreaterThanOrEqual(Math.max(...result.merged.board.tasks.map((item) => item.id)));
        expect(() => validateBoardData(result.merged)).not.toThrow();
    });
});

describe('workitem transitions', () => {
    it('rejects a Story that becomes completed without acceptance', () => {
        const previous = epicAndStory('testing');
        const next = cloneSerializable(previous); next.board.tasks[1].status = 'done';
        expect(() => assertWorkitemTransition(next, previous)).toThrow(/acceptance/i);
        next.board.tasks[1].acceptance = acceptance;
        expect(() => assertWorkitemTransition(next, previous)).not.toThrow();
    });
    it('rejects a Story that becomes completed with an open child Task', () => {
        const previous = epicAndStory('testing');
        previous.board.tasks.push(task({ id: 3, permanentId: 't', displayId: 'INV-TK-3', type: 'task', parentId: 2, title: 'Task', status: 'to-do' }));
        const next = cloneSerializable(previous); Object.assign(next.board.tasks[1], { status: 'done', acceptance });
        expect(workitemTransitionViolations(next, previous)).toContain('pending:s');
    });
    it('keeps opening projects whose Stories were completed before acceptance existed', () => {
        const legacy = epicAndStory('done');
        expect(workitemTransitionViolations(cloneSerializable(legacy), legacy)).toEqual([]);
        expect(() => validateBoardData(legacy)).not.toThrow();
    });
    it('rejects assigning a workitem to a Sprint that does not exist', () => {
        const previous = withSprint(project(task({ id: 1, permanentId: 'x', title: 'x', status: 'backlog' })));
        const next = cloneSerializable(previous); next.board.tasks[0].sprintId = 'ghost';
        expect(workitemTransitionViolations(next, previous)).toContain('sprintMissing:x');
        next.board.tasks[0].sprintId = 's1';
        expect(workitemTransitionViolations(next, previous)).toEqual([]);
    });
    it('rejects removing a Sprint that workitems still reference', () => {
        const previous = withSprint(project(task({ id: 1, permanentId: 'x', title: 'x', status: 'backlog', sprintId: 's1' })));
        const next = cloneSerializable(previous); next.extensions.roadmap!.sprints = [];
        expect(workitemTransitionViolations(next, previous)).toContain('sprintMissing:x');
    });
    it('rejects new Sprint participation for a Sprint that does not exist', () => {
        const previous = withSprint(project());
        const next = cloneSerializable(previous);
        next.extensions.sprintParticipation = { version: 1, entries: [{ sprintId: 'ghost', task: task({ id: 5, title: 'x', status: 'backlog' }), at }] };
        expect(workitemTransitionViolations(next, previous)).toContain('sprintMissing:participation:ghost:5');
    });
    it('rejects a type or display ID change for the same permanent identity', () => {
        const previous = epicAndStory('backlog');
        const next = cloneSerializable(previous); next.board.tasks[1].type = 'bug';
        expect(workitemTransitionViolations(next, previous)).toContain('immutable:s');
    });
});

describe('merge integrity', () => {
    it('raises a conflict when one side completes a Story while the other adds an open child', () => {
        const { base, local, external } = replicas(epicAndStory('testing'));
        Object.assign(local.board.tasks[1], { status: 'done', acceptance });
        external.board.tasks.push(task({ id: 3, permanentId: 't', displayId: 'INV-TK-3', type: 'task', parentId: 2, title: 'Task', status: 'to-do' }));
        external.extensions.taskIdentity = { version: 1, highWaterMark: 3 };
        expect(mergeProject(base, local, external).conflicts.map((conflict) => conflict.reason)).toContain('integrity');
    });
    it('raises a conflict when one side deletes a Sprint and the other assigns to it', () => {
        const { base, local, external } = replicas(withSprint(project(task({ id: 1, permanentId: 'x', title: 'x', status: 'backlog' }))));
        local.extensions.roadmap!.sprints = [];
        external.board.tasks[0].sprintId = 's1';
        expect(mergeProject(base, local, external).conflicts.map((conflict) => conflict.reason)).toContain('integrity');
    });
    it('raises a conflict when the other side changes a workitem type', () => {
        const { base, local, external } = replicas(epicAndStory('backlog'));
        Object.assign(external.board.tasks[1], { type: 'bug', displayId: 'INV-BG-2' });
        expect(mergeProject(base, local, external).conflicts.map((conflict) => conflict.reason)).toContain('integrity');
    });
    it('does not flag a violation that one side already had on its own', () => {
        const { base, local, external } = replicas(epicAndStory('testing'));
        local.board.tasks[1].status = 'done'; // legacy-style completion without acceptance
        external.board.tasks[0].title = 'Renamed epic';
        const result = mergeProject(base, local, external);
        expect(result.conflicts).toEqual([]);
        expect(result.merged.board.tasks[0].title).toBe('Renamed epic');
    });
    it('treats related pairs in either order as the same relation', () => {
        const base = project(task({ id: 1, permanentId: 'a', title: 'a', status: 'backlog' }), task({ id: 2, permanentId: 'b', title: 'b', status: 'backlog' }));
        const local = cloneSerializable(base), external = cloneSerializable(base);
        local.extensions.taskRelations = { version: 1, relations: [{ sourceId: 1, targetId: 2, kind: 'related' }] };
        external.extensions.taskRelations = { version: 1, relations: [{ sourceId: 2, targetId: 1, kind: 'related' }] };
        const result = mergeProject(base, local, external);
        expect(result.conflicts).toEqual([]);
        expect(result.merged.extensions.taskRelations!.relations).toEqual([{ sourceId: 1, targetId: 2, kind: 'related' }]);
    });
    it('stores related pairs in ascending order', () => {
        const data = project(task({ id: 1, title: 'a', status: 'backlog' }), task({ id: 2, title: 'b', status: 'backlog' }));
        data.extensions.taskRelations = { version: 1, relations: [{ sourceId: 2, targetId: 1, kind: 'related' }] };
        expect(serializeBoardDataFromObject(data).extensions.taskRelations!.relations).toEqual([{ sourceId: 1, targetId: 2, kind: 'related' }]);
    });
});

describe('workflow resolution', () => {
    it('keeps the Board columns on the technical workflow when Tasks follow the functional workflow', () => {
        const data = project(task({ id: 1, title: 'Task', status: 'backlog' }));
        data.extensions.functionalWorkflow = cloneSerializable(data.extensions.workflow!);
        data.extensions.functionalWorkflow.states.find((state) => state.id === 'testing')!.name = 'Business testing';
        data.extensions.workflowTypes = { version: 1, functional: ['epic', 'story', 'task', 'bug'] };
        const saved = serializeBoardDataFromObject(data, { reuseTimeline: true });
        expect(saved.board.columns.map((column) => column.title)).toContain('Testing');
        expect(() => validateBoardData(saved)).not.toThrow();
    });
});

describe('publication boundary', () => {
    function context() {
        const data = project(task({ id: 1, permanentId: 'x', displayId: 'INV-TK-1', title: 'Task', status: 'backlog' }));
        const store = createAppStore(fromAny({ portfolioBoards: [{ id: 'p1', title: 'Inv', fileName: 'inv', handle: {}, data }], portfolioTimelineSelection: { boardId: '', eventIndex: null }, projectSaveStateById: new Map(), selectedPortfolioBoardId: 'p1' }));
        const markDirty = vi.fn(), enqueueSave = vi.fn(async () => true), alert = vi.fn(), confirm = vi.fn(async () => true);
        return { store, markDirty, enqueueSave, alert, data, context: createBoardMutationContext({ store, markDirty, enqueueSave, alert, confirm }) };
    }
    it('never publishes or records a draft that fails document validation', async () => {
        const { store, markDirty, enqueueSave, alert, data, context: mutations } = context();
        const saved = await mutations.runPortfolioBoardMutation('p1', (draft) => { draft.board.tasks[0].tags = ['not-a-project-tag']; return true; });
        expect(saved).toBe(false);
        expect(store.getState().portfolioBoards[0].data).toBe(data);
        expect(markDirty).not.toHaveBeenCalled();
        expect(enqueueSave).not.toHaveBeenCalled();
        expect(alert).toHaveBeenCalled();
    });
    it('never publishes a dangling Sprint assignment', async () => {
        const { store, data, context: mutations } = context();
        expect(await mutations.runPortfolioBoardMutation('p1', (draft) => { draft.board.tasks[0].sprintId = 'ghost'; return true; })).toBe(false);
        expect(store.getState().portfolioBoards[0].data).toBe(data);
    });
});

describe('recovery restore', () => {
    it('refuses a recovery draft that is not a valid project', () => {
        const data = project(task({ id: 1, permanentId: 'x', displayId: 'INV-TK-1', title: 'Task', status: 'backlog' }));
        const board: BoardRecord = fromPartial({ id: 'rec', title: 'Inv', fileName: 'inv', handle: {}, data });
        useAppStore.setState({ portfolioBoards: [board] }); syncProjectSaveStates();
        const local = cloneSerializable(data);
        local.board.tasks.push({ ...cloneSerializable(local.board.tasks[0]), permanentId: 'y' }); // duplicate number
        const draft: ProjectRecovery = { id: 'draft', projectId: data.extensions.project!.id, fileName: 'inv', at, base: data, baseHash: 'h', local };
        expect(restoreProjectRecovery('rec', draft)).toBe(false);
        expect(useAppStore.getState().portfolioBoards[0].data).toBe(data);
        expect(restoreProjectRecovery('rec', { ...draft, local: cloneSerializable(data), base: local })).toBe(false);
        expect(restoreProjectRecovery('rec', { ...draft, local: cloneSerializable(data) })).toBe(true);
    });
});

describe('cross-tab transfers', () => {
    it('refuses to move a workitem that another tab is already transferring', async () => {
        const source: BoardRecord = fromPartial({ id: 'src', title: 'Source', fileName: 'src', handle: {}, data: project(task({ id: 1, permanentId: 'moving', displayId: 'INV-TK-1', title: 'Moving', status: 'backlog' })) });
        const destinationData = serializeBoardDataFromObject(createEmptyProjectData('Destination', 'DST'));
        for (const data of [source.data, destinationData]) data.extensions.project!.productName = 'house';
        const destination: BoardRecord = fromPartial({ id: 'dst', title: 'Destination', fileName: 'dst', handle: {}, data: destinationData });
        const store = createAppStore(fromAny({ portfolioBoards: [source, destination], portfolioTimelineSelection: { boardId: '', eventIndex: null }, projectSaveStateById: new Map(), unloadedRelationSources: [] }));
        const alert = vi.fn(async () => undefined), choose = vi.fn(async () => null);
        const actions = createProjectTransferActions(createBoardMutationContext({ store, alert, choose, enqueueSave: vi.fn(async () => true), markDirty: vi.fn() }), async () => true);
        let release!: () => void;
        const otherTab = tryWithTransferLock('moving', () => new Promise<void>((resolve) => { release = resolve; }));
        await Promise.resolve();
        expect(await actions.transferPortfolioTask('src', 1, 'move')).toBe(false);
        expect(choose).not.toHaveBeenCalled();
        expect(alert).toHaveBeenCalledWith(expect.stringMatching(/./));
        release(); await otherTab;
        // Once the other tab is done, the same request reaches the destination choice.
        await actions.transferPortfolioTask('src', 1, 'move');
        expect(choose).toHaveBeenCalledTimes(1);
    });
});
