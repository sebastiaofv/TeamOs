import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '@/domain/board';
import { applyWorkflowTypes, defaultWorkflow, functionalWorkitemTypes, getWorkflow, parseWorkflowTypes, workflowKind } from '@/domain/workflow';
import { normalizeTask } from '@/domain/task';
import { serializeBoardDataFromObject } from '@/domain/serialize';
import { closeSprint } from '@/domain/sprintResults';
import { consultSprintParticipation, taskInFunctionalBoard, taskInTechnicalBoard } from '@/domain/workitems';
import { createAppStore } from '@/features/portfolio/state/store';
import { createPortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';

// A functional workflow without the technical "doing" state.
function functionalWorkflow() {
    const workflow = defaultWorkflow();
    const doing = workflow.states.find((state) => state.id === 'doing')!;
    Object.assign(doing, { id: 'analysis', name: 'Functional analysis' });
    workflow.references['in-progress'] = 'analysis';
    workflow.transitions.analysis = workflow.transitions.doing;
    delete workflow.transitions.doing;
    for (const id of Object.keys(workflow.transitions)) workflow.transitions[id] = workflow.transitions[id].map((target) => target === 'doing' ? 'analysis' : target);
    return workflow;
}

function olderProject() {
    const data = createEmptyProjectData('Older project');
    delete data.extensions.workflowTypes;
    data.extensions.functionalWorkflow = functionalWorkflow();
    data.board.tasks = [
        normalizeTask({ id: 1, title: 'Task', status: 'doing', type: 'task' }),
        normalizeTask({ id: 2, title: 'Story', status: 'analysis', type: 'story' }),
        normalizeTask({ id: 3, title: 'Bug in progress', status: 'doing', type: 'bug' }),
        normalizeTask({ id: 4, title: 'Bug ready', status: 'to-do', type: 'bug' })
    ];
    return data;
}

describe('workitem types per workflow (US-22)', () => {
    it('defaults Bugs to the functional workflow for new projects', () => {
        const data = createEmptyProjectData('New');
        expect(data.extensions.workflowTypes).toEqual({ version: 1, functional: ['epic', 'story', 'bug'] });
        expect(workflowKind({ type: 'bug' }, data)).toBe('functional');
        expect(workflowKind({ type: 'task' }, data)).toBe('technical');
    });

    it('migrates older projects: Bugs join the functional workflow, keeping or mapping their status by category', () => {
        const saved = serializeBoardDataFromObject(olderProject());
        validateBoardData(saved);
        expect(saved.extensions.workflowTypes).toEqual({ version: 1, functional: ['epic', 'story', 'bug'] });
        expect(saved.board.tasks.map((task) => task.status)).toEqual(['doing', 'analysis', 'analysis', 'to-do']);
    });

    it('validates the association', () => {
        expect(() => parseWorkflowTypes({ version: 1, functional: ['story', 'story'] })).toThrow();
        expect(() => parseWorkflowTypes({ version: 2, functional: [] })).toThrow();
        expect(() => parseWorkflowTypes({ version: 1, functional: ['feature'] })).toThrow();
        expect(parseWorkflowTypes({ version: 1, functional: ['bug', 'epic'] })).toEqual({ version: 1, functional: ['epic', 'bug'] });
    });

    it('moves workitems that change workflow to the state with the same category', () => {
        const data = serializeBoardDataFromObject(olderProject());
        const moved = applyWorkflowTypes(data, ['epic', 'story', 'task']);
        expect(functionalWorkitemTypes(data)).toEqual(['epic', 'story', 'task']);
        // The Task in "doing" maps to the functional In progress reference; Bug "analysis" maps back to "doing".
        expect(data.board.tasks.map((task) => task.status)).toEqual(['analysis', 'analysis', 'doing', 'to-do']);
        expect(moved).toEqual([1, 3]);
        validateBoardData(data);
    });

    it('shows each type on the Board of its workflow', () => {
        const data = serializeBoardDataFromObject(olderProject());
        const [task, story, bug] = data.board.tasks;
        expect([taskInTechnicalBoard(data, task), taskInFunctionalBoard(data, task)]).toEqual([true, false]);
        expect([taskInTechnicalBoard(data, story), taskInFunctionalBoard(data, story)]).toEqual([false, true]);
        expect([taskInTechnicalBoard(data, bug), taskInFunctionalBoard(data, bug)]).toEqual([false, true]);
    });

    it('freezes the association with each Sprint closure; older closures keep the previous association', () => {
        const data = serializeBoardDataFromObject(olderProject());
        data.extensions.roadmap = { version: 5, phases: [], milestones: [], sprints: [{ id: 's1', title: 'Sprint', startDate: '2026-11-02', endDate: '2026-11-13', status: 'active' }] };
        data.board.tasks.forEach((task) => { task.sprintId = 's1'; });
        closeSprint(data, 's1');
        const closure = data.extensions.sprintResults!.closures[0];
        expect(closure.workflowTypes).toEqual({ version: 1, functional: ['epic', 'story', 'bug'] });
        delete closure.workflowTypes;
        const consulted = consultSprintParticipation(data, 's1');
        expect(workflowKind({ type: 'bug' }, consulted.boardData)).toBe('technical');
        expect(getWorkflow(consulted.boardData, { type: 'story' }).states.some((state) => state.id === 'analysis')).toBe(true);
    });

    it('saves the association from project settings and records it in history', async () => {
        const data = serializeBoardDataFromObject(olderProject());
        const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Older project', handle: {}, data })], selectedPortfolioBoardId: 'p' });
        const confirm = vi.fn(async () => true);
        const actions = createPortfolioMutationActions({ store, enqueueSave: vi.fn(async () => true), markDirty: vi.fn(), alert: vi.fn(), confirm, prompt: vi.fn(), openDialogFn: vi.fn(), closeDialogFn: vi.fn() });
        const general = { name: data.board.settings.title, project: data.extensions.project! };
        await actions.saveProjectSettings('p', structuredClone(general), structuredClone(general), undefined, { original: ['epic', 'story', 'bug'], functional: ['epic', 'story'] });
        const saved = store.getState().portfolioBoards[0].data;
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(saved.extensions.workflowTypes).toEqual({ version: 1, functional: ['epic', 'story'] });
        expect(saved.board.tasks.find((task) => task.id === 3)!.status).toBe('doing');
        expect(saved.extensions.timeline!.events.at(-1)!.summary).toBe('Workflow types updated');
    });
});
