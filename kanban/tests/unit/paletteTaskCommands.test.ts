import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';

function setup({ handle = {} as unknown } = {}) {
  const data = createEmptyProjectData('Project');
  data.board.tasks.push(fromPartial({
    id: 4, title: 'Write spec', description: '', status: 'to-do', archived: false, priority: 'low',
    checklist: [], assignees: ['Ana'], tags: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }));
  const store = createAppStore(fromAny({
    portfolioBoards: [{ id: 'p1', colorSeed: 0, handle, fileName: 'p1.json', title: 'Project', data }],
    portfolioTimelineSelection: { boardId: '', eventIndex: null },
    portfolioTimelineExpandedByBoardId: {},
    portfolioBulkSelectionByBoardId: {},
    portfolioDetailContext: null,
    selectedPortfolioBoardId: '',
    undoAction: null,
    undoToast: null,
    projectSaveStateById: new Map()
  }));
  const alert = vi.fn();
  const actions = createPortfolioMutationActions({
    store, enqueueSave: vi.fn(async () => true), markDirty: vi.fn(), closeDialogFn: vi.fn(), openDialogFn: vi.fn(),
    confirm: vi.fn(async () => true), alert
  });
  const tasks = () => store.getState().portfolioBoards[0].data.board.tasks;
  const task = (id = 4) => tasks().find((entry) => entry.id === id)!;
  const events = () => store.getState().portfolioBoards[0].data.extensions.timeline?.events || [];
  return { store, actions, task, tasks, events, alert };
}

describe('palette task commands', () => {
  it('toggles an assignee on and off, keeping the others, with undo', async () => {
    const { actions, task, store } = setup();
    await expect(actions.togglePortfolioTaskAssignee('p1', 4, 'Marta')).resolves.toBe(true);
    expect(task().assignees).toEqual(['Ana', 'Marta']);
    expect(store.getState().undoToast?.message).toContain('Marta');

    await actions.togglePortfolioTaskAssignee('p1', 4, 'ana');
    expect(task().assignees).toEqual(['Marta']);

    await actions.performUndo();
    expect(task().assignees).toEqual(['Ana', 'Marta']);
  });

  it('sets the priority with undo and ignores no-op changes', async () => {
    const { actions, task, events } = setup();
    await expect(actions.setPortfolioTaskPriority('p1', 4, 'low')).resolves.toBe(false);
    await expect(actions.setPortfolioTaskPriority('p1', 4, 'high')).resolves.toBe(true);
    expect(task().priority).toBe('high');
    expect(events().at(-1)).toMatchObject({ kind: 'task.updated', entityId: '4' });

    await actions.performUndo();
    expect(task().priority).toBe('low');
  });

  it('creates a task from quick-create fields in To Do, with undo removing it', async () => {
    const { actions, tasks, task, events } = setup();
    const id = await actions.createPortfolioTaskFromFields('p1', {
      title: 'Fix login crash', assignees: ['Marta'], priority: 'high', tags: ['auth'], effort: 'S', dueDate: '2026-10-02'
    });
    expect(id).toBe(5);
    expect(task(5)).toMatchObject({
      title: 'Fix login crash', status: 'to-do', assignees: ['Marta'], priority: 'high',
      tags: ['auth'], effort: 'S', dueDate: '2026-10-02', archived: false
    });
    expect(events().at(-1)).toMatchObject({ kind: 'task.created', entityId: '5' });

    await actions.performUndo();
    expect(tasks().map((entry) => entry.id)).toEqual([4]);
    expect(events().at(-1)).toMatchObject({ kind: 'task.deleted', entityId: '5' });
  });

  it('refuses to create or change tasks in a read-only project', async () => {
    const { actions, tasks, task, alert } = setup({ handle: null });
    await expect(actions.createPortfolioTaskFromFields('p1', {
      title: 'Nope', assignees: [], priority: null, tags: [], effort: null, dueDate: ''
    })).resolves.toBeNull();
    await expect(actions.setPortfolioTaskPriority('p1', 4, 'high')).resolves.toBe(false);
    expect(tasks()).toHaveLength(1);
    expect(task().priority).toBe('low');
    expect(alert).toHaveBeenCalled();
  });
});
