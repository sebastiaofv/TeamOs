import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { isTaskBlocked, getRelations } from '@/domain/taskRelations';
import { createAppStore } from '@/features/portfolio/state/store';
import { createPortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';
import { reconstructBoardStateFromTimeline } from '@/domain/timeline';
import { buildTaskDraft } from '@/domain/taskDraft';

function setup() {
  const data = createEmptyProjectData('Project');
  data.extensions.project!.members = ['Ana', 'Marta Sofia Costa', 'José Manuel Silva'].map((name) => ({ id: name, name }));
  data.extensions.project!.tags.push('original');
  data.board.tasks = [1, 2].map((id) => normalizeTask({ id, title: `Item ${id}`, status: 'backlog' }));
  const store = createAppStore({ portfolioBoards: [{ id: 'p1', title: 'Project', fileName: 'p.board.json', colorSeed: 0, handle: fromPartial({}), data }], selectedPortfolioBoardId: 'p1' });
  const confirm = vi.fn((_text: string): boolean | Promise<boolean> => true);
  const alert = vi.fn();
  const enqueueSave = vi.fn(async () => true);
  const openDialogFn = vi.fn();
  const actions = createPortfolioMutationActions({ store, confirm, alert, enqueueSave, markDirty: vi.fn(), openDialogFn, closeDialogFn: vi.fn() });
  return { store, actions, confirm, alert, enqueueSave, openDialogFn, data: () => store.getState().portfolioBoards[0].data };
}

describe('relation commands', () => {
  it('refreshes related workitems with current status and the responsible first name, not participants', async () => {
    const { actions, openDialogFn } = setup();
    await actions.associatePortfolioTasks('p1', 1, 2, 'related');
    actions.openPortfolioTaskDetails('p1', 1);
    const expectRelation = (status: string, responsible: string) => {
      expect(openDialogFn).toHaveBeenLastCalledWith('taskDetail', expect.objectContaining({
        taskId: 1,
        relations: expect.objectContaining({ related: [expect.objectContaining({ id: 2, status, responsible })] })
      }));
    };
    expectRelation('Backlog', '');
    await actions.movePortfolioTaskToStatus('p1', 2, 'to-do');
    expectRelation('To Do', '');
    await actions.movePortfolioTaskToStatus('p1', 2, 'doing');
    expectRelation('In progress', '');
    await actions.togglePortfolioTaskAssignee('p1', 2, 'Ana');
    expectRelation('In progress', '');
    await actions.setPortfolioTaskResponsible('p1', 2, 'Marta Sofia Costa');
    expectRelation('In progress', 'Marta');
    await actions.movePortfolioTaskToStatus('p1', 2, 'done');
    expectRelation('Done', 'Marta');
    await actions.setPortfolioTaskResponsible('p1', 2, 'José Manuel Silva');
    expectRelation('Done', 'José');
    await actions.setPortfolioTaskResponsible('p1', 2, '');
    expectRelation('Done', '');
  });

  it('waits for replacement confirmation, preserves both workitems and recalculates directional blocking', async () => {
    const { actions, data, confirm, enqueueSave, openDialogFn } = setup();
    await actions.associatePortfolioTasks('p1', 1, 2, 'blocks');
    actions.openPortfolioTaskDetails('p1', 1);
    const tasks = structuredClone(data().board.tasks);
    enqueueSave.mockClear();
    let answer!: (confirmed: boolean) => void;
    confirm.mockReturnValueOnce(new Promise<boolean>((resolve) => { answer = resolve; }));
    const pending = actions.associatePortfolioTasks('p1', 1, 2, 'blockedBy', true);
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('Workitem #1 is blocked by #2.'), { confirmLabel: 'Save' });
    expect(getRelations(data())).toEqual([{ sourceId: 1, targetId: 2, kind: 'blocks' }]);
    expect(enqueueSave).not.toHaveBeenCalled();
    answer(true);
    await expect(pending).resolves.toBe(true);
    expect(getRelations(data())).toEqual([{ sourceId: 2, targetId: 1, kind: 'blocks' }]);
    expect(data().board.tasks).toEqual(tasks);
    expect(isTaskBlocked(data(), 1)).toBe(true);
    expect(isTaskBlocked(data(), 2)).toBe(false);
    expect(openDialogFn).toHaveBeenLastCalledWith('taskDetail', expect.objectContaining({
      relations: { blockedBy: [expect.objectContaining({ id: 2 })], blocks: [], related: [] }
    }));
    expect(enqueueSave).toHaveBeenCalledTimes(1);
  });

  it('cancelling replacement or removal changes nothing; confirmed removal deletes only the relation', async () => {
    const { actions, data, confirm, enqueueSave } = setup();
    await actions.associatePortfolioTasks('p1', 1, 2, 'blocks');
    const before = structuredClone(data());
    enqueueSave.mockClear();
    confirm.mockReturnValueOnce(false);
    await expect(actions.associatePortfolioTasks('p1', 1, 2, 'related', true)).resolves.toBe(false);
    expect(data()).toEqual(before);
    confirm.mockReturnValueOnce(false);
    await expect(actions.removePortfolioTaskRelation('p1', 1, 2)).resolves.toBe(false);
    expect(data()).toEqual(before);
    expect(enqueueSave).not.toHaveBeenCalled();
    await expect(actions.removePortfolioTaskRelation('p1', 1, 2)).resolves.toBe(true);
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('Both workitems will be preserved'), { confirmLabel: 'Remove' });
    expect(getRelations(data())).toEqual([]);
    expect(data().board.tasks).toEqual(before.board.tasks);
    expect(isTaskBlocked(data(), 2)).toBe(false);
  });

  it('discards a related creation if the source disappeared while editing', async () => {
    const { actions, data, store, enqueueSave, alert } = setup();
    actions.openPortfolioCreateRelatedTask('p1', 1, 'related');
    const record = store.getState().portfolioBoards[0];
    store.setState({ portfolioBoards: [{ ...record, data: { ...record.data, board: { ...record.data.board, tasks: record.data.board.tasks.filter((task) => task.id !== 1) } } }] });
    await actions.saveTask(buildTaskDraft({ title: 'Never partially created', description: '', blocked: false, blockerReason: '', assignees: [], responsible: '', tags: [], checklist: [], attachments: [], dueDate: '', priority: '', effort: '', phaseId: '', milestoneId: '' }));
    expect(data().board.tasks.map((task) => task.id)).toEqual([2]);
    expect(getRelations(data())).toEqual([]);
    expect(enqueueSave).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Both workitems must exist'));
    expect(store.getState().portfolioCreateContext).not.toBeNull();
  });

  it('rejects relationship mutations in read-only and historical views and rejects cross-project IDs', async () => {
    const { actions, data, store, enqueueSave } = setup();
    const record = store.getState().portfolioBoards[0];
    store.setState({ portfolioBoards: [{ ...record, handle: null }] });
    await expect(actions.associatePortfolioTasks('p1', 1, 2, 'blocks')).resolves.toBe(false);
    actions.openPortfolioCreateRelatedTask('p1', 1, 'related');
    expect(store.getState().portfolioCreateContext).toBeNull();
    store.setState({ portfolioBoards: [record] });
    await expect(actions.associatePortfolioTasks('p1', 1, 99, 'blocks')).resolves.toBe(false);
    await actions.associatePortfolioTasks('p1', 1, 2, 'blocks');
    enqueueSave.mockClear();
    store.setState({ portfolioTimelineSelection: { boardId: 'p1', eventIndex: 0 } });
    await expect(actions.associatePortfolioTasks('p1', 1, 2, 'related', true)).resolves.toBe(false);
    expect(getRelations(data())).toEqual([{ sourceId: 1, targetId: 2, kind: 'blocks' }]);
    expect(enqueueSave).not.toHaveBeenCalled();
  });
  it('creates a related backlog workitem atomically, inheriting only planning references, and cancellation creates nothing', async () => {
    const { actions, data, store } = setup();
    data().extensions.roadmap = { version: 1, phases: [{ id: 'phase', title: 'Phase', startDate: '2026-01-01', endDate: '2026-02-01' }], milestones: [{ id: 'mile', title: 'Milestone', dueDate: '2026-03-01' }], sprints: [] };
    Object.assign(data().board.tasks[0], { phaseId: 'phase', milestoneId: 'mile', assignees: ['Ana'], responsible: 'Ana', tags: ['original'], priority: 'high', description: 'Original', blocked: true, blockerReason: 'Manual' });
    actions.openPortfolioCreateRelatedTask('p1', 1, 'blockedBy');
    actions.closeTaskEditor();
    expect(data().board.tasks).toHaveLength(2);
    expect(getRelations(data())).toEqual([]);
    actions.openPortfolioCreateRelatedTask('p1', 1, 'blockedBy');
    const initial = store.getState().portfolioCreateContext;
    expect(initial?.relatedTo).toEqual({ taskId: 1, kind: 'blockedBy' });
    await actions.saveTask(buildTaskDraft({ title: 'New item', description: 'Own description', blocked: false, blockerReason: '', assignees: [], responsible: '', tags: [], checklist: [], attachments: [], dueDate: '', priority: '', effort: '', phaseId: 'phase', milestoneId: 'mile' }));
    expect(data().board.tasks[2]).toMatchObject({ id: 3, title: 'New item', description: 'Own description', status: 'backlog', phaseId: 'phase', milestoneId: 'mile', sprintId: '', assignees: [], responsible: '', tags: [], priority: null, blocked: false });
    expect(data().board.tasks.map((task) => task.id)).toEqual([1, 2, 3]);
    expect(getRelations(data())).toEqual([{ sourceId: 3, targetId: 1, kind: 'blocks' }]);
    expect(store.getState().portfolioCreateContext).toBeNull();
  });
  it('uses autosave and timeline replay, updates blocked views, and deletes only the selected item and its links after explaining impacts', async () => {
    const { actions, store, data, confirm, enqueueSave } = setup();
    await actions.associatePortfolioTasks('p1', 1, 2, 'blocks');
    expect(isTaskBlocked(data(), 2)).toBe(true);
    expect(store.getState().portfolioVisibleRows.find((row) => row.taskId === 2)?.task.blocked).toBe(true);
    expect(data().board.tasks[1].blocked).toBe(false);
    expect(enqueueSave).toHaveBeenCalledTimes(1);
    expect(getRelations(reconstructBoardStateFromTimeline(data(), 0))).toEqual([]);
    expect(getRelations(reconstructBoardStateFromTimeline(data(), 1))).toEqual([{ sourceId: 1, targetId: 2, kind: 'blocks' }]);
    await actions.deletePortfolioTask('p1', 1);
    expect(confirm.mock.calls[0][0]).toContain('#2');
    expect(data().board.tasks.map((task) => task.id)).toEqual([2]);
    expect(isTaskBlocked(data(), 2)).toBe(false);
    expect(getRelations(data())).toEqual([]);
    const latest = reconstructBoardStateFromTimeline(data(), data().extensions.timeline!.events.length - 1);
    expect(getRelations(latest)).toEqual([]);
    expect(latest.board.tasks.map((task) => task.id)).toEqual([2]);
  });
});
