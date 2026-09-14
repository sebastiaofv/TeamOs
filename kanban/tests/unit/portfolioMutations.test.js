import { describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board.js';
import { createPortfolioMutationActions } from '../../src/actions/portfolioMutations.js';
import { getPortfolioBulkTaskIds } from '../../src/selectors/portfolioViews.js';

function createStore(initial) {
  let state = initial;
  return {
    getState: () => state,
    setState: (partial) => {
      const next = typeof partial === 'function' ? partial(state) : partial;
      state = { ...state, ...next };
    }
  };
}

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
    portfolioTimelineDragState: { active: false, boardId: '' },
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
  const notify = vi.fn();
  const markDirty = vi.fn();
  const enqueueSave = vi.fn(async () => true);
  const actions = createPortfolioMutationActions({
    store,
    notify,
    markDirty,
    enqueueSave,
    getSaveState: vi.fn(() => null),
    closeDialogFn: vi.fn(),
    confirm: vi.fn(() => true),
    alert: vi.fn(),
    ...overrides
  });
  return { actions, store, notify, markDirty, enqueueSave };
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
