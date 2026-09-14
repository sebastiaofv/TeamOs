import { createBoardMutationContext } from '../../src/actions/boardMutationContext.js';
import { createAppStore as createStore } from '../../src/state/store.js';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board.js';
import { createPortfolioMutationActions } from '../../src/actions/portfolioMutations.js';
import { getPortfolioBulkTaskIds } from '../../src/selectors/portfolioViews.js';

function createBoard() {
  const data = createEmptyProjectData('Project');
  data.board.tasks.push({
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
  });
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
    portfolioDragContext: null,
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
  const store = createStore(state);

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
  it('updates task state through the timeline mutation seam', async () => {
    const { actions, store, markDirty, enqueueSave } = createActions();
    store.setState({
      portfolioDetailContext: { boardId: 'p1', taskId: 1, readOnly: false }
    });

    await actions.toggleTaskDetailChecklistItem(0, true);

    const board = store.getState().portfolioBoards[0];
    expect(board.data.board.tasks[0].checklist[0].done).toBe(true);
    expect(board.data.extensions.timeline.events).toHaveLength(2);
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
    store.setState({ portfolioBoards: [...store.getState().portfolioBoards, other] });
    const before = store.getState();
    const original = structuredClone(before.portfolioBoards[0]);
    await actions.movePortfolioTaskToStatus('p1', 1, 'doing');
    const after = store.getState();
    expect(before.portfolioBoards[0]).toEqual(original);
    expect(after.portfolioBoards[0]).not.toBe(before.portfolioBoards[0]);
    expect(after.portfolioBoards[1]).toBe(before.portfolioBoards[1]);
    expect(after.portfolioVisibleRows.find((row) => row.boardId === 'p1').task.status).toBe('doing');
  });

  it('does not mutate history or save when a task move is a no-op', async () => {
    const { actions, store, markDirty, enqueueSave } = createActions();
    const before = store.getState();
    await expect(actions.movePortfolioTaskToStatus('p1', 1, 'backlog')).resolves.toBe(false);
    expect(store.getState()).toBe(before);
    expect(markDirty).not.toHaveBeenCalled();
    expect(enqueueSave).not.toHaveBeenCalled();
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
    store.setState({ portfolioBoards: [record] });
    actions.editPortfolioTask('p1', 1);
    const initial = openDialogFn.mock.calls.at(-1)[1].initial;
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
      assignees: [],
      tags: [],
      blocked: false,
      blockerReason: '',
      checklist: [],
      attachments: [],
      rawDueDate: '',
      dueDate: '',
      priority: '',
      effort: '',
      phaseId: '',
      milestoneId: ''
    });

    expect(store.getState().portfolioBoards[0].data.board.tasks).toHaveLength(2);
    expect(store.getState().portfolioBoards[0].data.board.tasks[1].title).toBe('Created task');
  });
});
