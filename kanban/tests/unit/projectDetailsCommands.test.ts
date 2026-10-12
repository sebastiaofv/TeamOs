import { fromPartial } from '@total-typescript/shoehorn';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { getProjectBaseData, setProjectBaseData, type ProjectBaseData } from '../../src/domain/projectDetails';
import { cloneSerializable } from '../../src/domain/serialize';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';
import { createAppStore, useAppStore } from '../../src/features/portfolio/state/store';
import type { BoardRecord } from '../../src/features/portfolio/types';
import { closePortfolioContextsForProject } from '../../src/app/overlays/dialogs';

function createBoard(id = 'p1'): BoardRecord {
  const data = createEmptyProjectData('Project');
  data.board.tasks.push(fromPartial({
    id: 1, title: 'Existing task', status: 'backlog', assignees: ['Ana', 'Doe, Jane'],
    checklist: [], attachments: [], tags: [], description: '', archived: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }));
  return { id, colorSeed: 0, handle: fromPartial({}), fileName: `${id}.json`, title: 'Project', data };
}

function setup() {
  const store = createAppStore({ portfolioBoards: [createBoard(), createBoard('p2')], selectedPortfolioBoardId: 'p1' });
  const markDirty = vi.fn();
  const enqueueSave = vi.fn(async () => true);
  const closeDialogFn = vi.fn();
  const openDialogFn = vi.fn();
  const preflightSave = vi.fn(async () => true);
  const actions = createPortfolioMutationActions({ store, markDirty, enqueueSave, closeDialogFn, openDialogFn, preflightSave, alert: vi.fn() });
  const record = () => store.getState().portfolioBoards[0];
  const events = () => record().data.extensions.timeline?.events || [];
  const open = () => actions.openProjectDetails('p1')!;
  function externalChange(change: (board: BoardRecord) => void) {
    const next = { ...record(), data: cloneSerializable(record().data) };
    change(next);
    next.title = next.data.board.settings.title;
    store.setState({ portfolioBoards: [next, store.getState().portfolioBoards[1]] });
  }
  return { actions, store, record, events, open, externalChange, markDirty, enqueueSave, closeDialogFn, openDialogFn, preflightSave };
}

