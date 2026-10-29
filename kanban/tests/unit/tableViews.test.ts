import { describe, expect, it } from 'vitest';
import { formatTableTimestamp } from '../../src/features/portfolio/table/tablePresentation';
import { buildSprintTableGroups, currentSprintRosters, unplannedTableRows } from '../../src/features/portfolio/table/tableViews';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import type { PortfolioRow } from '../../src/features/portfolio/types';

function row(id: number, status: 'done' | 'doing' = 'doing', sprintId = ''): PortfolioRow {
  return { boardId: 'p', boardTitle: 'Project', boardFileName: 'p.json', boardIndex: 0, taskIndex: id - 1, taskId: id,
    canMutate: true, task: normalizeTask({ id, title: `Item ${id}`, status, sprintId }) };
}

describe('table presentation', () => {
  it('formats timestamps in UTC, 24-hour time and second precision, rejecting missing or invalid values', () => {
    expect(formatTableTimestamp('2026-10-17T10:27:42.462Z')).toBe('2026-10-17 10:27:42');
    expect(formatTableTimestamp('2026-10-17T23:05:01+02:00')).toBe('2026-10-17 21:05:01');
    expect(formatTableTimestamp('')).toBe('');
    expect(formatTableTimestamp('invalid')).toBe('');
  });
});

describe('preconfigured table views', () => {
  it('planning excludes done items and every currently associated sprint without changing status or rows', () => {
    const rows = [row(1), row(2, 'done'), row(3, 'doing', 'active'), row(4, 'doing', 'past'), row(5)];
    const before = structuredClone(rows);
    expect(unplannedTableRows(rows).map(item => item.taskId)).toEqual([1, 5]);
    expect(rows).toEqual(before);
  });

  it('lists sprints newest-created first, regardless of planning dates, names or array order', () => {
    const board = createEmptyProjectData('Project');
    board.extensions.roadmap = { version: 1, phases: [], milestones: [], sprints: [
      { id: 'second', title: 'Second', startDate: '2026-12-01', endDate: '2026-12-14' },
      { id: 'first', title: 'First', startDate: '2026-10-01', endDate: '2026-10-14' },
      { id: 'third', title: 'Third', startDate: '2026-01-01', endDate: '2026-01-14' }
    ] };
    board.extensions.sprintCatalog = { version: 1, lastNumber: 3, entries: [
      { sprintId: 'first', number: 1, createdAt: '2026-10-01T10:00:00Z' },
      { sprintId: 'second', number: 2, createdAt: '2026-10-02T10:00:00Z' },
      { sprintId: 'third', number: 3, createdAt: '2026-10-03T10:00:00Z' }
    ] };
    const groups = buildSprintTableGroups(currentSprintRosters(board, []), '2026-10-18');
    expect(groups.map(group => [group.sprint.id, group.number])).toEqual([['third', 3], ['second', 2], ['first', 1]]);
  });

  it('groups each sprint independently, derives calendar status and uses all unique members for completeness', () => {
    const board = createEmptyProjectData('Project');
    board.extensions.roadmap = { version: 1, phases: [], milestones: [], sprints: [
      { id: 'past', title: 'Past', startDate: '2026-10-01', endDate: '2026-10-10' },
      { id: 'active', title: 'Active', startDate: '2026-10-12', endDate: '2026-10-26' },
      { id: 'future', title: 'Future', startDate: '2026-11-01', endDate: '2026-11-14' }
    ] };
    const rows = [row(1, 'done', 'past'), row(2, 'doing', 'active'), row(3, 'done', 'active'), row(3, 'done', 'active'), row(4)];
    rows[2].task.archived = true;
    const groups = buildSprintTableGroups(currentSprintRosters(board, rows), '2026-10-18');
    expect(groups.map(group => [group.sprint.id, group.status, group.completed, group.total, group.completeness])).toEqual([
      ['future', 'planned', 0, 0, null], ['active', 'active', 1, 2, 50], ['past', 'done', 1, 1, 100]
    ]);
    expect(groups[1].rows.map(item => item.taskId)).toEqual([2, 3]);
    expect(buildSprintTableGroups(currentSprintRosters(board, rows), '2026-10-26')[1].status).toBe('active');
  });

  it('can present the same item in a closed snapshot and a new sprint without live changes rewriting old status or completeness', () => {
    const board = createEmptyProjectData('Project');
    const live = row(1, 'done', 'new');
    const closed = row(1, 'doing', 'old');
    const snapshot = structuredClone(board);
    snapshot.board.tasks = [closed.task];
    const groups = buildSprintTableGroups([
      { sprint: { id: 'old', title: 'Old' }, rows: [closed], boardData: snapshot, source: 'closure' },
      { sprint: { id: 'new', title: 'New', startDate: '2026-10-01', endDate: '2026-10-31' }, rows: [live], boardData: board, source: 'current' }
    ], '2026-10-18');
    const historical = groups.find(group => group.sprint.id === 'old')!;
    expect(groups.map(group => [group.total, group.completeness])).toEqual([[1, 100], [1, 0]]);
    expect(historical.rows[0]).toMatchObject({ taskId: 1, historical: true, canMutate: false, task: { status: 'doing' }, boardData: snapshot });
    live.task.status = 'backlog';
    expect(historical.rows[0].task.status).toBe('doing');
    expect(historical.completeness).toBe(0);
  });

  it('includes participating children in the table without counting them twice in Sprint completeness', () => {
    const board = createEmptyProjectData('Project');
    board.extensions.roadmap = { version: 1, phases: [], milestones: [], sprints: [{ id: 's', title: 'Sprint', startDate: '2020-01-01', endDate: '2099-12-31' }] };
    board.board.tasks = [
      normalizeTask({ id: 1, title: 'Story', type: 'story', status: 'doing', sprintId: 's' }),
      normalizeTask({ id: 2, title: 'Child', type: 'task', parentId: 1, status: 'done', sprintId: 's' }),
      normalizeTask({ id: 3, title: 'Other Sprint child', type: 'task', parentId: 1, status: 'done', sprintId: 'other' }),
      normalizeTask({ id: 4, title: 'Independent', type: 'task', status: 'done', sprintId: 's' })
    ];
    const [group] = buildSprintTableGroups(currentSprintRosters(board, []), '2026-10-29');
    expect(group.rows.map(({ taskId }) => taskId)).toEqual([1, 2, 4]);
    expect(group).toMatchObject({ total: 2, completed: 1, completeness: 50 });
  });
});
