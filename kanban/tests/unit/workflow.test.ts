import { expect, it } from 'vitest';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { applyWorkflow, assertTaskTransition, getWorkflow, isTaskCompleted } from '../../src/domain/workflow';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';

it('preserves legacy statuses and enforces transitions by immutable ID', () => {
    const data = createEmptyProjectData('Workflow');
    data.board.tasks = [normalizeTask({ id: 1, title: 'Task', status: 'doing' })];
    const workflow = getWorkflow(data);
    workflow.states.push({ id: 'wf_review', name: 'Review', color: '#123456', category: 'completed' });
    workflow.transitions = [{ from: 'doing', to: 'wf_review' }];
    applyWorkflow(data, workflow, {});
    expect(() => assertTaskTransition(data, data.board.tasks[0], 'done')).toThrow(/not allowed/);
    expect(() => assertTaskTransition(data, data.board.tasks[0], 'wf_review')).not.toThrow();
    data.board.tasks[0].status = 'wf_review';
    const reopened = serializeBoardDataFromObject(data);
    validateBoardData(reopened);
    expect(reopened.board.tasks[0].status).toBe('wf_review');
    expect(isTaskCompleted(reopened, reopened.board.tasks[0])).toBe(true);
});

it('requires explicit mapping for removed states in use', () => {
    const data = createEmptyProjectData('Workflow');
    data.board.tasks = [normalizeTask({ id: 1, title: 'Task', status: 'doing' })];
    const workflow = getWorkflow(data);
    workflow.states = workflow.states.filter((s) => s.id !== 'doing');
    workflow.transitions = [];
    expect(() => applyWorkflow(data, workflow, {})).toThrow(/Map every/);
    applyWorkflow(data, workflow, { doing: 'to-do' });
    expect(data.board.tasks[0].status).toBe('to-do');
});
