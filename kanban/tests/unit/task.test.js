import { describe, it, expect } from 'vitest';
import {
  normalizeAssignee,
  normalizeAssignees,
  parseAssigneesInput,
  formatAssignees,
  taskAssignees,
  taskHasAssignee,
  normalizeTags,
  buildTaskFieldsFromDraft,
  normalizeBlockerReason,
  normalizeChecklist,
  normalizeEffort,
  normalizePortfolioBlockedFilter,
  normalizePriority,
  normalizeTaskBlocked,
  parseChecklistInput,
  resolveKnownTaskStatus,
  findTaskInBoardData,
  getBoardTagSuggestions,
  getTaskChecklistDropPlacement,
  isAcceptedLegacyAssigneeValue,
  nextTaskIdForBoard,
  touchTask,
  getTaskStatusAgeBaseTimestamp,
  isTaskOverdue,
  normalizeTaskStatus
} from '../../src/domain/task.js';

describe('normalizeAssignee', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeAssignee('  Ada  ')).toBe('Ada');
  });

  it('returns an empty string for null and undefined', () => {
    expect(normalizeAssignee(null)).toBe('');
    expect(normalizeAssignee(undefined)).toBe('');
  });

  it('coerces non-string values to strings', () => {
    expect(normalizeAssignee(42)).toBe('42');
  });
});

describe('normalizeAssignees', () => {
  it('deduplicates case-insensitively and preserves first-seen order', () => {
    expect(normalizeAssignees(['Ada', 'ada', 'Grace'])).toEqual(['Ada', 'Grace']);
  });

  it('drops empty entries', () => {
    expect(normalizeAssignees(['Ada', '  ', ''])).toEqual(['Ada']);
  });

  it('wraps a bare string into a list', () => {
    expect(normalizeAssignees('Ada')).toEqual(['Ada']);
  });

  it('wraps null/undefined into an empty list', () => {
    expect(normalizeAssignees(null)).toEqual([]);
    expect(normalizeAssignees(undefined)).toEqual([]);
  });
});

describe('parseAssigneesInput', () => {
  it('normalizes an array as-is', () => {
    expect(parseAssigneesInput(['Ada', 'ada'])).toEqual(['Ada']);
  });

  it('returns an empty array for null or undefined', () => {
    expect(parseAssigneesInput(null)).toEqual([]);
    expect(parseAssigneesInput(undefined)).toEqual([]);
  });

  it('splits a string on commas and newlines', () => {
    expect(parseAssigneesInput('Ada, Grace\nLinus')).toEqual(['Ada', 'Grace', 'Linus']);
  });

  it('collapses consecutive separators without producing empty entries', () => {
    expect(parseAssigneesInput('Ada,,\n\nGrace')).toEqual(['Ada', 'Grace']);
  });
});

describe('formatAssignees', () => {
  it('joins normalized assignees with a comma and space', () => {
    expect(formatAssignees(['Ada', 'ada', 'Grace'])).toBe('Ada, Grace');
  });

  it('returns an empty string for no assignees', () => {
    expect(formatAssignees([])).toBe('');
  });
});

describe('taskAssignees', () => {
  it('prefers the assignees array when present', () => {
    expect(taskAssignees({ assignees: ['Ada'], assignee: 'Grace' })).toEqual(['Ada']);
  });

  it('falls back to the legacy singular assignee field', () => {
    expect(taskAssignees({ assignee: 'Grace' })).toEqual(['Grace']);
  });

  it('returns an empty array when neither field is present', () => {
    expect(taskAssignees({})).toEqual([]);
  });
});

describe('taskHasAssignee', () => {
  it('matches case-insensitively', () => {
    expect(taskHasAssignee({ assignees: ['Ada Lovelace'] }, 'ada lovelace')).toBe(true);
  });

  it('returns false when the name is not assigned', () => {
    expect(taskHasAssignee({ assignees: ['Ada'] }, 'Grace')).toBe(false);
  });

  it('returns false for an empty or blank query', () => {
    expect(taskHasAssignee({ assignees: ['Ada'] }, '  ')).toBe(false);
  });
});

