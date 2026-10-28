import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { createBoardMutationContext } from '../../src/features/portfolio/commands/mutationContext';
import { createAppStore as createStore } from '../../src/features/portfolio/state/store';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';
import { getPortfolioBulkTaskIds } from '../../src/features/portfolio/queries';
import { legacyWorkflow } from '../../src/domain/workflow';

function createBoard() {
  const data = createEmptyProjectData('Project');
  data.extensions.workflow = legacyWorkflow();
  data.board.columns = data.extensions.workflow.states.map((state) => ({ status: state.id, title: state.name }));
  data.board.tasks.push(fromPartial({
    id: 1,
    title: 'Existing task',
    description: '',
    status: 'backlog',
    archived: false,
    checklist: [{ text: 'First step', done: false }],
    assignees: [],
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }));
  return {
    id: 'p1',
    colorSeed: 0,
    handle: {},
    fileName: 'project.board.json',
    title: 'Project',
    data
  };
}

function createActions(overrides = {}) {
  const state = {
    portfolioBoards: [createBoard()],
    portfolioBulkSelectionByBoardId: {},
    portfolioTimelineSelection: { boardId: '', eventIndex: null },
    portfolioTimelineExpandedByBoardId: {},
    portfolioDetailContext: null,
    portfolioEditContext: null,
    portfolioCreateContext: null,
    roadmapEntityContext: null,
    selectedPortfolioBoardId: 'p1',
    selectedPortfolioViewMode: 'board',
    selectedPortfolioCardRef: null,
    hoveredPortfolioCardRef: null,
    suppressPortfolioCardClickUntil: 0,
    undoAction: null,
    undoToast: null,
    projectSaveStateById: new Map()
  };
  const store = createStore(fromAny(state));

  const markDirty = vi.fn();
  const enqueueSave = vi.fn(async () => true);
  const actions = createPortfolioMutationActions({
    store,

    markDirty,
    enqueueSave,
    closeDialogFn: vi.fn(),
    openDialogFn: vi.fn(),
    confirm: vi.fn(() => true),
    alert: vi.fn(),
    ...overrides
  });
  return { actions, store, markDirty, enqueueSave };
}

