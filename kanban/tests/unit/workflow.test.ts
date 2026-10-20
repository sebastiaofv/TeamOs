import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { applyWorkflow, canTransition, defaultWorkflow, legacyWorkflow, parseWorkflow, statusCategory, workflowErrors } from '../../src/domain/workflow';
import { normalizeTask, isTaskOverdue } from '../../src/domain/task';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';
import { reconstructBoardStateFromTimeline } from '../../src/domain/timeline';

describe('project workflows', () => {
    it('round-trips workflows beyond the legacy column cap and preserves arbitrary stable IDs', () => {
        const data = createEmptyProjectData('Many states');
        const workflow = defaultWorkflow();
        for (let index = 0; index < 101; index++) {
            const id = `extra-${index}`;
            workflow.states.push({ id, name: `Extra ${index}`, color: '#123456', category: 'to-do' });
            workflow.transitions.backlog.push(id);
        }
        workflow.states.find((state) => state.id === 'doing')!.id = 'in-progress';
        workflow.references['in-progress'] = 'in-progress';
        workflow.transitions['in-progress'] = workflow.transitions.doing; delete workflow.transitions.doing;
        Object.keys(workflow.transitions).forEach((id) => { workflow.transitions[id] = workflow.transitions[id].map((target) => target === 'doing' ? 'in-progress' : target); });
        applyWorkflow(data, workflow, {});
        data.board.tasks = [normalizeTask({ id: 1, title: 'Custom ID', status: 'in-progress' }, { workflow })];
        const reopened = serializeBoardDataFromObject(data); validateBoardData(reopened);
        expect(reopened.board.columns).toHaveLength(110);
        expect(reopened.board.tasks[0].status).toBe('in-progress');
    });
    it('validates references, names, reserved Backlog and reachability', () => {
        expect(workflowErrors(defaultWorkflow())).toEqual([]);
        const w = defaultWorkflow();
        w.states[0].category = 'completed';
        w.states[1].name = w.states[2].name;
        w.transitions.backlog = [];
        expect(workflowErrors(w).join(' ')).toMatch(/Backlog/);
        expect(workflowErrors(w).join(' ')).toMatch(/unique/);
        expect(workflowErrors(w).join(' ')).toMatch(/reachable/);
    });
    it('has directional transitions and cancellation is not completion or overdue', () => {
        const data = createEmptyProjectData('Test');
        const w = legacyWorkflow();
        w.transitions['to-do'] = ['done'];
        applyWorkflow(data, w, {});
        expect(canTransition(data, 'to-do', 'backlog')).toBe(false);
        expect(canTransition(data, 'backlog', 'to-do')).toBe(true);
        w.states.push({ id: 'cancel', name: 'Abandoned', color: '#ff0000', category: 'cancelled' });
        w.transitions.backlog.push('cancel'); w.references.cancelled = 'cancel';
        applyWorkflow(data, w, {});
        expect(statusCategory('cancel', data)).toBe('cancelled');
        expect(isTaskOverdue(normalizeTask({ id: 1, title: 'Old', status: 'cancel', dueDate: '2000-01-01' }), data)).toBe(false);
    });
    it('requires an explicit relocation, including archived workitems, and round-trips a custom state', () => {
        const data = createEmptyProjectData('Test');
        data.board.tasks = [normalizeTask({ id: 1, title: 'Archived', status: 'doing', archived: true })];
        const w = legacyWorkflow();
        w.states = w.states.filter((s) => s.id !== 'doing');
        delete w.transitions.doing; delete w.references['in-progress'];
        Object.keys(w.transitions).forEach((id) => { w.transitions[id] = w.transitions[id].filter((s) => s !== 'doing'); });
        expect(() => applyWorkflow(data, w, {})).toThrow(/destination/);
        applyWorkflow(data, w, { doing: 'to-do' });
        expect(data.board.tasks[0]).toMatchObject({ id: 1, status: 'to-do', archived: true });
        const reopened = serializeBoardDataFromObject(JSON.parse(JSON.stringify(data)));
        validateBoardData(reopened); expect(reopened.extensions.workflow).toEqual(w);
    });
    it('enforces transitions in commands and keeps historical names and replay', async () => {
        const data = createEmptyProjectData('Test');
        data.board.tasks = [normalizeTask({ id: 1, title: 'Blocked', status: 'doing', blocked: true, blockerReason: 'Informative only' })];
        const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Test', handle: {}, data })] });
        const actions = createPortfolioMutationActions({ store, enqueueSave: async () => true, markDirty: vi.fn(), alert: vi.fn(), openDialogFn: vi.fn() });
        expect(await actions.movePortfolioTaskToStatus('p', 1, 'done')).toBe(true);
        const saved = store.getState().portfolioBoards[0].data;
        expect(saved.extensions.timeline?.events.at(-1)?.meta?.statusLabels).toMatchObject({ doing: 'In progress', done: 'Done' });
        expect(reconstructBoardStateFromTimeline(saved, 1).board.tasks[0].status).toBe('done');
        saved.extensions.workflow!.transitions.done = [];
        expect(await actions.movePortfolioTaskToStatus('p', 1, 'to-do')).toBe(false);
    });
    it('validates the manual test board and preserves its identities', () => {
        const input = JSON.parse(readFileSync('test-board/us-4.board.json', 'utf8'));
        validateBoardData(input);
        const output = serializeBoardDataFromObject(input); validateBoardData(output);
        expect(output.board.tasks.map((t) => [t.id, t.status])).toEqual(input.board.tasks.map((t: { id: number; status: string }) => [t.id, t.status]));
    });
    it('starts new projects with five categories, nine states, reanalysis cycles and terminal Done/Cancelled states', () => {
        const data = createEmptyProjectData('New process');
        const workflow = data.extensions.workflow!;
        expect(new Set(workflow.states.map((state) => state.category))).toEqual(new Set(['backlog', 'to-do', 'in-progress', 'completed', 'cancelled']));
        expect(workflow.states).toHaveLength(9);
        expect(workflow.states.filter((state) => state.category === 'cancelled').map((state) => state.name)).toEqual(['Cancelled', 'Duplication']);
        for (const [from, to] of [['backlog', 'to-do'], ['to-do', 'doing'], ['doing', 'ready-to-test'], ['ready-to-test', 'testing'], ['testing', 'done'], ['testing', 're-analysis'], ['re-analysis', 'doing'], ['doing', 'done']]) expect(canTransition(data, from, to)).toBe(true);
        for (const state of workflow.states) {
            if (['completed', 'cancelled'].includes(state.category)) expect(workflow.transitions[state.id]).toEqual([]);
            else for (const cancelled of ['cancelled', 'duplication']) expect(canTransition(data, state.id, cancelled)).toBe(true);
        }
        expect(canTransition(data, 'backlog', 'done')).toBe(false);
        expect(canTransition(data, 'to-do', 'done')).toBe(false);
    });
    it('migrates the v1 Not started category without replacing labels, IDs or configured transitions', () => {
        const legacy = legacyWorkflow();
        const old = { ...legacy, version: 1, states: legacy.states.map((state) => ({ ...state, name: `Named ${state.id}`, category: ['backlog', 'to-do'].includes(state.category) ? 'not-started' : state.category })), references: { 'not-started': 'to-do', 'in-progress': 'doing', completed: 'done' } };
        const next = parseWorkflow(old);
        expect(next.version).toBe(2); expect(next.states).toHaveLength(4);
        expect(next.transitions).toEqual(old.transitions);
        expect(next.states.map((state) => [state.id, state.name])).toEqual(old.states.map((state) => [state.id, state.name]));
        expect(next.states[0].category).toBe('backlog'); expect(next.states[1].category).toBe('to-do');
        expect(next.references['to-do']).toBe('to-do');
    });
    it('resolves zero, one and multiple category destinations in the same command for every Board', async () => {
        const data = createEmptyProjectData('Category destinations');
        data.board.tasks = [normalizeTask({ id: 1, title: 'Intake', status: 'backlog' })];
        const state = data.extensions.workflow!;
        state.states.push({ id: 'triage', name: 'Triage', color: '#123456', category: 'to-do' });
        state.transitions.backlog.push('triage');
        data.board.columns = state.states.map((item) => ({ status: item.id, title: item.name }));
        const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Category destinations', handle: {}, data })] });
        const choices: string[] = []; const alert = vi.fn();
        const actions = createPortfolioMutationActions({ store, enqueueSave: async () => true, markDirty: vi.fn(), openDialogFn: vi.fn(), alert,
            choose: async (_text, options) => { choices.push(...options.map((option) => option.label)); return options.at(-1)?.value ?? null; } });
        expect(await actions.movePortfolioTaskToCategory('p', 1, 'completed')).toBe(false); expect(alert).toHaveBeenCalledTimes(1);
        expect(await actions.movePortfolioTaskToCategory('p', 1, 'to-do')).toBe(true); expect(choices).toEqual(['To Do', 'Triage']);
        expect(store.getState().portfolioBoards[0].data.board.tasks[0].status).toBe('triage');
        expect(await actions.movePortfolioTaskToCategory('p', 1, 'to-do')).toBe(false);
    });
});