describe('normalizeTags', () => {
  it('lowercases, trims, and deduplicates', () => {
    expect(normalizeTags([' Bug ', 'bug', 'Feature'])).toEqual(['bug', 'feature']);
  });

  it('returns an empty array for non-array input', () => {
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags('bug')).toEqual([]);
  });

  it('drops non-string entries and blank strings', () => {
    expect(normalizeTags(['bug', 42, '   ', null])).toEqual(['bug']);
  });

  it('drops tags longer than 30 characters', () => {
    const longTag = 'a'.repeat(31);
    expect(normalizeTags([longTag])).toEqual([]);
  });

  it('keeps a tag exactly 30 characters long', () => {
    const maxTag = 'a'.repeat(30);
    expect(normalizeTags([maxTag])).toEqual([maxTag]);
  });

  it('caps the result at 10 tags', () => {
    const tags = Array.from({ length: 15 }, (_, i) => `tag${i}`);
    expect(normalizeTags(tags)).toHaveLength(10);
    expect(normalizeTags(tags)).toEqual(tags.slice(0, 10));
  });
});

describe('buildTaskFieldsFromDraft', () => {
  it('maps draft fields through, normalizing tags', () => {
    const draft = {
      title: 'Ship it',
      description: 'desc',
      assignees: ['Ada'],
      tags: ['Bug', 'bug'],
      blocked: false,
      blockerReason: 'should be dropped',
      checklist: [{ text: 'a', done: false }],
      dueDate: '2024-01-01',
      priority: 'high',
      effort: 'M',
      phaseId: 'p1',
      milestoneId: 'm1'
    };
    expect(buildTaskFieldsFromDraft(draft)).toEqual({
      title: 'Ship it',
      description: 'desc',
      assignees: ['Ada'],
      tags: ['bug'],
      blocked: false,
      blockerReason: '',
      checklist: [{ text: 'a', done: false }],
      dueDate: '2024-01-01',
      priority: 'high',
      effort: 'M',
      phaseId: 'p1',
      milestoneId: 'm1'
    });
  });

  it('keeps the blocker reason only when the draft is blocked', () => {
    const draft = { blocked: true, blockerReason: 'waiting on design', tags: [] };
    expect(buildTaskFieldsFromDraft(draft).blockerReason).toBe('waiting on design');
  });
});

describe('normalizeBlockerReason', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeBlockerReason('  waiting  ')).toBe('waiting');
  });

  it('returns an empty string for null and undefined', () => {
    expect(normalizeBlockerReason(null)).toBe('');
    expect(normalizeBlockerReason(undefined)).toBe('');
  });
});

describe('normalizeChecklist', () => {
  it('trims text and coerces done to a boolean', () => {
    expect(normalizeChecklist([{ text: '  a  ', done: 1 }])).toEqual([{ text: 'a', done: true }]);
  });

  it('drops items with a blank or missing text', () => {
    expect(normalizeChecklist([{ text: '   ' }, { done: true }, null])).toEqual([]);
  });

  it('returns an empty array for non-array input', () => {
    expect(normalizeChecklist(null)).toEqual([]);
    expect(normalizeChecklist(undefined)).toEqual([]);
  });

  it('defaults done to false when absent', () => {
    expect(normalizeChecklist([{ text: 'a' }])).toEqual([{ text: 'a', done: false }]);
  });
});

describe('normalizeEffort', () => {
  it('uppercases and trims a valid bucket', () => {
    expect(normalizeEffort('  m ')).toBe('M');
  });

  it('returns null for a value outside the bucket list', () => {
    expect(normalizeEffort('HUGE')).toBeNull();
  });

  it('returns null for null, undefined, and blank strings', () => {
    expect(normalizeEffort(null)).toBeNull();
    expect(normalizeEffort(undefined)).toBeNull();
    expect(normalizeEffort('   ')).toBeNull();
  });
});

describe('normalizePortfolioBlockedFilter', () => {
  it('accepts known filter values', () => {
    expect(normalizePortfolioBlockedFilter('blocked')).toBe('blocked');
    expect(normalizePortfolioBlockedFilter('unblocked')).toBe('unblocked');
    expect(normalizePortfolioBlockedFilter('all')).toBe('all');
  });

  it('falls back to "all" for unknown values', () => {
    expect(normalizePortfolioBlockedFilter('bogus')).toBe('all');
    expect(normalizePortfolioBlockedFilter(undefined)).toBe('all');
  });
});