describe('project details commands', () => {
  it('opens legacy data without inferring a team and cancels without a mutation', () => {
    const { actions, store, open, record, markDirty, enqueueSave, openDialogFn, closeDialogFn } = setup();
    const before = record();
    const vm = open();
    expect(vm).toEqual({ boardId: 'p1', initial: { title: 'Project', description: '', team: [] }, readOnly: false, historical: false });
    expect(openDialogFn).toHaveBeenCalledWith('projectDetails', vm);
    vm.initial.team.push('Local draft');
    actions.closeProjectDetails();
    expect(closeDialogFn).toHaveBeenCalledWith('projectDetails');
    expect(store.getState().portfolioBoards[0]).toBe(before);
    expect(getProjectBaseData(before.data).team).toEqual([]);
    expect(markDirty).not.toHaveBeenCalled();
    expect(enqueueSave).not.toHaveBeenCalled();
  });

  it('normalizes names and records exactly one event on the opened project despite a selection change', async () => {
    const { actions, store, record, events, open, markDirty, enqueueSave } = setup();
    const vm = open();
    const other = store.getState().portfolioBoards[1];
    store.setState({ selectedPortfolioBoardId: 'p2' });
    await expect(actions.saveProjectDetails(vm, {
      title: '  Renamed  ', description: 'First line\nSecond line', team: [' Ana ', '', 'ana', '  ', 'Doe, Jane', 'DOE, JANE', 'Bruno']
    })).resolves.toBe('saved');
    expect(getProjectBaseData(record().data)).toEqual({ title: 'Renamed', description: 'First line\nSecond line', team: ['Ana', 'Doe, Jane', 'Bruno'] });
    expect(record().title).toBe('Renamed');
    expect(record().fileName).toBe('p1.json');
    expect(record().handle).not.toBeNull();
    expect(store.getState().selectedPortfolioBoardId).toBe('p2');
    expect(store.getState().portfolioBoards[1]).toBe(other);
    expect(events().filter((event) => event.kind === 'project.details.updated')).toEqual([expect.objectContaining({
      entityType: 'board', entityId: 'board', changes: {
        title: { before: 'Project', after: 'Renamed' },
        description: { before: '', after: 'First line\nSecond line' },
        team: { before: [], after: ['Ana', 'Doe, Jane', 'Bruno'] }
      }
    })]);
    expect(markDirty).toHaveBeenCalledExactlyOnceWith('p1');
    expect(enqueueSave).toHaveBeenCalledExactlyOnceWith(record());
  });

  it('does not create a baseline, replace data, mark dirty or save for a normalized no-op', async () => {
    const { actions, record, open, markDirty, enqueueSave, closeDialogFn } = setup();
    const vm = open();
    const before = record();
    await expect(actions.saveProjectDetails(vm, { title: '  Project ', description: '', team: ['', '  '] })).resolves.toBe('unchanged');
    expect(record()).toBe(before);
    expect(record().data.extensions.timeline).toBeUndefined();
    expect(markDirty).not.toHaveBeenCalled();
    expect(enqueueSave).not.toHaveBeenCalled();
    expect(closeDialogFn).toHaveBeenCalledWith('projectDetails');
  });

  it('also avoids events on an existing timeline after team normalization', async () => {
    const { actions, record, events, open, enqueueSave } = setup();
    await actions.saveProjectDetails(open(), { title: 'Project', description: '', team: ['Ana'] });
    const before = record();
    const eventCount = events().length;
    enqueueSave.mockClear();
    await expect(actions.saveProjectDetails(open(), { title: 'Project ', description: '', team: [' Ana ', 'ANA', ''] })).resolves.toBe('unchanged');
    expect(record()).toBe(before);
    expect(events()).toHaveLength(eventCount);
    expect(enqueueSave).not.toHaveBeenCalled();
  });

  it.each(['', '   ', '\n\t'])('rejects the invalid name %j and keeps the dialog draft open', async (title) => {
    const { actions, open, record, markDirty, closeDialogFn } = setup();
    const vm = open();
    const before = record();
    await expect(actions.saveProjectDetails(vm, { ...vm.initial, title })).resolves.toBe('invalid-name');
    expect(record()).toBe(before);
    expect(markDirty).not.toHaveBeenCalled();
    expect(closeDialogFn).not.toHaveBeenCalled();
  });

  it.each(['title', 'description', 'team'] as const)('blocks stale edits when the current %s differs from opening data', async (field) => {
    const { actions, open, record, externalChange, markDirty, enqueueSave, closeDialogFn } = setup();
    const vm = open();
    externalChange((board) => setProjectBaseData(board.data, { ...vm.initial, [field]: field === 'team' ? ['External'] : 'External' }));
    const latest = record();
    await expect(actions.saveProjectDetails(vm, { ...vm.initial, title: 'Draft name' })).resolves.toBe('conflict');
    expect(record()).toBe(latest);
    expect(markDirty).not.toHaveBeenCalled();
    expect(enqueueSave).not.toHaveBeenCalled();
    expect(closeDialogFn).not.toHaveBeenCalled();
    expect(vm.initial).toEqual({ title: 'Project', description: '', team: [] });
  });

  it('preserves the latest tasks, planning and unrelated extensions when base data has not changed', async () => {
    const { actions, open, record, externalChange } = setup();
    const vm = open();
    externalChange((board) => {
      board.data.board.tasks[0].title = 'Externally edited';
      board.data.board.tasks[0].assignees = ['Ana', 'Unallocated'];
      board.data.extensions.dayPlanner = { version: 1, blocks: [{ id: 'plan', taskId: 1, date: '2026-10-12', start: '09:00', end: '10:00' }] };
      board.data.extensions.custom = { nested: ['Preserve me'] };
    });
    const latestTasks = cloneSerializable(record().data.board.tasks);
    const latestPlanner = cloneSerializable(record().data.extensions.dayPlanner);
    await expect(actions.saveProjectDetails(vm, { title: 'Project', description: 'Updated', team: ['Bruno'] })).resolves.toBe('saved');
    expect(record().data.board.tasks).toEqual(latestTasks);
    expect(record().data.extensions.dayPlanner).toEqual(latestPlanner);
    expect(record().data.extensions.custom).toEqual({ nested: ['Preserve me'] });
  });

  it('keeps the project draft open when the external reload path closes task contexts', () => {
    const { open } = setup();
    const vm = open();
    const before = useAppStore.getState();
    try {
      useAppStore.setState({
        activeDialog: 'projectDetails', dialogProps: vm,
        portfolioDetailContext: { boardId: 'p1', taskId: 1, readOnly: false },
        portfolioEditContext: { boardId: 'p1', taskId: 1 }
      });
      closePortfolioContextsForProject('p1');
      expect(useAppStore.getState().activeDialog).toBe('projectDetails');
      expect(useAppStore.getState().dialogProps).toBe(vm);
      expect(useAppStore.getState().portfolioDetailContext).toBeNull();
      expect(useAppStore.getState().portfolioEditContext).toBeNull();
    } finally {
      useAppStore.setState({
        activeDialog: before.activeDialog, dialogProps: before.dialogProps,
        portfolioDetailContext: before.portfolioDetailContext,
        portfolioEditContext: before.portfolioEditContext,
        portfolioCreateContext: before.portfolioCreateContext
      });
    }
  });

  it('records spelling corrections and persists empty before/after values without unchanged fields', async () => {
    const { actions, open, record, events } = setup();
    await actions.saveProjectDetails(open(), { title: 'Project', description: 'Notes', team: ['Ana'] });
    await actions.saveProjectDetails(open(), { title: 'Project', description: '', team: ['ANA'] });
    expect(events().at(-1)?.changes).toEqual({ description: { before: 'Notes', after: '' }, team: { before: ['Ana'], after: ['ANA'] } });
    await actions.saveProjectDetails(open(), { title: 'Project', description: '', team: [] });
    expect(JSON.parse(JSON.stringify(events().at(-1)?.changes))).toEqual({ team: { before: ['ANA'], after: [] } });
    expect(record().data.board.tasks[0].assignees).toEqual(['Ana', 'Doe, Jane']);
  });

  it('opens reconstructed historical data and rejects saving even after returning to the present', async () => {
    const { actions, store, open, events, enqueueSave, markDirty } = setup();
    await actions.saveProjectDetails(open(), { title: 'First', description: 'At first', team: ['Ana'] });
    await actions.saveProjectDetails(open(), { title: 'Second', description: 'Present', team: ['Bruno'] });
    store.setState({ portfolioTimelineSelection: { boardId: 'p1', eventIndex: 1 } });
    const historical = open();
    expect(historical).toMatchObject({ historical: true, readOnly: true, initial: { title: 'First', description: 'At first', team: ['Ana'] } });
    store.setState({ portfolioTimelineSelection: { boardId: 'p1', eventIndex: 0 } });
    expect(open().initial).toEqual({ title: 'Project', description: '', team: [] });
    store.setState({ portfolioTimelineSelection: { boardId: 'p1', eventIndex: events().length - 1 } });
    enqueueSave.mockClear();
    markDirty.mockClear();
    await expect(actions.saveProjectDetails(historical, { ...historical.initial, title: 'Forbidden' })).resolves.toBe('unavailable');
    expect(enqueueSave).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
  });

  it('allows read-only imports to be viewed and forbids mutations', async () => {
    const { actions, open, externalChange, enqueueSave, markDirty } = setup();
    externalChange((board) => { board.handle = null; });
    const vm = open();
    expect(vm).toMatchObject({ readOnly: true, historical: false });
    await expect(actions.saveProjectDetails(vm, { ...vm.initial, title: 'Forbidden' })).resolves.toBe('unavailable');
    expect(enqueueSave).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
  });

  it('rechecks current permissions and historical selection before saving', async () => {
    const { actions, open, externalChange, store, events, enqueueSave } = setup();
    await actions.saveProjectDetails(open(), { title: 'Present', description: '', team: [] });
    const vm = open();
    store.setState({ portfolioTimelineSelection: { boardId: 'p1', eventIndex: 0 } });
    enqueueSave.mockClear();
    await expect(actions.saveProjectDetails(vm, { ...vm.initial, title: 'Forbidden' })).resolves.toBe('unavailable');
    store.setState({ portfolioTimelineSelection: { boardId: 'p1', eventIndex: events().length - 1 } });
    externalChange((board) => { board.handle = null; });
    await expect(actions.saveProjectDetails(vm, { ...vm.initial, title: 'Forbidden' })).resolves.toBe('unavailable');
    expect(enqueueSave).not.toHaveBeenCalled();
  });

  it.each(['permission', 'history', 'base data'] as const)('rechecks %s after the asynchronous preflight', async (change) => {
    const { actions, open, externalChange, store, preflightSave, enqueueSave, markDirty, closeDialogFn } = setup();
    await actions.saveProjectDetails(open(), { title: 'Present', description: '', team: [] });
    const vm = open();
    preflightSave.mockImplementationOnce(async () => {
      if (change === 'permission') externalChange(board => { board.handle = null; });
      if (change === 'history') store.setState({ portfolioTimelineSelection: { boardId: 'p1', eventIndex: 0 } });
      if (change === 'base data') externalChange(board => { board.data.board.settings.title = 'External'; });
      return true;
    });
    enqueueSave.mockClear();
    markDirty.mockClear();
    closeDialogFn.mockClear();
    await expect(actions.saveProjectDetails(vm, { ...vm.initial, description: 'Draft' }))
      .resolves.toBe(change === 'base data' ? 'conflict' : 'unavailable');
    expect(enqueueSave).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
    expect(closeDialogFn).not.toHaveBeenCalled();
  });

  it('does not mutate or close the draft when the disk preflight cannot complete safely', async () => {
    const { actions, open, record, preflightSave, enqueueSave, markDirty, closeDialogFn } = setup();
    const vm = open();
    const before = record();
    preflightSave.mockResolvedValueOnce(false);
    await expect(actions.saveProjectDetails(vm, { ...vm.initial, description: 'Draft' })).resolves.toBe('failed');
    expect(preflightSave).toHaveBeenCalledExactlyOnceWith('p1');
    expect(record()).toBe(before);
    expect(enqueueSave).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
    expect(closeDialogFn).not.toHaveBeenCalled();
  });

  it('imposes no additional field length limits', async () => {
    const { actions, open, record } = setup();
    const input: ProjectBaseData = { title: 'N'.repeat(1000), description: 'D'.repeat(20000), team: ['P'.repeat(1000)] };
    await expect(actions.saveProjectDetails(open(), input)).resolves.toBe('saved');
    expect(getProjectBaseData(record().data)).toEqual(input);
  });

  it('uses the existing persistence-error path after applying the mutation', async () => {
    const { actions, open, record, enqueueSave, closeDialogFn, markDirty } = setup();
    enqueueSave.mockResolvedValue(false);
    await expect(actions.saveProjectDetails(open(), { title: 'Unsaved', description: '', team: [] })).resolves.toBe('failed');
    expect(record().title).toBe('Unsaved');
    expect(markDirty).toHaveBeenCalledExactlyOnceWith('p1');
    expect(closeDialogFn).toHaveBeenCalledWith('projectDetails');
  });
});
