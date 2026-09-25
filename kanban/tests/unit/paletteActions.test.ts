import { describe, expect, it, vi } from 'vitest';
import { runPaletteAction } from '../../src/features/portfolio/palette/paletteActions';
import { loadRecentPaletteItems, rememberPaletteItem } from '../../src/features/portfolio/palette/recentItems';

// Loosely typed so tests can read each fake's `.mock` calls.
function deps(): any {
  const d: any = {
    openTask: vi.fn(), editTask: vi.fn(), toggleArchive: vi.fn(), selectCard: vi.fn(),
    moveTask: vi.fn(async () => true), toggleAssignee: vi.fn(async () => true), setPriority: vi.fn(async () => true),
    planTask: vi.fn(async () => true), createTask: vi.fn(async () => 21),
    setBoardSearch: vi.fn(), setViewMode: vi.fn(), selectBoard: vi.fn(), resetFilters: vi.fn(), openFilters: vi.fn(),
    toggleTheme: vi.fn(), toggleLanguage: vi.fn(), openShortcuts: vi.fn(), openHelp: vi.fn(),
    newProject: vi.fn(), importProjects: vi.fn(),
    taskInfo: vi.fn(() => ({ title: 'Write spec', status: 'to-do' })),
    showUndo: vi.fn((_message: string, fn: () => unknown) => { d.undo = fn; }),
    t: (key: string, values: Record<string, unknown> = {}) => `${key}${JSON.stringify(values)}`
  };
  return d;
}

describe('runPaletteAction', () => {
  it('filters the board and runs view commands', async () => {
    const d = deps();
    await runPaletteAction({ type: 'filterBoard', text: 'login' }, d);
    await runPaletteAction({ type: 'command', id: 'view-planner' }, d);
    await runPaletteAction({ type: 'command', id: 'clear-board-filter' }, d);
    await runPaletteAction({ type: 'openRoadmap', boardId: 'web' }, d);
    expect(d.setBoardSearch.mock.calls).toEqual([['login'], ['']]);
    expect(d.setViewMode.mock.calls).toEqual([['planner'], ['roadmap']]);
    expect(d.selectBoard).toHaveBeenCalledWith('web');
  });

  it('moves a task with an undo that moves it back', async () => {
    const d = deps();
    await runPaletteAction({ type: 'moveTask', boardId: 'app', taskId: 7, status: 'done' }, d);
    expect(d.moveTask).toHaveBeenCalledWith('app', 7, 'done');
    expect(d.showUndo).toHaveBeenCalledWith(expect.stringContaining('palette.moved'), expect.any(Function));
    await d.undo();
    expect(d.moveTask).toHaveBeenLastCalledWith('app', 7, 'to-do');
  });

  it('does not offer undo when a move did nothing', async () => {
    const d = deps();
    d.moveTask = vi.fn(async () => false);
    await runPaletteAction({ type: 'moveTask', boardId: 'app', taskId: 7, status: 'done' }, d);
    expect(d.showUndo).not.toHaveBeenCalled();
  });

  it('creates a task and selects it', async () => {
    const d = deps();
    const fields = { title: 'New', assignees: [], priority: null, tags: [], effort: null, dueDate: '' };
    await runPaletteAction({ type: 'createTask', boardId: 'app', fields }, d);
    expect(d.createTask).toHaveBeenCalledWith('app', fields);
    expect(d.selectCard).toHaveBeenCalledWith('app', 21);
  });

  it('passes task edits and planning through', async () => {
    const d = deps();
    await runPaletteAction({ type: 'toggleAssignee', boardId: 'app', taskId: 7, name: 'Ana' }, d);
    await runPaletteAction({ type: 'setPriority', boardId: 'app', taskId: 7, priority: null }, d);
    await runPaletteAction({ type: 'planTask', boardId: 'app', taskId: 7, date: '2026-09-26', startMinutes: 840 }, d);
    expect(d.toggleAssignee).toHaveBeenCalledWith('app', 7, 'Ana');
    expect(d.setPriority).toHaveBeenCalledWith('app', 7, null);
    expect(d.planTask).toHaveBeenCalledWith('app', 7, '2026-09-26', 840);
  });
});

describe('recent palette items', () => {
  it('keeps the eight most recent unique keys, newest first', () => {
    const storage = new Map<string, string>();
    const store = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
    for (let i = 0; i < 10; i += 1) rememberPaletteItem(`task:web:${i}`, store);
    rememberPaletteItem('task:web:3', store);
    expect(loadRecentPaletteItems(store)).toEqual(['task:web:3', 'task:web:9', 'task:web:8', 'task:web:7', 'task:web:6', 'task:web:5', 'task:web:4', 'task:web:2']);
  });

  it('survives unavailable or corrupt storage', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadRecentPaletteItems(broken)).toEqual([]);
    expect(() => rememberPaletteItem('cmd:view-board', broken)).not.toThrow();
    expect(loadRecentPaletteItems({ getItem: () => '{not json', setItem: () => {} })).toEqual([]);
  });
});