describe('portfolio mutation actions', () => {
  it('excludes Done sprint destinations for Board selections and revalidates them before saving', async () => {
    const openDialogFn = vi.fn();
    const alert = vi.fn();
    const { actions, store, enqueueSave } = createActions({ openDialogFn, alert });
    const board = createBoard();
    board.data.extensions.roadmap = { version: 1, phases: [], milestones: [], sprints: [
      { id: 'done', title: 'Finished sprint', startDate: '2000-01-01', endDate: '2000-01-14' },
      { id: 'target', title: 'Planned sprint', startDate: '2099-01-01', endDate: '2099-01-14' }
    ] };
    store.setState({ portfolioBoards: [fromAny(board)] });
    actions.togglePortfolioTaskBulkSelection('p1', 1, true);
    actions.openRoadmapEntityModal('sprints', '', { boardId: 'p1', mode: 'assign-sprint-from-selection' });
    expect(openDialogFn.mock.calls.at(-1)![1].sprintOptions.map((option: { value: string }) => option.value)).toEqual(['target']);
    const changed = structuredClone(store.getState().portfolioBoards[0]);
    Object.assign(changed.data.extensions.roadmap!.sprints[1], { startDate: '2000-02-01', endDate: '2000-02-14' });
    store.setState({ portfolioBoards: [changed] });
    const before = structuredClone(changed.data);
    await actions.saveRoadmapEntity({ kind: 'sprints', existingSprintId: 'target' });
    expect(store.getState().portfolioBoards[0].data).toEqual(before);
    expect(enqueueSave).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Done'));
    expect(getPortfolioBulkTaskIds(store.getState(), 'p1')).toEqual([1]);
  });

  it.each(['done sprint', 'deleted sprint', 'completed item', 'planned item', 'deleted item', 'read-only', 'history'])(
    'rejects an invalid table assignment atomically at save time: %s', async (change) => {
      const alert = vi.fn();
      const { actions, store, enqueueSave, markDirty } = createActions({ alert });
      const board = createBoard();
      board.data.board.tasks.push({ ...board.data.board.tasks[0], id: 2, title: 'Second item' });
      board.data.extensions.roadmap = { version: 1, phases: [], milestones: [], sprints: [
        { id: 'target', title: 'Target', startDate: '2099-01-01', endDate: '2099-01-14' }
      ] };
      store.setState({ portfolioBoards: [fromAny(board)] });
      actions.openRoadmapEntityModal('sprints', '', { boardId: 'p1', mode: 'assign-sprint-from-selection', unplannedTaskIds: [1, 2] });
      // Simulate an external reload or session change while the dialog is open.
      const changed = structuredClone(board.data);
      if (change === 'done sprint') Object.assign(changed.extensions.roadmap!.sprints[0], { startDate: '2000-01-01', endDate: '2000-01-14' });
      if (change === 'deleted sprint') changed.extensions.roadmap!.sprints = [];
      if (change === 'completed item') changed.board.tasks[1].status = 'done';
      if (change === 'planned item') changed.board.tasks[1].sprintId = 'another';
      if (change === 'deleted item') changed.board.tasks.pop();
      store.setState({ portfolioBoards: [{ ...store.getState().portfolioBoards[0], data: changed,
        ...(change === 'read-only' ? { handle: null } : {}) }],
        ...(change === 'history' ? { portfolioTimelineSelection: { boardId: 'p1', eventIndex: 0 } } : {}) });
      if (change === 'history') {
        await actions.movePortfolioTaskToStatus('p1', 1, 'doing');
        actions.setPortfolioTimelineSelection('p1', 0);
        enqueueSave.mockClear();
        markDirty.mockClear();
      }
      const before = structuredClone(store.getState().portfolioBoards[0].data);
      await actions.saveRoadmapEntity({ kind: 'sprints', existingSprintId: 'target' });
      expect(store.getState().portfolioBoards[0].data).toEqual(before);
      expect(enqueueSave).not.toHaveBeenCalled();
      expect(markDirty).not.toHaveBeenCalled();
      expect(store.getState().roadmapEntityContext).not.toBeNull();
      expect(alert).toHaveBeenCalled();
    });

  it('adds the table selection to an existing sprint in one save, independently of Board selection', async () => {
    const { actions, store, enqueueSave } = createActions();
    const board = createBoard();
    board.data.board.tasks.push({ ...board.data.board.tasks[0], id: 2, title: 'Second item', status: 'doing' },
      { ...board.data.board.tasks[0], id: 3, title: 'Board selection' });
    board.data.extensions.roadmap = { version: 1, phases: [], milestones: [], sprints: [
      { id: 'target', title: 'Existing sprint', startDate: '2099-01-01', endDate: '2099-01-14' }
    ] };
    store.setState({ portfolioBoards: [fromAny(board)] });
    actions.togglePortfolioTaskBulkSelection('p1', 3, true);
    actions.openRoadmapEntityModal('sprints', '', { boardId: 'p1', mode: 'assign-sprint-from-selection', unplannedTaskIds: [1, 2, 1] });
    await actions.saveRoadmapEntity({ kind: 'sprints', existingSprintId: 'target' });
    const saved = store.getState().portfolioBoards[0].data;
    expect(saved.board.tasks).toMatchObject([
      { id: 1, status: 'backlog', sprintId: 'target' }, { id: 2, status: 'doing', sprintId: 'target' }, { id: 3, title: 'Board selection' }
    ]);
    expect(saved.board.tasks[2].sprintId || '').toBe('');
    expect(saved.extensions.roadmap?.sprints).toHaveLength(1);
    expect(saved.extensions.timeline?.events.findLast((event) => event.kind === 'roadmap.bulk-assigned')?.meta).toMatchObject({ action: 'assign-existing', taskIds: [1, 2] });
    expect(enqueueSave).toHaveBeenCalledTimes(1);
    expect(getPortfolioBulkTaskIds(store.getState(), 'p1')).toEqual([3]);
    expect(store.getState().roadmapEntityContext).toBeNull();
  });

  it('assigns stable sprint creation numbers and dates through normal creation, editing and selection creation', async () => {
    const { actions, store } = createActions();
    actions.openRoadmapEntityModal('sprints', '', { boardId: 'p1' });
    await actions.saveRoadmapEntity({ kind: 'sprints', title: 'First', startDate: '2026-12-01', endDate: '2026-12-14' });
    const first = store.getState().portfolioBoards[0].data.extensions.sprintCatalog;
    expect(first?.entries[0]).toMatchObject({ sprintId: 'first', number: 1, createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    actions.openRoadmapEntityModal('sprints', 'first', { boardId: 'p1' });
    await actions.saveRoadmapEntity({ kind: 'sprints', itemId: 'first', title: 'Renamed', startDate: '2026-01-01', endDate: '2026-01-14' });
    expect(store.getState().portfolioBoards[0].data.extensions.sprintCatalog).toEqual(first);
    actions.togglePortfolioTaskBulkSelection('p1', 1, true);
    actions.openRoadmapEntityModal('sprints', '', { boardId: 'p1', mode: 'create-sprint-from-selection' });
    await actions.saveRoadmapEntity({ kind: 'sprints', title: 'Second', startDate: '2026-02-01', endDate: '2026-02-14' });
    expect(store.getState().portfolioBoards[0].data.extensions.sprintCatalog?.entries).toMatchObject([
      { sprintId: 'first', number: 1 }, { sprintId: 'second', number: 2, createdAt: expect.any(String) }
    ]);
    await actions.deleteRoadmapEntity('sprints', 'second');
    actions.openRoadmapEntityModal('sprints', '', { boardId: 'p1' });
    await actions.saveRoadmapEntity({ kind: 'sprints', title: 'Second', startDate: '2026-03-01', endDate: '2026-03-14' });
    expect(store.getState().portfolioBoards[0].data.extensions.sprintCatalog?.entries.at(-1)).toMatchObject({ sprintId: 'second-2', number: 3 });
    actions.setPortfolioTimelineSelection('p1', 0);
    await actions.restorePortfolioTimelineSelection();
    actions.openRoadmapEntityModal('sprints', '', { boardId: 'p1' });
    await actions.saveRoadmapEntity({ kind: 'sprints', title: 'First', startDate: '2026-04-01', endDate: '2026-04-14' });
    expect(store.getState().portfolioBoards[0].data.extensions.sprintCatalog?.entries.at(-1)).toMatchObject({ sprintId: 'first-2', number: 4 });
  });

  it('starts sprint numbering independently in each loaded project', async () => {
    const { actions, store } = createActions();
    const second = { ...createBoard(), id: 'p2' };
    store.setState({ portfolioBoards: [...store.getState().portfolioBoards, fromAny(second)] });
    for (const boardId of ['p1', 'p1', 'p2']) {
      actions.openRoadmapEntityModal('sprints', '', { boardId });
      await actions.saveRoadmapEntity({ kind: 'sprints', title: 'Delivery', startDate: '2026-10-01', endDate: '2026-10-14' });
    }
    expect(store.getState().portfolioBoards.map(board => board.data.extensions.sprintCatalog?.entries.map(entry => entry.number))).toEqual([[1, 2], [1]]);
  });

  it('rejects planning a stale selection if an item was completed after opening the sprint dialog', async () => {
    const alert = vi.fn();
    const { actions, store } = createActions({ alert });
    actions.openRoadmapEntityModal('sprints', '', { boardId: 'p1', mode: 'create-sprint-from-selection', unplannedTaskIds: [1] });
    await actions.movePortfolioTaskToStatus('p1', 1, 'done');
    await actions.saveRoadmapEntity({ kind: 'sprints', title: 'Stale sprint', startDate: '2026-11-01', endDate: '2026-11-14' });
    expect(store.getState().portfolioBoards[0].data.extensions.roadmap?.sprints || []).toEqual([]);
    expect(store.getState().portfolioBoards[0].data.board.tasks[0]).toMatchObject({ status: 'done' });
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('review your selection'));
  });

  it('updates task state through the timeline mutation seam', async () => {
    const { actions, store, markDirty, enqueueSave } = createActions();
    store.setState({
      portfolioDetailContext: { boardId: 'p1', taskId: 1, readOnly: false }
    });

    await actions.toggleTaskDetailChecklistItem(0, true);

    const board = store.getState().portfolioBoards[0];
    expect(board.data.board.tasks[0].checklist[0].done).toBe(true);
    expect(board.data.extensions.timeline!.events).toHaveLength(2);
    expect(markDirty).toHaveBeenCalledWith('p1');
    expect(enqueueSave).toHaveBeenCalledWith(board);
  });

  it('moves a task through the store-backed mutation action', async () => {
    const { actions, store } = createActions();

    await expect(actions.movePortfolioTaskToStatus('p1', 1, 'doing')).resolves.toBe(true);

    expect(store.getState().portfolioBoards[0].data.board.tasks[0].status).toBe('doing');
  });

  it('replaces the edited board without mutating previous snapshots or other boards', async () => {
    const { actions, store } = createActions();
    const other = { ...createBoard(), id: 'p2', colorSeed: 1 };
    store.setState({ portfolioBoards: [...store.getState().portfolioBoards, fromAny(other)] });
    const before = store.getState();
    const original = structuredClone(before.portfolioBoards[0]);
    await actions.movePortfolioTaskToStatus('p1', 1, 'doing');
    const after = store.getState();
    expect(before.portfolioBoards[0]).toEqual(original);
    expect(after.portfolioBoards[0]).not.toBe(before.portfolioBoards[0]);
    expect(after.portfolioBoards[1]).toBe(before.portfolioBoards[1]);
    expect(after.portfolioVisibleRows.find((row) => row.boardId === 'p1')!.task.status).toBe('doing');
  });

  it('does not mutate history or save when a task move is a no-op', async () => {
    const { actions, store, markDirty, enqueueSave } = createActions();
    const before = store.getState();
    await expect(actions.movePortfolioTaskToStatus('p1', 1, 'backlog')).resolves.toBe(false);
    expect(store.getState()).toBe(before);
    expect(markDirty).not.toHaveBeenCalled();
    expect(enqueueSave).not.toHaveBeenCalled();
  });

  it('reports a failed persistence operation and does not run onCommitted', async () => {
    const { store } = createActions();
    const enqueueSave = vi.fn(async () => false);
    const onCommitted = vi.fn();
    const context = createBoardMutationContext({
      store,
      enqueueSave,
      markDirty: vi.fn(),
      onBoardChanged: vi.fn(),
      alert: vi.fn()
    });

    await expect(context.runPortfolioBoardMutation('p1', (data) => {
      data.board.tasks[0].title = 'Unsaved title';
      return true;
    }, { onCommitted })).resolves.toBe(false);

    expect(onCommitted).not.toHaveBeenCalled();
    expect(store.getState().portfolioBoards[0].data.board.tasks[0].title).toBe('Unsaved title');
    expect(enqueueSave).toHaveBeenCalledTimes(1);
  });

  it('discards a partially changed draft when a mutation fails', async () => {
    const { store } = createActions();
    const alert = vi.fn();
    const enqueueSave = vi.fn();
    const markDirty = vi.fn();
    const context = createBoardMutationContext({ store, alert, enqueueSave, markDirty });
    const before = store.getState();
    const original = structuredClone(before.portfolioBoards[0]);
    await expect(context.runPortfolioBoardMutation('p1', (data) => {
      data.board.tasks[0].title = 'Partial change';
      throw new Error('Validation failed');
    })).resolves.toBe(false);
    expect(store.getState()).toBe(before);
    expect(store.getState().portfolioBoards[0]).toEqual(original);
    expect(enqueueSave).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Portfolio update failed: Validation failed');
  });

  it('opens a structured editor without splitting names or checklist items', () => {
    const openDialogFn = vi.fn();
    const { actions, store } = createActions({ openDialogFn });
    const record = createBoard();
    record.data.board.tasks[0].assignees = ['Doe, Jane'];
    record.data.board.tasks[0].checklist = [{ text: 'First\nSecond', done: true }];
    store.setState({ portfolioBoards: [fromAny(record)] });
    actions.editPortfolioTask('p1', 1);
    const initial = openDialogFn.mock.calls.at(-1)![1].initial;
    expect(initial.assignees).toEqual(['Doe, Jane']);
    expect(initial.checklist).toEqual([{ text: 'First\nSecond', done: true }]);
  });

  it('owns bulk selection state and task creation', async () => {
    const { actions, store } = createActions();
    actions.togglePortfolioTaskBulkSelection('p1', 1, true);
    expect(getPortfolioBulkTaskIds(store.getState(), 'p1')).toEqual([1]);

    store.setState({ portfolioCreateContext: { boardId: 'p1', status: 'backlog' } });
    await actions.saveTask({
      title: 'Created task',
      description: '',
      assignees: [], responsible: '',
      tags: [],
      blocked: false,
      blockerReason: '',
      checklist: [],
      attachments: [],
      rawDueDate: '',
      dueDate: '',
      priority: fromAny(''),
      effort: fromAny(''),
      phaseId: '',
      milestoneId: ''
    });

    expect(store.getState().portfolioBoards[0].data.board.tasks).toHaveLength(2);
    expect(store.getState().portfolioBoards[0].data.board.tasks[1].title).toBe('Created task');
  });
});
