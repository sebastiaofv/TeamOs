import { describe, it, expect } from 'vitest';
import {
  addAssignee,
  availableAssigneeSuggestions,
  addTag,
  addChecklistItem,
  moveChecklistItem,
  mergePickedAttachments,
  buildAttachmentWarnings,
  buildTaskDraft
} from '../../src/domain/taskDraft.js';

const MB = 1024 * 1024;
const CREATED_AT = '2026-02-26T00:00:00.000Z';

function pickedFile(name, size, type = 'text/plain') {
  return { name, size, type };
}

function fakeDeps(overrides = {}) {
  let count = 0;
  return {
    readFile: async (file) => `data:${file.type};base64,QUJD`,
    now: () => CREATED_AT,
    createId: () => `att_${++count}`,
    ...overrides
  };
}

function record(overrides = {}) {
  return {
    id: 'a1',
    name: 'a.txt',
    mime: 'text/plain',
    sizeBytes: 10,
    kind: 'file',
    dataUrl: 'data:text/plain;base64,QUJD',
    createdAt: CREATED_AT,
    ...overrides
  };
}

describe('addAssignee', () => {
  it('appends the trimmed name', () => {
    expect(addAssignee(['Alex'], '  Sam ')).toEqual(['Alex', 'Sam']);
  });

  it('returns the same array for a blank name', () => {
    const items = ['Alex'];
    expect(addAssignee(items, '   ')).toBe(items);
  });

  it('returns the same array for a case-insensitive duplicate', () => {
    const items = ['Alex'];
    expect(addAssignee(items, 'alex')).toBe(items);
  });
});

describe('availableAssigneeSuggestions', () => {
  it('excludes current names case-insensitively and ignores blank rows', () => {
    expect(availableAssigneeSuggestions(['Alex', 'Jamie', 'Sam'], ['sam', ' ', 'Jamie '])).toEqual(['Alex']);
  });
});

describe('addTag', () => {
  it('appends the trimmed, lowercased tag', () => {
    expect(addTag(['bug'], ' UI ')).toEqual({ items: ['bug', 'ui'] });
  });

  it('returns the same items for a blank tag', () => {
    const items = ['bug'];
    const result = addTag(items, '   ');
    expect(result.items).toBe(items);
    expect(result.error).toBeUndefined();
  });

  it('accepts a 30-character tag and rejects a 31-character one', () => {
    expect(addTag([], 'a'.repeat(30))).toEqual({ items: ['a'.repeat(30)] });
    expect(addTag([], 'a'.repeat(31))).toEqual({ error: 'Tags must be 30 characters or fewer.' });
  });

  it('rejects a duplicate regardless of case', () => {
    expect(addTag(['bug'], 'BUG')).toEqual({ error: 'This tag is already added.' });
  });

  it('rejects an eleventh tag', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    expect(addTag(ten, 'extra')).toEqual({ error: 'A task can have at most 10 tags.' });
  });

  it('reports a duplicate before the count limit', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    expect(addTag(ten, 'tag3')).toEqual({ error: 'This tag is already added.' });
  });
});

describe('addChecklistItem', () => {
  it('appends a trimmed, not-done item', () => {
    expect(addChecklistItem([{ text: 'A', done: true }], ' B ')).toEqual([
      { text: 'A', done: true },
      { text: 'B', done: false }
    ]);
  });

  it('returns the same array for blank text', () => {
    const items = [{ text: 'A', done: false }];
    expect(addChecklistItem(items, '  ')).toBe(items);
  });
});

