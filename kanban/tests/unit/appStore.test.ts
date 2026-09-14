import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { ensureBoardTimelineBaseline } from '../../src/domain/timeline';
import { describe, it, expect, vi } from 'vitest';
import { createAppStore } from '../../src/state/store';
import { createEmptyProjectData } from '../../src/domain/board';

function board(id: string, title: string) {
  const data = createEmptyProjectData(title);
  data.board.tasks.push(fromPartial({ id: 1, title, status: 'backlog', assignees: [], checklist: [] }));
  return { id, title, fileName: `${id}.board.json`, handle: {}, data };
}

describe('atomic portfolio state', () => {
  it('publishes boards and derived rows in one notification without mutating the input', () => {
    const store = createAppStore();
    const input = board('p1', 'First task');
    const before = structuredClone(input);
    const listener = vi.fn((state) => {
      expect(state.portfolioVisibleRows[0].task.title).toBe('First task');
      expect(state.portfolioBoards[0].projectColor).toBeTruthy();
    });
    store.subscribe(listener);
    store.setState({ portfolioBoards: [fromAny(input)] });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(input).toEqual(before);
  });

  it('keeps board and projection identities stable for unrelated UI and save updates', () => {
    const store = createAppStore({ portfolioBoards: [fromAny(board('p1', 'First task'))] });
    const before = store.getState();
    store.setState({ hoveredPortfolioCardRef: { boardId: 'p1', taskId: 1 } });
    store.setState({ projectSaveStateById: fromAny(new Map([['p1', { status: 'saving' }]])) });
    expect(store.getState().portfolioBoards).toBe(before.portfolioBoards);
    expect(store.getState().portfolioVisibleRows).toBe(before.portfolioVisibleRows);
    expect(store.getState().portfolioTasks).toBe(before.portfolioTasks);
  });

  it('derives filters immediately and leaves previous snapshots untouched', () => {
    const store = createAppStore({ portfolioBoards: [fromAny(board('p1', 'First')), fromAny(board('p2', 'Second'))] });
    const before = store.getState();
    store.setState({ portfolioFilters: { ...before.portfolioFilters, search: 'Second' } });
    expect(store.getState().portfolioVisibleRows.map((row) => row.task.title)).toEqual(['Second']);
    expect(before.portfolioVisibleRows).toHaveLength(2);
    expect(before.portfolioFilters.search).toBe('');
  });

  it('reuses projections whose inputs did not change', () => {
    const record = board('p1', 'First task');
    ensureBoardTimelineBaseline(record.data);
    const store = createAppStore({ portfolioBoards: [fromAny(record)], selectedPortfolioBoardId: 'p1' });
    const before = store.getState();
    expect(before.portfolioTimelineView).not.toBeNull();
    store.setState({ portfolioFilters: { ...before.portfolioFilters, search: 'First' } });
    const filtered = store.getState();
    expect(filtered.portfolioTasks).toBe(before.portfolioTasks);
    expect(filtered.portfolioTimelineView).toBe(before.portfolioTimelineView);
    store.setState({ portfolioTimelineExpandedByBoardId: { p1: true } });
    expect(store.getState().portfolioVisibleRows).toBe(filtered.portfolioVisibleRows);
    expect(store.getState().portfolioFilters).toBe(filtered.portfolioFilters);
    expect(store.getState().portfolioTimelineView!.isExpanded).toBe(true);
  });

  it('clears invalid selection and view when a board is removed', () => {
    const store = createAppStore({ portfolioBoards: [fromAny(board('p1', 'First'))], selectedPortfolioBoardId: 'p1', selectedPortfolioViewMode: 'roadmap' });
    store.setState({ portfolioBoards: [] });
    expect(store.getState().selectedPortfolioBoardId).toBe('');
    expect(store.getState().selectedPortfolioViewMode).toBe('board');
    expect(store.getState().portfolioVisibleRows).toEqual([]);
  });
});
