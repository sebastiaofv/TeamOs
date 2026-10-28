import { describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import type { Task, TaskStatus } from '../../src/domain/types';
import type { PortfolioRow } from '../../src/features/portfolio/types';
import {
  TABLE_COLUMNS, DEFAULT_TABLE_COLUMNS, DEFAULT_TABLE_FILTERS,
  filterTableRows, tableCellValue, sortTableRows, normalizeTableColumns, buildTableCsv
} from '../../src/features/portfolio/table/tableModel';
import type { TableColumnId, TableFilters } from '../../src/features/portfolio/table/tableModel';

function row(id: number, fields: Partial<Task> = {}): PortfolioRow {
  return {
    boardIndex: 0, boardId: 'project', taskId: id, taskIndex: id - 1,
    boardTitle: 'Project', boardFileName: 'project.json', canMutate: false,
    task: normalizeTask({
      id, title: `Workitem ${id}`, status: 'to-do',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', ...fields
    })
  };
}

const ids = (rows: PortfolioRow[]) => rows.map(({ task }) => task.id);
const filters = (fields: Partial<TableFilters> = {}): TableFilters => ({ ...DEFAULT_TABLE_FILTERS, ...fields });

function roadmapBoard() {
  const board = createEmptyProjectData('Project');
  board.extensions.roadmap = {
    version: 1,
    phases: [{ id: 'build', title: 'Build phase', startDate: '2026-01-01', endDate: '2026-02-01' }],
    milestones: [{ id: 'launch', title: 'Publicação pública', dueDate: '2026-02-01' }],
    sprints: [{ id: 's1', title: 'Sprint 1', startDate: '2026-01-01', endDate: '2026-01-14' }]
  };
  return board;
}

describe('workitem table filters', () => {
  it('defaults to active workitems including completed ones, with explicit all/archived views', () => {
    const rows = [row(1), row(2, { status: 'done' }), row(3, { archived: true })];
    expect(ids(filterTableRows(rows, filters()))).toEqual([1, 2]);
    expect(ids(filterTableRows(rows, filters({ archive: 'all' })))).toEqual([1, 2, 3]);
    expect(ids(filterTableRows(rows, filters({ archive: 'archived' })))).toEqual([3]);
    expect(filterTableRows([], filters())).toEqual([]);
    expect(filterTableRows(rows, filters({ search: 'absent' }))).toEqual([]);
  });

  it('ANDs every filter and ORs selected statuses', () => {
    const target = {
      description: 'API regression', status: 'doing' as TaskStatus, assignees: ['Ana', 'Rui'],
      phaseId: 'build', milestoneId: 'launch', sprintId: 's1', priority: 'high' as const,
      blocked: true, blockerReason: 'Waiting on API'
    };
    const exclusions: Partial<Task>[] = [
      { description: 'Different text' }, { status: 'backlog' }, { assignees: ['Rui'] },
      { phaseId: 'design' }, { milestoneId: 'other' }, { sprintId: 's2' },
      { priority: 'low' }, { blocked: false }, { archived: true }
    ];
    const rows = [row(1, target), row(2, { ...target, status: 'done' }),
      ...exclusions.map((fields, index) => row(index + 3, { ...target, ...fields }))];
    expect(ids(filterTableRows(rows, filters({
      search: '  api REGRESSION  ', statuses: ['doing', 'done'], assignee: 'Ana',
      phaseId: 'build', milestoneId: 'launch', sprintId: 's1', priority: 'high', blocked: 'blocked'
    })))).toEqual([1, 2]);
    expect(ids(filterTableRows(rows, filters({ blocked: 'unblocked' })))).toEqual([10]);
  });

  it('searches case-insensitive ID/title/description only and matches assignees exactly', () => {
    const rows = [row(123, { title: 'Login FIX', description: 'OAuth flow', assignees: ['Ana'] }),
      row(45, { title: 'Other', tags: ['oauth'], assignees: ['Login'], blockerReason: 'OAuth',
        attachments: [{ id: 'a', name: 'oauth.txt', mime: 'text/plain', sizeBytes: 1,
          kind: 'file', dataUrl: 'data:text/plain;base64,YQ==', createdAt: '2026-01-01T00:00:00.000Z' }] })];
    expect(ids(filterTableRows(rows, filters({ search: 'LOGIN fix' })))).toEqual([123]);
    expect(ids(filterTableRows(rows, filters({ search: 'OAUTH' })))).toEqual([123]);
    expect(ids(filterTableRows(rows, filters({ search: '23' })))).toEqual([123]);
    expect(ids(filterTableRows(rows, filters({ assignee: 'An' })))).toEqual([]);
    expect(ids(filterTableRows(rows, filters({ assignee: 'Ana' })))).toEqual([123]);
  });
});

describe('workitem table cells', () => {
  it('returns raw canonical fields, roadmap titles, booleans and multi-value fields', () => {
    const task = row(7, {
      title: 'Título', status: 'doing', priority: 'high', effort: 'L',
      assignees: ['Ana', 'Rui'], tags: ['api', 'backend'], phaseId: 'build', milestoneId: 'launch',
      sprintId: 's1', blocked: true, blockerReason: 'Waiting', dueDate: '2026-01-10', archived: true
    });
    task.columnTitle = 'Em curso';
    expect(TABLE_COLUMNS.map((column) => tableCellValue(task, column, roadmapBoard()))).toEqual([
      '7', 'Título', 'task', '', '', 'doing', 'Ana, Rui', 'high', 'Build phase', '2026-01-02T00:00:00.000Z',
      'Publicação pública', 'Sprint 1', '2026-01-10', '2026-01-01T00:00:00.000Z',
      'true', 'Waiting', 'L', 'api, backend', 'true', ''
    ]);
  });

  it('uses empty cells for absent values or dangling references, including absent roadmap data', () => {
    const task = row(1);
    for (const column of ['priority', 'effort', 'assignees', 'tags', 'phase', 'milestone', 'sprint', 'dueDate', 'blockerReason'] as TableColumnId[]) {
      expect(tableCellValue(task, column, null)).toBe('');
    }
    expect(tableCellValue(task, 'blocked', null)).toBe('false');
    expect(tableCellValue(task, 'archived', null)).toBe('false');
    for (const column of ['phase', 'milestone', 'sprint'] as const) {
      const referenced = row(2, { phaseId: 'build', milestoneId: 'launch', sprintId: 's1' });
      expect(tableCellValue(referenced, column, null)).toBe('');
      expect(tableCellValue(referenced, column, createEmptyProjectData('No roadmap'))).toBe('');
      expect(tableCellValue(row(3, { phaseId: 'gone', milestoneId: 'gone', sprintId: 'gone' }), column, roadmapBoard())).toBe('');
    }
  });
});

describe('workitem table sorting', () => {
  it('sorts numeric IDs and keeps ascending numeric ID ties in either direction without mutating input', () => {
    const rows = [row(20, { title: 'Beta' }), row(10, { title: 'Alpha' }), row(2, { title: 'alpha' })];
    const original = structuredClone(rows);
    expect(ids(sortTableRows(rows, 'id', 'asc', null))).toEqual([2, 10, 20]);
    expect(ids(sortTableRows(rows, 'id', 'desc', null))).toEqual([20, 10, 2]);
    expect(ids(sortTableRows(rows, 'title', 'asc', null))).toEqual([2, 10, 20]);
    expect(ids(sortTableRows(rows, 'title', 'desc', null))).toEqual([20, 2, 10]);
    expect(rows).toEqual(original);
  });

  it('keeps missing dates, priorities, effort and dangling roadmap values last in both directions', () => {
    const rows = [row(8), row(10, { dueDate: '2026-02-01', priority: 'low', effort: 'XL', phaseId: 'build' }),
      row(2, { dueDate: '2026-01-01', priority: 'high', effort: 'XS', phaseId: 'design' }),
      row(3, { phaseId: 'gone' })];
    const board = roadmapBoard();
    board.extensions.roadmap!.phases.push({ id: 'design', title: 'A design', startDate: '2026-01-01', endDate: '2026-01-05' });
    for (const column of ['dueDate', 'priority', 'effort', 'phase'] as const) {
      expect(ids(sortTableRows(rows, column, 'asc', board))).toEqual([2, 10, 3, 8]);
      expect(ids(sortTableRows(rows, column, 'desc', board))).toEqual([10, 2, 3, 8]);
    }
  });

  it('uses workflow order, chronological timestamps and false/true order', () => {
    const rows = [row(4, { status: 'done', blocked: true, blockerReason: 'Wait', archived: true }),
      row(1, { status: 'backlog' }), row(3, { status: 'doing' }), row(2, { status: 'to-do' })];
    expect(ids(sortTableRows(rows, 'status', 'asc', null))).toEqual([1, 2, 3, 4]);
    expect(ids(sortTableRows(rows, 'status', 'desc', null))).toEqual([4, 3, 2, 1]);
    for (const column of ['blocked', 'archived'] as const) {
      expect(ids(sortTableRows(rows, column, 'asc', null))).toEqual([1, 2, 3, 4]);
      expect(ids(sortTableRows(rows, column, 'desc', null))).toEqual([4, 1, 2, 3]);
    }
    const timestamps = [row(10), row(2), row(3)];
    timestamps[0].task.updatedAt = '2026-01-02T00:00:00Z';
    timestamps[1].task.updatedAt = '2026-01-02T01:00:00+02:00';
    timestamps[2].task.updatedAt = '';
    expect(ids(sortTableRows(timestamps, 'updatedAt', 'asc', null))).toEqual([2, 10, 3]);
    expect(ids(sortTableRows(timestamps, 'updatedAt', 'desc', null))).toEqual([10, 2, 3]);
  });

  it('deterministically sorts every supported column even when all cells are tied or missing', () => {
    const rows = [row(10, { title: 'Same' }), row(2, { title: 'Same' }), row(5, { title: 'Same' })];
    for (const column of TABLE_COLUMNS.filter((column) => column !== 'id')) {
      for (const direction of ['asc', 'desc'] as const) {
        expect(ids(sortTableRows(rows, column, direction, null))).toEqual([2, 5, 10]);
      }
    }
  });
});

describe('workitem table column preferences', () => {
  it('defaults to the seven approved columns for absent, malformed and unusable preferences', () => {
    expect(DEFAULT_TABLE_COLUMNS).toEqual(['id', 'title', 'type', 'epic', 'story', 'status', 'assignees', 'priority', 'phase', 'updatedAt']);
    expect(TABLE_COLUMNS).toHaveLength(20);
    for (const value of [undefined, null, {}, 'id,title', 42, [], ['unknown-type', 'unknown', null, 1]]) {
      const columns = normalizeTableColumns(value);
      expect(columns).toEqual(DEFAULT_TABLE_COLUMNS);
      expect(columns).not.toBe(DEFAULT_TABLE_COLUMNS);
    }
  });

  it('sanitizes duplicates and unknown IDs, enforces ID/title and preserves valid reordered columns', () => {
    const preference = ['sprint', 'title', 'id', 'sprint', 'unknown', null];
    expect(normalizeTableColumns(preference)).toEqual(['sprint', 'title', 'id']);
    expect(preference).toEqual(['sprint', 'title', 'id', 'sprint', 'unknown', null]);
    expect(normalizeTableColumns(['priority'])).toEqual(['id', 'title', 'priority']);
    expect(normalizeTableColumns(['priority', 'title'])).toEqual(['id', 'priority', 'title']);
    expect(normalizeTableColumns(['id'])).toEqual(['title', 'id']);
  });
});

describe('workitem table CSV', () => {
  it('exports only requested ordered columns with RFC quoting and UTF-8 text', () => {
    const rows = [row(1, { title: 'Olá, "mundo"\nnext\rline', assignees: ['Ana', 'Rui'] })];
    expect(buildTableCsv(rows, ['title', 'id', 'assignees'], null)).toBe(
      'title,id,assignees\r\n"Olá, ""mundo""\nnext\rline",1,"Ana, Rui"'
    );
    expect(buildTableCsv([row(2, { title: 'Olá; mundo' })], ['id', 'title'], null, { separator: ';' }))
      .toBe('id;title\r\n2;"Olá; mundo"');
    expect(buildTableCsv([], ['id', 'title'], null)).toBe('id,title');
  });

  it.each(['=SUM(1)', '+SUM(1)', '-1+2', '@SUM(1)', '  =1', '\t+1', '\r\n-1', '\u0000@x', '\u001b=1', '\u007f+1', '\u0085-1', '\u00a0@x'])(
    'neutralizes formula injection even behind whitespace/control characters: %j', (title) => {
      const safe = `'${title}`;
      const escaped = /["\r\n]/u.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
      expect(buildTableCsv([row(1)], ['title'], null, { value: () => title })).toBe(`title\r\n${escaped}`);
    });

  it('secures custom headers and values too, while preserving harmless text', () => {
    expect(buildTableCsv([row(1)], ['title'], null, {
      header: () => '=HEADER()', value: () => ' \t@"danger",next'
    })).toBe('\'=HEADER()\r\n"\' \t@""danger"",next"');
    expect(buildTableCsv([row(1, { title: 'normal = text' })], ['title'], null)).toBe('title\r\nnormal = text');
  });

  it('resolves roadmap titles and lets callers supply localized headers/cells', () => {
    const rows = [row(1, { phaseId: 'build', milestoneId: 'launch', sprintId: 's1' }), row(2, { phaseId: 'gone' })];
    expect(buildTableCsv(rows, ['phase', 'milestone', 'sprint'], roadmapBoard()))
      .toBe('phase,milestone,sprint\r\nBuild phase,Publicação pública,Sprint 1\r\n,,');
    expect(buildTableCsv(rows, ['id'], null, { header: () => 'Número', value: (item) => `#${item.task.id}` }))
      .toBe('Número\r\n#1\r\n#2');
  });

  it('exports the full filtered result, regardless of a separate selection, preserving numeric IDs across projects', () => {
    const rows = [row(1), row(2), row(3, { archived: true }), { ...row(1), boardId: 'other-project' }];
    const selectedIds = new Set([2]);
    const filtered = filterTableRows(rows, filters());
    expect(filtered.filter((item) => selectedIds.has(item.task.id))).toHaveLength(1);
    expect(buildTableCsv(filtered, ['id'], null)).toBe('id\r\n1\r\n2\r\n1');
  });
});

describe.each([1, 100, 10_000])('workitem table at %i records', (count) => {
  it('filters, sorts and exports the complete result without changing source records', () => {
    const rows = Array.from({ length: count }, (_, index) => row(index + 1, {
      title: 'Same title', description: 'Needle', archived: index % 5 === 4,
      status: index % 2 === 0 ? 'doing' : 'to-do', assignees: ['Ana']
    }));
    const original = structuredClone(rows);
    const expected = Array.from({ length: count }, (_, index) => index + 1)
      .filter((id) => (id - 1) % 5 !== 4 && (id - 1) % 2 === 0);
    const result = sortTableRows(filterTableRows(rows, filters({
      search: 'needle', statuses: ['doing'], assignee: 'Ana'
    })), 'title', 'desc', null);
    expect(ids(result)).toEqual(expected);
    expect(buildTableCsv(result, ['id'], null).split('\r\n')).toEqual(['id', ...expected.map(String)]);
    expect(rows).toEqual(original);
  });
});