describe('moveChecklistItem', () => {
  const A = { text: 'A', done: false };
  const B = { text: 'B', done: false };
  const C = { text: 'C', done: true };
  const items = [A, B, C];

  it('moves backward before the target', () => {
    expect(moveChecklistItem(items, 2, 0, 'before')).toEqual([C, A, B]);
  });

  it('moves backward after the target', () => {
    expect(moveChecklistItem(items, 2, 0, 'after')).toEqual([A, C, B]);
  });

  it('moves forward after the target', () => {
    expect(moveChecklistItem(items, 0, 2, 'after')).toEqual([B, C, A]);
  });

  it('moves forward before the target', () => {
    expect(moveChecklistItem(items, 0, 2, 'before')).toEqual([B, A, C]);
  });

  it('does not mutate its input', () => {
    moveChecklistItem(items, 2, 0, 'before');
    expect(items).toEqual([A, B, C]);
  });

  it('returns the same array for the same index or an out-of-range index', () => {
    expect(moveChecklistItem(items, 1, 1, 'before')).toBe(items);
    expect(moveChecklistItem(items, 5, 0, 'before')).toBe(items);
    expect(moveChecklistItem(items, 0, -1, 'after')).toBe(items);
  });
});

describe('mergePickedAttachments', () => {
  it('reads new files into attachment records', async () => {
    const result = await mergePickedAttachments([], [pickedFile('n.txt', 3), pickedFile('p.png', 3, 'image/png')], fakeDeps());
    expect(result).toEqual({
      attachments: [
        { id: 'att_1', name: 'n.txt', mime: 'text/plain', sizeBytes: 3, kind: 'file', dataUrl: 'data:text/plain;base64,QUJD', createdAt: CREATED_AT },
        { id: 'att_2', name: 'p.png', mime: 'image/png', sizeBytes: 3, kind: 'image', dataUrl: 'data:image/png;base64,QUJD', createdAt: CREATED_AT }
      ],
      messages: []
    });
  });

  it('estimates the size from the data URL when the file reports 0 bytes', async () => {
    const result = await mergePickedAttachments([], [pickedFile('e.txt', 0)], fakeDeps());
    expect(result.attachments[0].sizeBytes).toBe(3);
  });

  it('skips files over the hard size limit with an error', async () => {
    const result = await mergePickedAttachments([], [pickedFile('huge.bin', (10 * MB) + 1)], fakeDeps());
    expect(result).toEqual({
      attachments: [],
      messages: [{ type: 'error', text: 'huge.bin exceeds the 10 MB limit.' }]
    });
  });

  it('stops at the per-task count limit with one error', async () => {
    const existing = Array.from({ length: 9 }, (_, i) => record({ id: `e${i}`, name: `e${i}.txt` }));
    const files = [pickedFile('x.txt', 3), pickedFile('y.txt', 3), pickedFile('z.txt', 3)];
    const result = await mergePickedAttachments(existing, files, fakeDeps());
    expect(result.attachments).toHaveLength(10);
    expect(result.attachments[9].name).toBe('x.txt');
    expect(result.messages).toEqual([{ type: 'error', text: 'Attachment limit reached (10 per task).' }]);
  });

  it('skips duplicates of existing attachments and within the same pick', async () => {
    const existing = [record({ name: 'a.txt', sizeBytes: 3 })];
    const files = [pickedFile('A.TXT', 3), pickedFile('b.txt', 3), pickedFile('b.txt', 3)];
    const result = await mergePickedAttachments(existing, files, fakeDeps());
    expect(result.attachments.map((item) => item.name)).toEqual(['a.txt', 'b.txt']);
    expect(result.messages).toEqual([
      { type: 'warning', text: 'A.TXT is already attached and was skipped.' },
      { type: 'warning', text: 'b.txt is already attached and was skipped.' }
    ]);
  });

  it('reports read failures and keeps going', async () => {
    const deps = fakeDeps({
      readFile: async (file) => {
        if (file.name === 'bad.txt') throw new Error('boom');
        if (file.name === 'silent.txt') throw new Error('');
        return 'data:text/plain;base64,QUJD';
      }
    });
    const result = await mergePickedAttachments([], [pickedFile('bad.txt', 3), pickedFile('silent.txt', 4), pickedFile('ok.txt', 5)], deps);
    expect(result.attachments.map((item) => item.name)).toEqual(['ok.txt']);
    expect(result.messages).toEqual([
      { type: 'error', text: 'bad.txt: boom' },
      { type: 'error', text: 'silent.txt: Failed to read file.' }
    ]);
  });

  it('does not mutate the existing array', async () => {
    const existing = [record()];
    await mergePickedAttachments(existing, [pickedFile('n.txt', 3)], fakeDeps());
    expect(existing).toHaveLength(1);
  });
});

