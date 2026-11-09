import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { applyHierarchyAutomations, defaultHierarchyAutomations, getHierarchyAutomations, parseHierarchyAutomations, type AutomationMode, type AutomationRule } from '@/domain/hierarchyAutomations';
import { serializeBoardDataFromObject } from '@/domain/serialize';
import { getWorkflow } from '@/domain/workflow';
import { ensureBoardTimelineBaseline, reconstructBoardStateFromTimeline } from '@/domain/timeline';
import { projectTaskHistory } from '@/domain/taskHistory';
import { createAppStore } from '@/features/portfolio/state/store';
import { createPortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';
import { createBoardMutationContext } from '@/features/portfolio/commands/mutationContext';
import { resolveHierarchyAutomations } from '@/features/portfolio/commands/hierarchyAutomationChanges';
import type { ConfirmOptions } from '@/app/overlays/appMessages';
import type { BoardData, Task, WorkitemType } from '@/domain/types';

const item = (id: number, type: WorkitemType, status: string, parentId?: number) => normalizeTask({ id, title: `${type} ${id}`, type, status, parentId });
function project(mode: AutomationMode = 'confirm') {
    const data = createEmptyProjectData('Automations');
    data.extensions.project!.acronym = 'AUTO';
    data.extensions.functionalWorkflow = structuredClone(getWorkflow(data, 'functional'));
    data.extensions.hierarchyAutomations = defaultHierarchyAutomations();
    for (const rule of Object.keys(data.extensions.hierarchyAutomations.rules) as AutomationRule[]) data.extensions.hierarchyAutomations.rules[rule] = mode;
    data.board.tasks = [item(1, 'epic', 'to-do'), item(2, 'story', 'to-do', 1), item(3, 'task', 'to-do', 2)];
    return data;
}
const statuses = (data: BoardData) => data.board.tasks.map((task) => task.status);
function setup(data = project()) {
    const second = project('off'); second.extensions.project!.id = 'other'; second.extensions.project!.acronym = 'OTHER';
    const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', data, handle: {} }), fromPartial({ id: 'other', data: second, handle: {} })], selectedPortfolioBoardId: 'p' });
    const confirm = vi.fn<(text: string, options?: ConfirmOptions) => Promise<boolean | Record<string, string>>>(async () => true);
    const save = vi.fn(async () => true);
    const deps = { store, confirm, prompt: vi.fn(async () => 'Ana'), alert: vi.fn(), markDirty: vi.fn(), enqueueSave: save };
    return { store, confirm, save, actions: createPortfolioMutationActions(deps), context: createBoardMutationContext(deps), data: () => store.getState().portfolioBoards[0].data };
}

describe('US-30 hierarchy rules', () => {
    it('defaults every rule to validation, including legacy projects without settings', () => {
        const data = project(); delete data.extensions.hierarchyAutomations;
        expect(Object.values(getHierarchyAutomations(data).rules)).toEqual(Array(8).fill('confirm'));
    });
    const scenarios: { rule: AutomationRule; before: string[]; after: Partial<Task>; expected: string }[] = [
        { rule: 'parentToTodo', before: ['backlog', 'backlog', 'backlog'], after: { status: 'to-do' }, expected: 'to-do' },
        { rule: 'startParent', before: ['to-do', 'to-do', 'to-do'], after: { status: 'doing' }, expected: 'doing' },
        { rule: 'prepareTesting', before: ['doing', 'doing', 'doing'], after: { status: 'ready-to-test' }, expected: 'ready-to-test' },
        { rule: 'cancelParent', before: ['doing', 'doing', 'doing'], after: { status: 'cancelled' }, expected: 'cancelled' },
        { rule: 'reopenParent', before: ['doing', 'ready-to-test', 'done'], after: { status: 'doing' }, expected: 'doing' }
    ];
    for (const scenario of scenarios) for (const mode of ['off', 'confirm', 'automatic'] as const) it(`${scenario.rule} respects ${mode}`, () => {
        const before = project('off'); before.board.tasks.forEach((task, index) => { task.status = scenario.before[index]; });
        before.extensions.hierarchyAutomations!.rules[scenario.rule] = mode;
        before.board.tasks[1].parentId = null;
        const next = structuredClone(before); Object.assign(next.board.tasks[2], scenario.after);
        const approve = vi.fn(() => true);
        const effects = applyHierarchyAutomations(next, before, approve);
        expect(next.board.tasks[1].status).toBe(mode === 'off' ? scenario.before[1] : scenario.expected);
        expect(effects.length).toBe(mode === 'off' ? 0 : 1);
        expect(approve).toHaveBeenCalledTimes(mode === 'confirm' ? 1 : 0);
    });
    it('completes Epics with completed relevant children, excluding cancelled children', () => {
        const before = project('automatic'); before.board.tasks = [item(1, 'epic', 'doing'), item(2, 'story', 'testing', 1), item(3, 'task', 'cancelled', 1)];
        const next = structuredClone(before); next.board.tasks[1].status = 'done';
        expect(applyHierarchyAutomations(next, before, () => false)).toMatchObject([{ rule: 'completeEpic', outcome: 'automatic' }]); expect(next.board.tasks[0].status).toBe('done');
    });
    it('prepares testing from completed Tasks when the technical workflow has no Testing category', () => {
        const before = project('automatic'); before.board.tasks[1].status = 'doing';
        const technical = before.extensions.workflow!;
        technical.states = technical.states.filter((state) => state.category !== 'testing');
        delete technical.references.testing;
        for (const state of Object.keys(technical.transitions)) if (!technical.states.some((item) => item.id === state)) delete technical.transitions[state];
        technical.transitions.doing.push('re-analysis');
        for (const [state, targets] of Object.entries(technical.transitions)) technical.transitions[state] = targets.filter((id) => technical.states.some((state) => state.id === id));
        const next = structuredClone(before); next.board.tasks[2].status = 'done';
        applyHierarchyAutomations(next, before, () => true); expect(next.board.tasks[1].status).toBe('ready-to-test');
    });
    it('never completes a Story or accepts it, and does not advance empty or all-cancelled parents to Testing', () => {
        const before = project('automatic'); before.board.tasks[1].status = 'doing';
        const next = structuredClone(before); next.board.tasks[2].status = 'done'; applyHierarchyAutomations(next, before, () => true);
        expect(next.board.tasks[1].status).toBe('ready-to-test'); expect(next.board.tasks[1].acceptance).toBeUndefined();
        next.board.tasks = next.board.tasks.filter((task) => task.id !== 3); const empty = structuredClone(next);
        expect(applyHierarchyAutomations(empty, next, () => true)).toEqual([]);
    });
    it('uses the rule category and mode even when an old Story rule names a different destination', () => {
        const before = project('automatic');
        before.extensions.workitemAutomation = { version: 1, start: { from: ['to-do'], to: 'ready-to-test' } };
        const next = structuredClone(before); next.board.tasks[2].status = 'doing';
        applyHierarchyAutomations(next, before, () => true); expect(next.board.tasks[1].status).toBe('doing');
        before.extensions.hierarchyAutomations!.rules.startParent = 'off';
        const disabled = structuredClone(before); disabled.board.tasks[2].status = 'doing';
        expect(applyHierarchyAutomations(disabled, before, () => true)).toEqual([]);
    });
    it('respects custom workflow IDs and permitted transitions', () => {
        const before = project('automatic'); const workflow = before.extensions.functionalWorkflow!;
        workflow.states.find((state) => state.id === 'doing')!.id = 'development'; workflow.references['in-progress'] = 'development';
        workflow.transitions.development = workflow.transitions.doing; delete workflow.transitions.doing;
        for (const state of Object.keys(workflow.transitions)) workflow.transitions[state] = workflow.transitions[state].map((id) => id === 'doing' ? 'development' : id);
        const next = structuredClone(before); next.board.tasks[2].status = 'doing';
        applyHierarchyAutomations(next, before, () => true); expect(next.board.tasks[1].status).toBe('development');
        before.extensions.functionalWorkflow!.transitions['to-do'] = ['cancelled'];
        before.extensions.functionalWorkflow!.transitions.backlog.push('development');
        const blocked = structuredClone(before); blocked.board.tasks[2].status = 'doing';
        expect(applyHierarchyAutomations(blocked, before, () => true)).toMatchObject([{ outcome: 'blocked', from: 'to-do', to: 'development' }]); expect(blocked.board.tasks[1].status).toBe('to-do');
    });
    it('reassesses both old and new parents on reparenting and keeps structural configuration independent', () => {
        const before = project('off'); before.extensions.hierarchyAutomations!.rules.hierarchyChanges = 'automatic';
        before.board.tasks[1].status = 'doing'; before.board.tasks.push(item(4, 'story', 'to-do'), item(5, 'task', 'done', 2)); before.board.tasks[2].status = 'doing';
        const next = structuredClone(before); next.board.tasks[2].parentId = 4;
        const effects = applyHierarchyAutomations(next, before, () => true);
        expect(effects.map((effect) => effect.parentId)).toEqual([2, 4]); expect(effects.every((effect) => effect.rule === 'hierarchyChanges')).toBe(true);
        expect(next.board.tasks[1].status).toBe('ready-to-test'); expect(next.board.tasks[3].status).toBe('doing');
    });
    it('reevaluates removals and new children, but never vacuously completes an empty Epic', () => {
        const before = project('automatic'); before.board.tasks = [item(1, 'epic', 'doing'), item(2, 'story', 'done', 1), item(3, 'task', 'doing', 1)];
        const next = structuredClone(before); next.board.tasks.pop(); applyHierarchyAutomations(next, before, () => true); expect(next.board.tasks[0].status).toBe('done');
        const empty = structuredClone(before); empty.board.tasks = [empty.board.tasks[0]]; applyHierarchyAutomations(empty, before, () => true); expect(empty.board.tasks[0].status).toBe('doing');
        const added = project('automatic'); const created = structuredClone(added); created.board.tasks.push(item(4, 'task', 'doing', 2));
        applyHierarchyAutomations(created, added, () => true); expect(created.board.tasks[1].status).toBe('doing');
    });
});

describe('US-30 mutation integration and persistence', () => {
    it('groups every confirmed cascade into one review with the workitems, states and reasons', async () => {
        const { actions, data, confirm } = setup();
        await actions.movePortfolioTaskToStatus('p', 3, 'doing');
        expect(statuses(data())).toEqual(['doing', 'doing', 'doing']); expect(confirm).toHaveBeenCalledTimes(1);
        expect(confirm.mock.calls[0][1]?.selections).toHaveLength(2);
        expect(confirm.mock.calls[0][1]?.workitems).toMatchObject({ rules: [{ name: 'Start parent work' }], countSelection: true, rows: [{ from: 'To Do', to: 'In progress' }, { from: 'To Do', to: 'In progress' }] });
    });
    it.each([false, { '2:startParent:to-do:doing': 'keep', '1:startParent:to-do:doing': 'advance' }])('preserves the child edit and does not cascade rejected states: %j', async (answer) => {
        const { actions, data, confirm, save } = setup(); confirm.mockResolvedValueOnce(answer);
        expect(await actions.movePortfolioTaskToStatus('p', 3, 'doing')).toBe(true);
        expect(statuses(data())).toEqual(['to-do', 'to-do', 'doing']); expect(save).toHaveBeenCalled();
        const rejection = data().extensions.timeline!.events.find((event) => event.kind === 'task.automation.rejected');
        expect(rejection?.meta).toMatchObject({ automationOutcome: 'rejected', previousStatus: 'to-do', proposedStatus: 'doing' });
        expect(projectTaskHistory(data(), data().board.tasks[1]).entries[0].summary).toContain('rejected by user');
        expect(data().extensions.timeline!.events.filter((event) => event.entityId === '1' && event.meta?.automationRule)).toHaveLength(0);
    });
    it('separates titles containing state names from the actual current and proposed states', async () => {
        const before = project();
        before.board.tasks[1].title = 'Testing → Done rollout';
        const { actions, confirm } = setup(before);
        await actions.movePortfolioTaskToStatus('p', 3, 'doing');
        expect(confirm.mock.calls[0][1]?.workitems?.rows[0]).toMatchObject({
            title: 'Testing → Done rollout', from: 'To Do', to: 'In progress', type: 'story'
        });
        expect(confirm.mock.calls[0][1]?.cancelLabel).toBe('Keep all current');
    });

    it('automates a lower level and reviews the Epic using the applied state', async () => {
        const before = project(); before.board.tasks[0].status = 'doing'; before.board.tasks[1].status = 'doing'; before.board.tasks[2].status = 'cancelled';
        before.extensions.hierarchyAutomations!.rules.hierarchyChanges = 'automatic';
        before.extensions.hierarchyAutomations!.rules.cancelParent = 'confirm';
        // Existing all-cancelled Story is reevaluated by a new cancelled child.
        const next = structuredClone(before); next.board.tasks.push(item(4, 'task', 'cancelled', 2));
        ensureBoardTimelineBaseline(next); const confirm = vi.fn(async () => false);
        await resolveHierarchyAutomations(next, before, confirm);
        expect(next.board.tasks[1].status).toBe('cancelled'); expect(next.board.tasks[0].status).toBe('doing');
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(next.extensions.timeline!.events.filter((event) => event.meta?.automationRule).map((event) => event.meta?.automationOutcome)).toEqual(['automatic', 'rejected']);
    });
    it('reviews an alternative Epic transition when a lower proposal is rejected', async () => {
        const before = project();
        before.extensions.functionalWorkflow!.transitions['to-do'].push('done');
        before.board.tasks[1].status = 'doing'; before.board.tasks[2].status = 'doing';
        before.board.tasks.push(item(4, 'task', 'doing', 1));
        const { context, data, confirm } = setup(before);
        confirm.mockImplementation(async (_, options) => options?.selections ? Object.fromEntries(options.selections.map((field) => [field.id, field.id.includes(':startParent:') ? 'advance' : 'keep'])) : true);
        await context.runPortfolioBoardMutation('p', (draft) => {
            draft.board.tasks[2].status = 'cancelled'; draft.board.tasks[3].status = 'done'; return true;
        });
        // The first confirmation belongs to the original cancellation, the second reviews all rule choices.
        const review = confirm.mock.calls.find((call) => call[1]?.selections?.some((field) => field.id.includes(':completeEpic:')));
        expect(review?.[1]?.selections?.map((field) => field.id)).toContain('1:startParent:to-do:doing');
        const rows = review?.[1]?.workitems?.rows || [];
        expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
        expect(rows.find((row) => row.id === '#1')).toMatchObject({ from: 'To Do', to: 'Done / In progress', selectionIds: ['1:completeEpic:to-do:done', '1:startParent:to-do:doing'] });
        expect(data().board.tasks[1].status).toBe('doing'); expect(data().board.tasks[0].status).toBe('doing');
    });

    it('runs On 2 without asking and records automatic history replayably', async () => {
        const { actions, data, confirm } = setup(project('automatic'));
        await actions.movePortfolioTaskToStatus('p', 3, 'doing'); expect(confirm).not.toHaveBeenCalled();
        const events = data().extensions.timeline!.events;
        expect(events.filter((event) => event.meta?.automationOutcome === 'automatic')).toHaveLength(2);
        const replay = reconstructBoardStateFromTimeline(data(), events.length - 1); expect(statuses(replay)).toEqual(statuses(data()));
        expect(projectTaskHistory(data(), data().board.tasks[1]).entries[0].summary).toContain('Automatic rule');
    });
    it('keeps settings local, saves without retroactive effects, round-trips and rejects stale drafts', async () => {
        const initial = project('off'); initial.board.tasks[2].status = 'doing'; const { actions, data, confirm, store } = setup(initial);
        const general = { name: data().board.settings.title, project: structuredClone(data().extensions.project!) };
        const original = structuredClone(getHierarchyAutomations(data())); const config = defaultHierarchyAutomations();
        config.rules.startParent = 'automatic';
        expect(await actions.saveProjectSettings('p', general, general, undefined, undefined, { original, config })).toBe(true);
        expect(statuses(data())).toEqual(['to-do', 'to-do', 'doing']); expect(confirm).not.toHaveBeenCalled();
        expect(store.getState().portfolioBoards[1].data.extensions.hierarchyAutomations!.rules.startParent).toBe('off');
        const reopened = serializeBoardDataFromObject(JSON.parse(JSON.stringify(data()))); validateBoardData(reopened);
        expect(getHierarchyAutomations(reopened)).toEqual(config);
        expect(await actions.saveProjectSettings('p', general, general, undefined, undefined, { original, config })).toBe(false);
    });
    it('rejects invalid imported modes and invalid mutation configurations', () => {
        const data = project(); const raw = JSON.parse(JSON.stringify(data)); raw.extensions.hierarchyAutomations.rules.startParent = 'yes';
        expect(() => serializeBoardDataFromObject(raw)).toThrow(/automation settings/);
        expect(() => validateBoardData(raw)).toThrow();
    });
    it('rejects a stale automation review and preserves read-only boundaries', async () => {
        const { actions, data, store, confirm, save } = setup();
        confirm.mockImplementationOnce(async () => { store.setState({ portfolioBoards: store.getState().portfolioBoards.map((board) => ({ ...board, data: structuredClone(board.data) })) }); return true; });
        expect(await actions.movePortfolioTaskToStatus('p', 3, 'doing')).toBe(false); expect(statuses(data())).toEqual(['to-do', 'to-do', 'to-do']); expect(save).not.toHaveBeenCalled();
        store.setState({ portfolioBoards: store.getState().portfolioBoards.map((board) => ({ ...board, handle: null })) });
        expect(await actions.movePortfolioTaskToStatus('p', 3, 'doing')).toBe(false);
    });
    it('uses one review for bulk changes and supports independent parent decisions', async () => {
        const before = project(); before.board.tasks.push(item(4, 'story', 'to-do'), item(5, 'task', 'to-do', 4));
        const { context, data, confirm } = setup(before);
        confirm.mockImplementationOnce(async (_, options) => Object.fromEntries(options!.selections!.map((field) => [field.id, field.id.startsWith('2:') ? 'keep' : 'advance'])));
        await context.runPortfolioBoardMutation('p', (draft) => { draft.board.tasks.filter((task) => [3, 5].includes(task.id)).forEach((task) => { task.status = 'doing'; }); return true; });
        expect(data().board.tasks[1].status).toBe('to-do'); expect(data().board.tasks[3].status).toBe('doing'); expect(confirm).toHaveBeenCalledTimes(1);
    });
    it('validates the manual test board and its imported automation configuration', () => {
        const raw = JSON.parse(readFileSync('test-board/us-30.board.json', 'utf8')); validateBoardData(raw);
        const board = serializeBoardDataFromObject(raw); validateBoardData(board);
        expect(board.board.tasks.length).toBeGreaterThan(15); expect(getHierarchyAutomations(board)).toEqual(defaultHierarchyAutomations());
    });
});


describe('November 9 workflow feedback', () => {
    it('reopens a Task without redundant confirmation when all rules are Off', async () => {
        const before = project('off'); before.extensions.workflow!.transitions.done.push('doing'); before.board.tasks[1].status = 'done'; before.board.tasks[2].status = 'done';
        const { actions, confirm, data } = setup(before);
        expect(await actions.movePortfolioTaskToStatus('p', 3, 'doing')).toBe(true);
        expect(confirm).not.toHaveBeenCalled();
        expect(data().board.tasks[1].status).toBe('done');
    });
    it.each(['confirm', 'automatic'] as const)('reports blocked workflow transitions in %s without a decision selector', async (mode) => {
        const before = project(mode);
        before.board.tasks[2].status = 'doing';
        const { actions, confirm, data } = setup(before);
        await actions.movePortfolioTaskToStatus('p', 3, 'done');
        expect(data().board.tasks[1].status).toBe('to-do');
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(confirm.mock.calls[0][1]).toMatchObject({ informational: true, title: 'Review workflow automations', workitems: { rows: [{ from: 'To Do', to: 'Ready to test', field: 'Status' }] } });
        expect(confirm.mock.calls[0][1]?.selections).toBeUndefined();
    });
});


it('migrates saved seven-rule settings with the new Sprint rule in On 1', () => {
    const legacy = JSON.parse(JSON.stringify(defaultHierarchyAutomations()));
    delete legacy.rules.sprintUnfinishedTasks;
    legacy.rules.startParent = 'off';
    const migrated = parseHierarchyAutomations(legacy);
    expect(migrated.rules.sprintUnfinishedTasks).toBe('confirm');
    expect(migrated.rules.startParent).toBe('off');
    expect(legacy.rules.sprintUnfinishedTasks).toBeUndefined();
});


it('keeps a parent field independently of another edit, including estimates and replayed history', async () => {
    const before = project('off');
    before.board.tasks[2].parentId = null; before.board.tasks[2].storyPoints = 8;
    const { context, data, confirm } = setup(before);
    confirm.mockResolvedValueOnce({ '3:parentId': 'keep' });
    await context.runPortfolioTaskMutation('p', 3, (task) => { task.parentId = 2; task.title = 'A retained edit'; return true; });
    expect(data().board.tasks[2]).toMatchObject({ parentId: null, storyPoints: 8, title: 'A retained edit' });
    const events = data().extensions.timeline!.events;
    expect(events.some((event) => event.entityId === '3' && event.changes?.parentId)).toBe(false);
    const replay = reconstructBoardStateFromTimeline(data(), events.length - 1);
    expect(replay.board.tasks[2]).toMatchObject({ parentId: null, storyPoints: 8, title: 'A retained edit' });
});
