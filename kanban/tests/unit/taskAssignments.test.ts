import { describe, expect, it } from 'vitest';
import { normalizeTask } from '../../src/domain/task';
import { editTaskParticipant, removeTaskParticipant, setTaskResponsible } from '../../src/domain/taskAssignments';
import { validateBoardData } from '../../src/domain/board';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { readFileSync } from 'node:fs';
import { captureTaskTimelineSnapshot, recordTaskTimelineEvent, reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import { personNameFilter, NO_PERSON_FILTER } from '../../src/domain/peopleFilters';
import { DEFAULT_PORTFOLIO_FILTERS, taskMatchesPortfolioFilters } from '../../src/domain/portfolioFilters';

describe('workitem participants and responsible person', () => {
  it('selecting, changing and clearing the responsible person preserves participation and status', () => {
    const task = normalizeTask({ id: 1, title: 'Plan', status: 'doing', assignees: [' Ana ', 'ana', 'Rui'] });
    expect(task.responsible).toBe('');
    const assigned = setTaskResponsible(task, '  ANA  ');
    expect(assigned).toMatchObject({ assignees: ['Ana', 'Rui'], responsible: 'Ana', status: 'doing' });
    const changed = setTaskResponsible(assigned, ' Marta ');
    expect(changed).toMatchObject({ assignees: ['Ana', 'Rui', 'Marta'], responsible: 'Marta' });
    expect(setTaskResponsible(changed, '')).toMatchObject({ assignees: ['Ana', 'Rui', 'Marta'], responsible: '', status: 'doing' });
    expect(task.assignees).toEqual(['Ana', 'Rui']);
  });

  it('correcting the responsible participant updates only that item; removal needs explicit confirmation', () => {
    const task = normalizeTask({ id: 1, title: 'Plan', assignees: ['Ana', 'Rui'], responsible: 'Ana' });
    const renamed = editTaskParticipant(task, 0, ' Ana Silva ');
    expect(renamed).toMatchObject({ assignees: ['Ana Silva', 'Rui'], responsible: 'Ana Silva' });
    expect(task.responsible).toBe('Ana');
    expect(removeTaskParticipant(renamed, 0)).toEqual({ needsConfirmation: true, task: renamed });
    expect(removeTaskParticipant(renamed, 0, true)).toEqual({ needsConfirmation: false, task: { ...renamed, assignees: ['Rui'], responsible: '' } });
    expect(editTaskParticipant(renamed, 0, 'rui')).toMatchObject({ assignees: ['rui'], responsible: 'rui' });
    expect(editTaskParticipant(renamed, 0, '')).toMatchObject({ assignees: ['Ana Silva', 'Rui'], responsible: 'Ana Silva' });
  });

  it('migrates v1 files without choosing a responsible person and round-trips assignments and old history', () => {
    const input = JSON.parse(readFileSync(new URL('../fixtures/assignments-v1.board.json', import.meta.url), 'utf8'));
    validateBoardData(input);
    const migrated = serializeBoardDataFromObject(input);
    expect(migrated.meta.schemaVersion).toBe(5);
    expect(migrated.board.tasks[0]).toMatchObject({ id: 17, assignees: ['Ana', 'Rui'], responsible: '' });
    migrated.board.tasks[0] = setTaskResponsible(migrated.board.tasks[0], 'Marta');
    migrated.extensions.project!.members.push({ id: 'marta', name: 'Marta' });
    const reopened = serializeBoardDataFromObject(JSON.parse(JSON.stringify(migrated)));
    validateBoardData(reopened);
    expect(reopened.board.tasks[0]).toMatchObject({ assignees: ['Ana', 'Rui', 'Marta'], responsible: 'Marta', responsibleId: 'marta' });
    expect(reopened.extensions).toMatchObject(input.extensions);
    const invalid = structuredClone(reopened);
    invalid.board.tasks[0].responsible = 'Unknown';
    expect(() => validateBoardData(invalid)).toThrow(/participant/i);
  });

  it('replays assignment changes over a legacy baseline without altering old events', () => {
    const input = JSON.parse(readFileSync(new URL('../fixtures/assignments-v1.board.json', import.meta.url), 'utf8'));
    const board = serializeBoardDataFromObject(input);
    const before = captureTaskTimelineSnapshot(board, 17);
    board.board.tasks[0] = setTaskResponsible(board.board.tasks[0], 'Marta');
    recordTaskTimelineEvent(board, before, board.board.tasks[0]);
    const latest = reconstructBoardStateFromTimeline(board, 1);
    expect(latest.board.tasks[0]).toMatchObject({ assignees: ['Ana', 'Rui', 'Marta'], responsible: 'Marta' });
    expect(reconstructBoardStateFromTimeline(board, 0).board.tasks[0]).toMatchObject({ assignees: ['Ana', 'Rui'], responsible: '' });
    expect(board.extensions.timeline?.events[0]).toEqual(input.extensions.timeline.events[0]);
  });

  it('treats every free-text name as a name, even names matching filter control values', () => {
    const task = normalizeTask({ id: 1, title: 'Names', assignees: ['__none__', 'name:Ana'], responsible: '__none__' });
    expect(taskMatchesPortfolioFilters(task, { ...DEFAULT_PORTFOLIO_FILTERS, responsible: personNameFilter('__none__'), assignee: personNameFilter('name:Ana') })).toBe(true);
    expect(taskMatchesPortfolioFilters(task, { ...DEFAULT_PORTFOLIO_FILTERS, responsible: NO_PERSON_FILTER })).toBe(false);
    expect(taskMatchesPortfolioFilters(normalizeTask({ id: 2, title: 'Empty' }), { ...DEFAULT_PORTFOLIO_FILTERS, assignee: NO_PERSON_FILTER, responsible: NO_PERSON_FILTER })).toBe(true);
  });
});
