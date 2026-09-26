import { describe, expect, it } from 'vitest';
import { matchRanges, scoreText } from '../../src/features/portfolio/palette/paletteText';
import { parseQuickCreate } from '../../src/features/portfolio/palette/quickCreate';

describe('scoreText', () => {
  it('ranks prefix above word start above substring above scattered letters', () => {
    const prefix = scoreText('Login bug', 'log');
    const wordStart = scoreText('Fix login crash', 'log');
    const substring = scoreText('Catalogue', 'log');
    const scattered = scoreText('Large old gift', 'log');
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(scattered);
    expect(scattered).toBeGreaterThan(0);
  });

  it('is case-insensitive and ignores surrounding spaces', () => {
    expect(scoreText('Rotate API keys', '  api ')).toBeGreaterThan(0);
  });

  it('returns 0 when the letters are not all present in order', () => {
    expect(scoreText('Hero copy', 'xyz')).toBe(0);
    expect(scoreText('abc', 'cba')).toBe(0);
  });

  it('matches everything for an empty query', () => {
    expect(scoreText('Anything', '')).toBeGreaterThan(0);
  });
});

describe('matchRanges', () => {
  it('returns the substring range when there is one', () => {
    expect(matchRanges('Fix login crash', 'LOGIN')).toEqual([[4, 9]]);
  });

  it('returns merged letter ranges for scattered matches', () => {
    expect(matchRanges('Large old gift', 'log')).toEqual([[0, 1], [6, 7], [10, 11]]);
    expect(matchRanges('abcd', 'abd')).toEqual([[0, 2], [3, 4]]);
  });

  it('returns no ranges when nothing matches or the query is empty', () => {
    expect(matchRanges('Hero', 'xyz')).toEqual([]);
    expect(matchRanges('Hero', '')).toEqual([]);
  });
});

describe('parseQuickCreate', () => {
  const context = {
    people: ['Ana', 'Marta', 'Bruno'],
    projects: [{ id: 'web', title: 'Website' }, { id: 'app', title: 'Mobile App' }],
    defaultProjectId: 'web',
    today: '2026-09-26' // a Saturday
  };

  it('reads every token and keeps the rest as the title', () => {
    expect(parseQuickCreate('+ Fix login crash @ma !high #auth #bug ~s due:fri in:mobile', context)).toEqual({
      title: 'Fix login crash',
      assignees: ['Marta'],
      priority: 'high',
      tags: ['auth', 'bug'],
      effort: 'S',
      dueDate: '2026-10-02',
      projectId: 'app',
      warnings: []
    });
  });

  it('accepts short priority forms and several assignees', () => {
    const draft = parseQuickCreate('+Ship it !m @ana @Bruno', context);
    expect(draft.priority).toBe('medium');
    expect(draft.assignees).toEqual(['Ana', 'Bruno']);
    expect(draft.projectId).toBe('web');
  });

  it('resolves relative and ISO due dates', () => {
    expect(parseQuickCreate('+ a due:today', context).dueDate).toBe('2026-09-26');
    expect(parseQuickCreate('+ a due:tomorrow', context).dueDate).toBe('2026-09-27');
    expect(parseQuickCreate('+ a due:sat', context).dueDate).toBe('2026-09-26');
    expect(parseQuickCreate('+ a due:monday', context).dueDate).toBe('2026-09-28');
    expect(parseQuickCreate('+ a due:2026-12-01', context).dueDate).toBe('2026-12-01');
  });

  it('warns about new people, unknown projects and dates, keeping safe defaults', () => {
    const draft = parseQuickCreate('+ a @zoe in:nowhere due:someday', context);
    expect(draft.assignees).toEqual(['zoe']);
    expect(draft.projectId).toBe('web');
    expect(draft.dueDate).toBe('');
    expect(draft.warnings).toEqual([
      { kind: 'newPerson', value: 'zoe' },
      { kind: 'unknownProject', value: 'nowhere' },
      { kind: 'unknownDate', value: 'someday' }
    ]);
  });

  it('leaves unrecognised symbols in the title', () => {
    expect(parseQuickCreate('+ Email @ support!', context).title).toBe('Email @ support!');
    expect(parseQuickCreate('+ ~huge #', context).title).toBe('~huge #');
  });
});