describe('normalizePriority', () => {
  it('lowercases a valid priority', () => {
    expect(normalizePriority('HIGH')).toBe('high');
  });

  it('returns null for an unknown priority', () => {
    expect(normalizePriority('urgent')).toBeNull();
  });

  it('returns null for null and undefined', () => {
    expect(normalizePriority(null)).toBeNull();
    expect(normalizePriority(undefined)).toBeNull();
  });
});

describe('normalizeTaskBlocked', () => {
  it('returns true only for the strict boolean true', () => {
    expect(normalizeTaskBlocked(true)).toBe(true);
  });

  it('returns false for truthy non-boolean values', () => {
    expect(normalizeTaskBlocked('true')).toBe(false);
    expect(normalizeTaskBlocked(1)).toBe(false);
    expect(normalizeTaskBlocked(false)).toBe(false);
    expect(normalizeTaskBlocked(null)).toBe(false);
  });
});

describe('parseChecklistInput', () => {
  it('parses one item per non-blank line', () => {
    expect(parseChecklistInput('a\nb\n\nc')).toEqual([
      { text: 'a', done: false },
      { text: 'b', done: false },
      { text: 'c', done: false }
    ]);
  });

  it('marks a line with a checked "[x]" prefix as done and strips the prefix', () => {
    expect(parseChecklistInput('[x] done thing')).toEqual([{ text: 'done thing', done: true }]);
  });

  it('marks a line with an unchecked "[]" prefix as not done and strips the prefix', () => {
    expect(parseChecklistInput('[ ] todo thing')).toEqual([{ text: 'todo thing', done: false }]);
  });

  it('keeps a line without a checkbox prefix verbatim', () => {
    expect(parseChecklistInput('just text')).toEqual([{ text: 'just text', done: false }]);
  });

  it('drops lines that are empty after stripping the checkbox prefix', () => {
    expect(parseChecklistInput('[x]\n[ ]   \nreal item')).toEqual([{ text: 'real item', done: false }]);
  });
});

describe('resolveKnownTaskStatus', () => {
  it('maps known aliases to their canonical status', () => {
    expect(resolveKnownTaskStatus('backlog')).toBe('backlog');
    expect(resolveKnownTaskStatus('todo')).toBe('to-do');
    expect(resolveKnownTaskStatus('to-do')).toBe('to-do');
    expect(resolveKnownTaskStatus('nextup')).toBe('to-do');
    expect(resolveKnownTaskStatus('inprogress')).toBe('doing');
    expect(resolveKnownTaskStatus('in-progress')).toBe('doing');
    expect(resolveKnownTaskStatus('doing')).toBe('doing');
    expect(resolveKnownTaskStatus('done')).toBe('done');
    expect(resolveKnownTaskStatus('concluid')).toBe('done');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(resolveKnownTaskStatus('  DOING  ')).toBe('doing');
  });

  it('returns null for an unknown or blank status', () => {
    expect(resolveKnownTaskStatus('unknown')).toBeNull();
    expect(resolveKnownTaskStatus('')).toBeNull();
    expect(resolveKnownTaskStatus(null)).toBeNull();
  });
});

describe('findTaskInBoardData', () => {
  const boardData = { board: { tasks: [{ id: 1, title: 'a' }, { id: 2, title: 'b' }] } };

  it('finds a task by numeric id', () => {
    expect(findTaskInBoardData(boardData, 2)).toEqual({ id: 2, title: 'b' });
  });

  it('finds a task when the id is passed as a string', () => {
    expect(findTaskInBoardData(boardData, '1')).toEqual({ id: 1, title: 'a' });
  });

  it('returns null when the task is not found', () => {
    expect(findTaskInBoardData(boardData, 99)).toBeNull();
  });

  it('returns null for a null, undefined, or empty-string id', () => {
    expect(findTaskInBoardData(boardData, null)).toBeNull();
    expect(findTaskInBoardData(boardData, undefined)).toBeNull();
    expect(findTaskInBoardData(boardData, '')).toBeNull();
  });

  it('returns null when boardData has no task list', () => {
    expect(findTaskInBoardData({}, 1)).toBeNull();
    expect(findTaskInBoardData(null, 1)).toBeNull();
  });
});

