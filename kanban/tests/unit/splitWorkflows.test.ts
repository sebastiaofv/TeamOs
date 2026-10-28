import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '@/domain/board';
import { applyWorkflow, canTransition, defaultWorkflow, getWorkflow, statusCategory } from '@/domain/workflow';
import { normalizeTask } from '@/domain/task';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from '@/domain/serialize';
import { hiddenBoardStates, setBoardColumnVisibility } from '@/domain/boardView';
import { applyStoryAutomation, validateAutomation, workitemProgress } from '@/domain/workitems';
import { planningProgress } from '@/domain/phaseTree';
import { createAppStore } from '@/features/portfolio/state/store';
import { createPortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';
import { buildPortfolioTasks } from '@/features/portfolio/queries/portfolioRowViews';
import { buildPortfolioBoardView } from '@/features/portfolio/queries/portfolioBoardView';
import { reconstructBoardStateFromTimeline } from '@/domain/timeline';

function functionalWorkflow() {
    const workflow = defaultWorkflow();
    workflow.states.find((state) => state.id === 'doing')!.id = 'analysis';
    workflow.states.find((state) => state.id === 'analysis')!.name = 'Functional analysis';
    workflow.references['in-progress'] = 'analysis';
    workflow.transitions.analysis = workflow.transitions.doing;
    delete workflow.transitions.doing;
    for (const id of Object.keys(workflow.transitions)) workflow.transitions[id] = workflow.transitions[id].map((target) => target === 'doing' ? 'analysis' : target);
    return workflow;
}

function setup() {
    const data = createEmptyProjectData('Split workflows');
    data.extensions.functionalWorkflow = functionalWorkflow();
    data.board.tasks = [
        normalizeTask({ id: 1, title: 'Technical task', status: 'to-do', type: 'task' }),
        normalizeTask({ id: 2, title: 'Functional story', status: 'to-do', type: 'story', acceptanceCriteria: 'Validated' }),
        normalizeTask({ id: 3, title: 'Functional epic', status: 'backlog', type: 'epic' }),
        normalizeTask({ id: 4, title: 'Technical bug', status: 'backlog', type: 'bug' })
    ];
    const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Split workflows', handle: {}, data })], selectedPortfolioBoardId: 'p' });
    const alert = vi.fn(), confirm = vi.fn(async () => true), prompt = vi.fn(async () => 'Ana');
    const save = vi.fn(async () => true);
    const actions = createPortfolioMutationActions({ store, enqueueSave: save, markDirty: vi.fn(), alert, confirm, prompt, openDialogFn: vi.fn() });
    const current = () => store.getState().portfolioBoards[0].data;
    return { data, store, actions, current, alert, confirm, prompt, save };
}

describe('independent technical and functional workflows', () => {
    it('preserves the original shared process for functional items when editing an older project', () => {
        const data = createEmptyProjectData('Existing');
        const original = getWorkflow(data);
        const technical = getWorkflow(data);
        technical.states[2].name = 'Technical implementation';
        technical.transitions['to-do'] = ['testing'];
        applyWorkflow(data, technical, {});
        expect(getWorkflow(data, { type: 'story' })).toEqual(original);
        expect(getWorkflow(data, { type: 'epic' })).toEqual(original);
        expect(getWorkflow(data, { type: 'task' })).toEqual(technical);
        expect(getWorkflow(data, { type: 'bug' })).toEqual(technical);
        expect(getWorkflow(data, {})).toEqual(technical);
    });

    it('relocates only the matching items, including archived items, and preserves custom IDs through snapshots and reopening', () => {
        const { data } = setup();
        data.extensions.functionalWorkflow = defaultWorkflow();
        data.board.tasks[0].status = 'doing';
        data.board.tasks[1].status = 'doing';
        data.board.tasks[1].archived = true;
        const columns = structuredClone(data.board.columns);
        expect(() => applyWorkflow(data, functionalWorkflow(), {}, 'functional')).toThrow(/destination/);
        applyWorkflow(data, functionalWorkflow(), { doing: 'analysis' }, 'functional');
        expect(data.board.tasks.map((task) => task.status)).toEqual(['doing', 'analysis', 'backlog', 'backlog']);
        expect(data.board.columns).toEqual(columns);
        for (const reopened of [createBoardStateSnapshot(data), serializeBoardDataFromObject(JSON.parse(JSON.stringify(data)))]) {
            validateBoardData(reopened);
            expect(reopened.board.tasks[1]).toMatchObject({ id: 2, status: 'analysis', archived: true });
            expect(reopened.extensions.functionalWorkflow).toEqual(functionalWorkflow());
        }
        const invalid = structuredClone(data);
        invalid.board.tasks[0].status = 'analysis';
        expect(() => validateBoardData(invalid)).toThrow(/status/);
        const malformed = structuredClone(data);
        malformed.extensions.functionalWorkflow!.references.completed = 'missing';
        expect(() => serializeBoardDataFromObject(malformed)).toThrow(/reference/);
    });

    it('uses each item’s workflow for direct moves, category moves, labels and history', async () => {
        const { actions, current, store } = setup();
        expect(await actions.movePortfolioTaskToStatus('p', 1, 'analysis')).toBe(false);
        expect(await actions.movePortfolioTaskToStatus('p', 2, 'doing')).toBe(false);
        expect(await actions.movePortfolioTaskToCategory('p', 2, 'in-progress')).toBe(true);
        expect(await actions.movePortfolioTaskToStatus('p', 1, 'doing')).toBe(true);
        expect(current().board.tasks.slice(0, 2).map((task) => task.status)).toEqual(['doing', 'analysis']);
        expect(current().extensions.timeline!.events.find((event) => event.entityId === '2')!.meta!.statusLabels).toMatchObject({ analysis: 'Functional analysis' });
        const rows = buildPortfolioTasks(store.getState());
        expect(rows.find((row) => row.taskId === 2)!.columnTitle).toBe('Functional analysis');
        const state = { ...store.getState(), portfolioVisibleRows: rows };
        expect(buildPortfolioBoardView(state, 'functional').columns.map((column) => column.status)).toContain('analysis');
        expect(buildPortfolioBoardView(state, 'functional').buckets.analysis.map((row) => row.taskId)).toEqual([2]);
        expect(buildPortfolioBoardView(state, 'technical').columns.map((column) => column.status)).not.toContain('analysis');
        expect(canTransition(current(), 'to-do', 'analysis', { type: 'story' })).toBe(true);
    });

    it('uses functional categories for acceptance and mixed hierarchy progress even when IDs overlap', async () => {
        const { data, actions, current, prompt } = setup();
        const functional = data.extensions.functionalWorkflow!;
        functional.states.find((state) => state.id === 'testing')!.category = 'completed';
        functional.references['in-progress'] = 'analysis';
        functional.transitions['to-do'].push('testing');
        data.board.tasks[1].parentId = 3;
        expect(await actions.movePortfolioTaskToStatus('p', 2, 'testing')).toBe(true);
        expect(prompt).toHaveBeenCalledOnce();
        expect(current().board.tasks[1].acceptance!.author).toBe('Ana');
        expect(workitemProgress(current(), 3)).toMatchObject({ completed: 1, percent: 100 });
        expect(planningProgress(current().board.tasks, current()).completed).toBe(1);
        expect(statusCategory('testing', current(), { type: 'story' })).toBe('completed');
    });

    it('validates and applies Story automation against functional transitions while observing technical children', () => {
        const { data } = setup();
        data.extensions.workitemAutomation = { version: 1, start: { from: ['to-do'], to: 'analysis' } };
        data.board.tasks[0].parentId = 2;
        expect(() => validateAutomation(data, data.extensions.workitemAutomation)).not.toThrow();
        expect(() => validateAutomation(data, { version: 1, start: { from: ['to-do'], to: 'doing' } })).toThrow();
        const previous = structuredClone(data);
        data.board.tasks[0].status = 'doing';
        expect(applyStoryAutomation(data, previous)).toEqual([{ storyId: 2, taskId: 1, blocked: false }]);
        expect(data.board.tasks[1].status).toBe('analysis');
    });

    it('keeps column visibility separate even for a shared state ID', () => {
        const { data } = setup();
        setBoardColumnVisibility(data, 'to-do', false, 'functional');
        expect(hiddenBoardStates(data, 'technical').has('to-do')).toBe(false);
        expect(hiddenBoardStates(data, 'functional').has('to-do')).toBe(true);
        validateBoardData(serializeBoardDataFromObject(data));
    });

    it('saves both workflow drafts atomically and restores each independently through history', async () => {
        const { actions, current, save } = setup();
        const general = { name: current().board.settings.title, project: structuredClone(current().extensions.project!) };
        const technical = getWorkflow(current()), functional = getWorkflow(current(), 'functional');
        const changes = [
            { kind: 'technical' as const, original: structuredClone(technical), workflow: technical, relocations: {} },
            { kind: 'functional' as const, original: structuredClone(functional), workflow: functional, relocations: {} }
        ];
        technical.states[1].name = 'Technical ready';
        functional.states[1].name = 'Functional ready';
        functional.references.completed = 'missing';
        expect(await actions.saveProjectSettings('p', general, general, changes)).toBe(false);
        expect(save).not.toHaveBeenCalled();
        expect(getWorkflow(current()).states[1].name).toBe('To Do');
        functional.references.completed = 'done';
        expect(await actions.saveProjectSettings('p', general, general, changes)).toBe(true);
        expect(save).toHaveBeenCalledOnce();
        expect(getWorkflow(current()).states[1].name).toBe('Technical ready');
        expect(getWorkflow(current(), 'functional').states[1].name).toBe('Functional ready');
        const original = reconstructBoardStateFromTimeline(current(), 0);
        expect(getWorkflow(original).states[1].name).toBe('To Do');
        expect(getWorkflow(original, 'functional').states[1].name).toBe('To Do');
    });
});