describe('buildAttachmentWarnings', () => {
  it('returns nothing under every soft limit', () => {
    expect(buildAttachmentWarnings([record()], 0)).toEqual([]);
  });

  it('warns per large file', () => {
    expect(buildAttachmentWarnings([record({ name: 'big.bin', sizeBytes: 3 * MB })], 0)).toEqual([
      { type: 'warning', text: 'big.bin is large (3.0 MB). Embedded files can slow saves.' }
    ]);
  });

  it('warns when the task total passes the soft limit', () => {
    const size = Math.round(2.1 * MB);
    const items = Array.from({ length: 10 }, (_, i) => record({ id: `r${i}`, name: `r${i}.bin`, sizeBytes: size }));
    const messages = buildAttachmentWarnings(items, 0);
    expect(messages.filter((message) => message.text.includes('is large'))).toHaveLength(10);
    expect(messages.at(-1)).toEqual({ type: 'warning', text: 'This task has 21 MB of attachments. Saving may feel slower.' });
  });

  it('warns when the project estimate passes the soft limit', () => {
    expect(buildAttachmentWarnings([record({ sizeBytes: MB })], 25 * MB)).toEqual([
      { type: 'warning', text: 'This project is estimated at 26 MB of embedded attachments.' }
    ]);
  });

  it('skips the project estimate without board bytes', () => {
    expect(buildAttachmentWarnings([record({ sizeBytes: MB })], null)).toEqual([]);
  });
});

describe('buildTaskDraft', () => {
  it('normalises structured fields without splitting an assignee name', () => {
    const draft = buildTaskDraft({
      title: '  Ship it  ',
      description: '  Notes ',
      blocked: true,
      blockerReason: '  API down ',
      assignees: ['Alex', ' ', 'alex', 'Sam, Jo'],
      tags: ['bug', ' UI '],
      checklist: [{ text: ' First ', done: true }, { text: '   ', done: false }, { text: 'Second', done: false }],
      attachments: [record()],
      dueDate: ' 2026-03-05 ',
      priority: 'HIGH',
      effort: 'm',
      phaseId: ' p1 ',
      milestoneId: ''
    });

    expect(draft).toEqual({
      title: 'Ship it',
      description: 'Notes',
      assignees: ['Alex', 'Sam, Jo'],
      tags: ['bug', 'ui'],
      blocked: true,
      blockerReason: 'API down',
      checklist: [{ text: 'First', done: true }, { text: 'Second', done: false }],
      attachments: [record()],
      rawDueDate: '2026-03-05',
      dueDate: '2026-03-05',
      priority: 'high',
      effort: 'M',
      phaseId: 'p1',
      milestoneId: ''
    });
  });

  it('preserves checklist line breaks as one item and leaves the form untouched', () => {
    const form = {
      title: 'Task', assignees: ['Doe, Jane'], tags: [], attachments: [],
      checklist: [{ text: 'First line\nSecond line', done: true }]
    };
    const draft = buildTaskDraft(form);
    expect(draft.assignees).toEqual(['Doe, Jane']);
    expect(draft.checklist).toEqual(form.checklist);
    expect(draft.checklist).not.toBe(form.checklist);
    draft.checklist[0].done = false;
    expect(form.checklist[0].done).toBe(true);
  });

  it('keeps an invalid raw due date so validation can reject it', () => {
    const draft = buildTaskDraft({
      title: 'x', description: '', blocked: false, blockerReason: '', assignees: [], tags: [],
      checklist: [], attachments: [], dueDate: '05/03/2026', priority: '', effort: '', phaseId: '', milestoneId: ''
    });
    expect(draft.rawDueDate).toBe('05/03/2026');
    expect(draft.dueDate).toBe('');
    expect(draft.priority).toBe(null);
    expect(draft.effort).toBe(null);
  });
});