describe('getBoardTagSuggestions', () => {
  it('collects unique lowercased tags across tasks, sorted', () => {
    const boardData = {
      board: {
        tasks: [
          { tags: ['Bug', 'feature'] },
          { tags: ['bug', 'Docs'] }
        ]
      }
    };
    expect(getBoardTagSuggestions(boardData)).toEqual(['bug', 'docs', 'feature']);
  });

  it('ignores blank and non-string tags', () => {
    const boardData = { board: { tasks: [{ tags: ['  ', 42, 'ok'] }] } };
    expect(getBoardTagSuggestions(boardData)).toEqual(['ok']);
  });

  it('returns an empty array when there are no tasks', () => {
    expect(getBoardTagSuggestions({})).toEqual([]);
  });
});

describe('getTaskChecklistDropPlacement', () => {
  it('returns "before" when clientY is above the row midpoint', () => {
    const row = { getBoundingClientRect: () => ({ top: 100, height: 20 }) };
    expect(getTaskChecklistDropPlacement(row, 105)).toBe('before');
  });

  it('returns "after" when clientY is below the row midpoint', () => {
    const row = { getBoundingClientRect: () => ({ top: 100, height: 20 }) };
    expect(getTaskChecklistDropPlacement(row, 115)).toBe('after');
  });

  it('returns "after" when the row has no bounding rect available', () => {
    expect(getTaskChecklistDropPlacement(null, 50)).toBe('after');
    expect(getTaskChecklistDropPlacement({}, 50)).toBe('after');
  });
});

describe('isAcceptedLegacyAssigneeValue', () => {
  it('accepts a plain string', () => {
    expect(isAcceptedLegacyAssigneeValue('Ada')).toBe(true);
  });

  it('accepts an array of strings', () => {
    expect(isAcceptedLegacyAssigneeValue(['Ada', 'Grace'])).toBe(true);
  });

  it('rejects an array containing a non-string entry', () => {
    expect(isAcceptedLegacyAssigneeValue(['Ada', 42])).toBe(false);
  });

  it('rejects non-string, non-array values', () => {
    expect(isAcceptedLegacyAssigneeValue(42)).toBe(false);
    expect(isAcceptedLegacyAssigneeValue(null)).toBe(false);
    expect(isAcceptedLegacyAssigneeValue({})).toBe(false);
  });
});

describe('nextTaskIdForBoard', () => {
  it('returns one more than the highest existing task id', () => {
    const boardRecord = { data: { board: { tasks: [{ id: 1 }, { id: 5 }, { id: 3 }] } } };
    expect(nextTaskIdForBoard(boardRecord)).toBe(6);
  });

  it('ignores non-finite ids when computing the max', () => {
    const boardRecord = { data: { board: { tasks: [{ id: 1 }, { id: 'abc' }] } } };
    expect(nextTaskIdForBoard(boardRecord)).toBe(2);
  });

  it('falls back to the current timestamp when there are no existing tasks', () => {
    const before = Date.now();
    const id = nextTaskIdForBoard({ data: { board: { tasks: [] } } });
    const after = Date.now();
    expect(id).toBeGreaterThanOrEqual(before);
    expect(id).toBeLessThanOrEqual(after);
  });

  it('falls back to the current timestamp when the board record is empty', () => {
    const before = Date.now();
    const id = nextTaskIdForBoard({});
    const after = Date.now();
    expect(id).toBeGreaterThanOrEqual(before);
    expect(id).toBeLessThanOrEqual(after);
  });
});

