import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { buildPortfolioPlannerViewModel } from '../../src/features/portfolio/queries';
import { DEFAULT_PORTFOLIO_FILTERS } from '../../src/domain/portfolioFilters';

function task(id: number, title: string, status = 'to-do', extra: Record<string, unknown> = {}) {
  return fromPartial({
    id, title, status, archived: false, description: '', assignees: [], tags: [], checklist: [],
    priority: null, effort: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra
  });
}

function board(id: string, title: string, tasks: any[], blocks: any[] = [], handle: unknown = {}) {
  const data = createEmptyProjectData(title);
  data.board.tasks.push(...tasks);
  if (blocks.length) data.extensions.dayPlanner = { version: 1, blocks };
  return { id, colorSeed: 0, handle, fileName: `${id}.json`, title, data };
}

function state(boards: any[], extra: Record<string, unknown> = {}) {
  return createAppStore(fromAny({
    portfolioBoards: boards,
    portfolioTimelineSelection: { boardId: '', eventIndex: null },
    ...extra
  })).getState();
}

const TODAY = '2026-09-25';
const ACTIVE = ['to-do', 'doing'] as const;

describe('buildPortfolioPlannerViewModel', () => {
  it('shows one day, defaulting to today, with blocks from every project', () => {
    const s = state([
      board('a', 'Alpha', [task(1, 'Write spec')], [{ id: 'x', taskId: 1, date: TODAY, start: '09:00', end: '10:30' }]),
      board('b', 'Bravo', [task(7, 'Fix bug', 'doing')], [
        { id: 'y', taskId: 7, date: TODAY, start: '10:00', end: '11:00' },
        { id: 'z', taskId: 7, date: '2026-09-24', start: '10:00', end: '11:00' }
      ])
    ]);
    const model = buildPortfolioPlannerViewModel(s, { today: TODAY, trayStatuses: ACTIVE });

    expect(model.mode).toBe('day');
    expect(model.date).toBe(TODAY);
    expect(model.days).toHaveLength(1);
    expect(model.days[0].isToday).toBe(true);
    expect(model.days[0].blocks.map((b) => [b.id, b.title, b.boardTitle, b.column, b.columns])).toEqual([
      ['x', 'Write spec', 'Alpha', 0, 2],
      ['y', 'Fix bug', 'Bravo', 1, 2]
    ]);
    expect(model.plannedMinutes).toBe(150);
    expect(model.capacityMinutes).toBe(8 * 60);
  });

  it('shows Monday–Friday in week mode', () => {
    const s = state([board('a', 'Alpha', [task(1, 'T')], [
      { id: 'mon', taskId: 1, date: '2026-09-21', start: '09:00', end: '09:15' },
      { id: 'sat', taskId: 1, date: '2026-09-26', start: '09:00', end: '09:15' }
    ])], { portfolioPlannerMode: 'week', portfolioPlannerDate: '2026-09-23' });
    const model = buildPortfolioPlannerViewModel(s, { today: TODAY, trayStatuses: ACTIVE });

    expect(model.days.map((d) => d.date)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']);
    expect(model.days[0].blocks.map((b) => b.id)).toEqual(['mon']);
    expect(model.days[4].isToday).toBe(true);
    expect(model.capacityMinutes).toBe(5 * 8 * 60);
  });

  it('limits blocks to the selected project and skips blocks for missing tasks', () => {
    const a = board('a', 'Alpha', [task(1, 'A')], [{ id: 'x', taskId: 1, date: TODAY, start: '09:00', end: '10:00' }]);
    const b = board('b', 'Bravo', [task(2, 'B')], [{ id: 'y', taskId: 2, date: TODAY, start: '09:00', end: '10:00' }]);
    a.data.extensions.dayPlanner!.blocks.push({ id: 'ghost', taskId: 99, date: TODAY, start: '11:00', end: '12:00' });
    const model = buildPortfolioPlannerViewModel(state([a, b], { selectedPortfolioBoardId: 'a' }), { today: TODAY, trayStatuses: ACTIVE });
    expect(model.days[0].blocks.map((block) => block.id)).toEqual(['x']);
  });

  it('marks done and archived tasks, and read-only projects as not editable', () => {
    const s = state([board('a', 'Alpha', [
      task(1, 'Done one', 'done'),
      task(2, 'Archived one', 'to-do', { archived: true })
    ], [
      { id: 'd', taskId: 1, date: TODAY, start: '09:00', end: '10:00' },
      { id: 'r', taskId: 2, date: TODAY, start: '10:00', end: '11:00' }
    ], null)], { portfolioFilters: { ...DEFAULT_PORTFOLIO_FILTERS, archive: 'all' } });
    const [done, archived] = buildPortfolioPlannerViewModel(s, { today: TODAY, trayStatuses: ACTIVE }).days[0].blocks;
    expect(done).toMatchObject({ done: true, archived: false, canEdit: false });
    expect(archived).toMatchObject({ done: false, archived: true });
  });

  it('builds tray groups from the visible rows filtered by status, flagging planned tasks', () => {
    const s = state([board('a', 'Alpha', [
      task(1, 'Planned', 'to-do'),
      task(2, 'Unplanned', 'doing'),
      task(3, 'Later', 'backlog')
    ], [{ id: 'x', taskId: 1, date: TODAY, start: '09:00', end: '10:00' }])]);
    const model = buildPortfolioPlannerViewModel(s, { today: TODAY, trayStatuses: ACTIVE });

    expect(model.trayGroups).toHaveLength(1);
    expect(model.trayGroups[0].boardTitle).toBe('Alpha');
    expect(model.trayGroups[0].items.map((item) => [item.title, item.planned, item.canDrag]).sort()).toEqual([
      ['Planned', true, true],
      ['Unplanned', false, true]
    ]);
  });

  it('applies shared status and roadmap filters to both scheduled blocks and the tray', () => {
    const s = state([board('a', 'Alpha', [
      task(1, 'Matching', 'doing', { phaseId: 'build', milestoneId: 'launch', sprintId: 's1' }),
      task(2, 'Other status', 'to-do', { phaseId: 'build', milestoneId: 'launch', sprintId: 's1' }),
      task(3, 'Other phase', 'doing', { phaseId: 'design', milestoneId: 'launch', sprintId: 's1' })
    ], [1, 2, 3].map((taskId) => ({ id: `b${taskId}`, taskId, date: TODAY, start: '09:00', end: '10:00' })))], {
      portfolioFilters: { ...DEFAULT_PORTFOLIO_FILTERS, statuses: ['doing'], phaseId: 'build', milestoneId: 'launch', sprintId: 's1' }
    });
    const model = buildPortfolioPlannerViewModel(s, { today: TODAY, trayStatuses: ACTIVE });
    expect(model.days[0].blocks.map((block) => block.taskId)).toEqual([1]);
    expect(model.trayGroups[0].items.map((item) => item.taskId)).toEqual([1]);
    expect(model.plannedMinutes).toBe(60);
  });
});
