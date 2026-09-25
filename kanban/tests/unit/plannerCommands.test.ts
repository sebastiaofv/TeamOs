import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';
import { buildPortfolioPlannerViewModel } from '../../src/features/portfolio/queries';

function createBoard() {
  const data = createEmptyProjectData('Project');
  data.board.tasks.push(fromPartial({
    id: 1, title: 'Plan me', description: '', status: 'to-do', archived: false,
    checklist: [], assignees: [], tags: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }));
  return { id: 'p1', colorSeed: 0, handle: {}, fileName: 'p1.json', title: 'Project', data };
}

function setup() {
  const store = createAppStore(fromAny({
    portfolioBoards: [createBoard()],
    portfolioTimelineSelection: { boardId: '', eventIndex: null },
    portfolioTimelineExpandedByBoardId: {},
    portfolioBulkSelectionByBoardId: {},
    portfolioDetailContext: null,
    selectedPortfolioBoardId: '',
    undoAction: null,
    undoToast: null,
    projectSaveStateById: new Map()
  }));
  const enqueueSave = vi.fn(async () => true);
  const actions = createPortfolioMutationActions({
    store, enqueueSave, markDirty: vi.fn(), closeDialogFn: vi.fn(), openDialogFn: vi.fn(),
    confirm: vi.fn(async () => true), alert: vi.fn()
  });
  const blocks = () => store.getState().portfolioBoards[0].data.extensions.dayPlanner?.blocks || [];
  const task = () => store.getState().portfolioBoards[0].data.board.tasks[0];
  const events = () => store.getState().portfolioBoards[0].data.extensions.timeline?.events || [];
  return { store, actions, enqueueSave, blocks, task, events };
}

describe('planner commands', () => {
  const plannerEvents = (events: () => any[]) => events().filter((event) => event.kind.startsWith('planner.'));

  it('adds a 1-hour block without touching the task, recording a timeline event', async () => {
    const { actions, blocks, task, events, enqueueSave } = setup();
    const before = structuredClone(task());

    await expect(actions.addPlannerBlock('p1', 1, '2026-09-25', 600)).resolves.toBe(true);

    const block = blocks()[0];
    expect(block).toMatchObject({ taskId: 1, date: '2026-09-25', start: '10:00', end: '11:00' });
    expect(task()).toEqual(before);
    expect(plannerEvents(events)).toEqual([expect.objectContaining({
      kind: 'planner.block.added',
      entityType: 'task',
      entityId: '1',
      summary: expect.stringContaining('Plan me'),
      changes: { block: { before: null, after: block } }
    })]);
    expect(plannerEvents(events)[0]).not.toHaveProperty('snapshot');
    expect(enqueueSave).toHaveBeenCalledTimes(1);
  });

  it('records moves, resizes and removals as separate events, and undo as the inverse action', async () => {
    const { actions, blocks, events } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 540);
    const id = blocks()[0].id;
    await actions.updatePlannerBlock('p1', id, { date: '2026-09-25', start: '09:15', end: '10:15' });
    await actions.updatePlannerBlock('p1', id, { date: '2026-09-25', start: '09:15', end: '10:30' });
    await actions.removePlannerBlock('p1', id);
    await actions.performUndo();

    expect(plannerEvents(events).map((event) => event.kind)).toEqual([
      'planner.block.added',
      'planner.block.moved',
      'planner.block.resized',
      'planner.block.removed',
      'planner.block.added'
    ]);
    expect(plannerEvents(events)[2].changes.block).toEqual({
      before: expect.objectContaining({ start: '09:15', end: '10:15' }),
      after: expect.objectContaining({ start: '09:15', end: '10:30' })
    });
  });

  it('clamps a late drop so the block ends at 21:00', async () => {
    const { actions, blocks } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 1250);
    expect(blocks()[0]).toMatchObject({ start: '20:00', end: '21:00' });
  });

  it('refuses unknown tasks and invalid dates', async () => {
    const { actions, blocks } = setup();
    await expect(actions.addPlannerBlock('p1', 42, '2026-09-25', 600)).resolves.toBe(false);
    await expect(actions.addPlannerBlock('p1', 1, 'soon', 600)).resolves.toBe(false);
    expect(blocks()).toEqual([]);
  });

  it('allows the same task in several blocks', async () => {
    const { actions, blocks } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 540);
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 840);
    expect(blocks()).toHaveLength(2);
  });

  it('updates a block and undoes back to the previous times', async () => {
    const { actions, blocks, store } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 540);
    const id = blocks()[0].id;

    await expect(actions.updatePlannerBlock('p1', id, { date: '2026-09-24', start: '13:00', end: '14:45' })).resolves.toBe(true);
    expect(blocks()[0]).toMatchObject({ date: '2026-09-24', start: '13:00', end: '14:45' });
    expect(store.getState().undoToast?.message).toBeTruthy();

    await actions.performUndo();
    expect(blocks()[0]).toMatchObject({ date: '2026-09-25', start: '09:00', end: '10:00' });
  });

  it('rejects invalid or unchanged updates', async () => {
    const { actions, blocks, enqueueSave } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 540);
    const id = blocks()[0].id;
    enqueueSave.mockClear();

    await expect(actions.updatePlannerBlock('p1', id, { date: '2026-09-25', start: '10:00', end: '09:00' })).resolves.toBe(false);
    await expect(actions.updatePlannerBlock('p1', id, { date: '2026-09-25', start: '09:00', end: '10:00' })).resolves.toBe(false);
    await expect(actions.updatePlannerBlock('p1', 'missing', { date: '2026-09-25', start: '09:00', end: '10:00' })).resolves.toBe(false);
    expect(enqueueSave).not.toHaveBeenCalled();
  });

  it('removes a block, drops the empty extension, and undo restores it', async () => {
    const { actions, blocks, store } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 540);
    const original = blocks()[0];

    await expect(actions.removePlannerBlock('p1', original.id)).resolves.toBe(true);
    expect(store.getState().portfolioBoards[0].data.extensions).not.toHaveProperty('dayPlanner');

    await actions.performUndo();
    expect(blocks()).toEqual([original]);
  });

  it('shows the planner as it was at a previewed timeline event', async () => {
    const { actions, blocks, events, store } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 540);
    await actions.updatePlannerBlock('p1', blocks()[0].id, { date: '2026-09-25', start: '13:00', end: '14:00' });
    const addedIndex = events().findIndex((event) => event.kind === 'planner.block.added');
    const view = () => buildPortfolioPlannerViewModel(store.getState(), { today: '2026-09-25', trayStatuses: ['to-do'] });

    expect(view().days[0].blocks.map((block) => block.start)).toEqual(['13:00']);
    store.setState({ selectedPortfolioBoardId: 'p1', portfolioTimelineSelection: { boardId: 'p1', eventIndex: addedIndex } });
    expect(view().days[0].blocks.map((block) => [block.start, block.canEdit])).toEqual([['09:00', false]]);
    store.setState({ portfolioTimelineSelection: { boardId: 'p1', eventIndex: addedIndex - 1 } });
    expect(view().days[0].blocks).toEqual([]);
  });

  it('undoing an add removes the block', async () => {
    const { actions, blocks } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 540);
    await actions.performUndo();
    expect(blocks()).toEqual([]);
  });
});