describe('touchTask', () => {
  it('sets updatedAt to the current time as an ISO string', () => {
    const task = { updatedAt: '2020-01-01T00:00:00.000Z' };
    const before = Date.now();
    touchTask(task);
    const after = Date.now();
    expect(task.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const parsed = new Date(task.updatedAt).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it('mutates the task in place and returns undefined', () => {
    const task = {};
    expect(touchTask(task)).toBeUndefined();
    expect(task.updatedAt).toBeDefined();
  });
});

describe('getTaskStatusAgeBaseTimestamp', () => {
  it('prefers statusChangedAt when present and valid', () => {
    const task = {
      statusChangedAt: '2024-03-01T00:00:00.000Z',
      updatedAt: '2024-02-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z'
    };
    expect(getTaskStatusAgeBaseTimestamp(task)).toBe('2024-03-01T00:00:00.000Z');
  });

  it('falls back to updatedAt when statusChangedAt is absent', () => {
    const task = { updatedAt: '2024-02-01T00:00:00.000Z', createdAt: '2024-01-01T00:00:00.000Z' };
    expect(getTaskStatusAgeBaseTimestamp(task)).toBe('2024-02-01T00:00:00.000Z');
  });

  it('falls back to updatedAt when statusChangedAt is an unparsable string', () => {
    const task = { statusChangedAt: 'not-a-date', updatedAt: '2024-02-01T00:00:00.000Z' };
    expect(getTaskStatusAgeBaseTimestamp(task)).toBe('2024-02-01T00:00:00.000Z');
  });

  it('falls back to createdAt when statusChangedAt and updatedAt are both absent', () => {
    const task = { createdAt: '2024-01-01T00:00:00.000Z' };
    expect(getTaskStatusAgeBaseTimestamp(task)).toBe('2024-01-01T00:00:00.000Z');
  });

  it('returns an empty string when no valid timestamp is present on the task', () => {
    expect(getTaskStatusAgeBaseTimestamp({})).toBe('');
    expect(getTaskStatusAgeBaseTimestamp({ statusChangedAt: 'bogus', updatedAt: '', createdAt: null })).toBe('');
  });

  it('returns an empty string for a non-object or nullish task', () => {
    expect(getTaskStatusAgeBaseTimestamp(null)).toBe('');
    expect(getTaskStatusAgeBaseTimestamp(undefined)).toBe('');
    expect(getTaskStatusAgeBaseTimestamp('x')).toBe('');
  });
});

describe('isTaskOverdue', () => {
  function localIsoDateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  it('returns true for a task due yesterday that is not done or archived', () => {
    const task = { dueDate: localIsoDateOffset(-1), status: 'doing', archived: false };
    expect(isTaskOverdue(task)).toBe(true);
  });

  it('returns false for a task due today (the boundary is exclusive)', () => {
    const task = { dueDate: localIsoDateOffset(0), status: 'doing', archived: false };
    expect(isTaskOverdue(task)).toBe(false);
  });

  it('returns false for a task due tomorrow', () => {
    const task = { dueDate: localIsoDateOffset(1), status: 'doing', archived: false };
    expect(isTaskOverdue(task)).toBe(false);
  });

  it('returns false when there is no due date', () => {
    expect(isTaskOverdue({ status: 'doing', archived: false })).toBe(false);
    expect(isTaskOverdue({ dueDate: '', status: 'doing' })).toBe(false);
  });

  it('returns false when the due date fails normalization (invalid format)', () => {
    expect(isTaskOverdue({ dueDate: 'not-a-date', status: 'doing' })).toBe(false);
  });

  it('returns false for an overdue-by-date task whose status is "done"', () => {
    const task = { dueDate: localIsoDateOffset(-1), status: 'done', archived: false };
    expect(isTaskOverdue(task)).toBe(false);
  });

  it('returns false for an overdue-by-date task that is archived', () => {
    const task = { dueDate: localIsoDateOffset(-1), status: 'doing', archived: true };
    expect(isTaskOverdue(task)).toBe(false);
  });
});

describe('normalizeTaskStatus', () => {
  it('passes through each canonical status', () => {
    expect(normalizeTaskStatus('backlog')).toBe('backlog');
    expect(normalizeTaskStatus('to-do')).toBe('to-do');
    expect(normalizeTaskStatus('doing')).toBe('doing');
    expect(normalizeTaskStatus('done')).toBe('done');
  });

  it('resolves known aliases via resolveKnownTaskStatus', () => {
    expect(normalizeTaskStatus('todo')).toBe('to-do');
    expect(normalizeTaskStatus('nextup')).toBe('to-do');
    expect(normalizeTaskStatus('inprogress')).toBe('doing');
    expect(normalizeTaskStatus('in-progress')).toBe('doing');
    expect(normalizeTaskStatus('concluid')).toBe('done');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(normalizeTaskStatus('  DOING  ')).toBe('doing');
  });

  it('falls back to the first default column status ("backlog") for an unknown value', () => {
    expect(normalizeTaskStatus('bogus')).toBe('backlog');
  });

  it('falls back to "backlog" for blank, null, or undefined input', () => {
    expect(normalizeTaskStatus('')).toBe('backlog');
    expect(normalizeTaskStatus(null)).toBe('backlog');
    expect(normalizeTaskStatus(undefined)).toBe('backlog');
  });
});
