import { describe, expect, it } from 'vitest';
import { matchRanges, scoreText } from '../../src/features/portfolio/palette/paletteText';
import { chooseQuickCreateAssignee, parseQuickCreate } from '../../src/features/portfolio/palette/quickCreate';

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
    peopleForProject: (projectId: string) => projectId === 'app' ? ['Marta'] : ['Ana', 'Bruno'],
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
      warnings: [],
      ambiguousAssignees: []
    });
  });

  it('accepts short priority forms and several assignees', () => {
    const draft = parseQuickCreate('+Ship it !m @ana @Bruno', context);
    expect(draft.priority).toBe('medium');
    expect(draft.assignees).toEqual(['Ana', 'Bruno']);
    expect(draft.projectId).toBe('web');
  });

  it('resolves people only in the final destination, in either token order', () => {
    const localContext = {
      ...context,
      peopleForProject: (projectId: string) => projectId === 'app' ? ['Ana Maria'] : ['Ana Silva']
    };
    for (const query of ['+ Ship @ana in:mobile', '+ Ship in:mobile @ana', '+ Ship in:web @ana in:mobile']) {
      const draft = parseQuickCreate(query, localContext);
      expect(draft).toMatchObject({ title: 'Ship', projectId: 'app', assignees: ['Ana Maria'], warnings: [], ambiguousAssignees: [] });
    }
    expect(parseQuickCreate('+ Ship @ma', context)).toMatchObject({
      assignees: ['ma'], warnings: [{ kind: 'newPerson', value: 'ma' }]
    });
  });

  it('prefers an exact name over longer matches and resolves only unique prefixes', () => {
    const localContext = { ...context, peopleForProject: () => ['Ana', 'Ana Silva', 'Marta', 'marta'] };
    expect(parseQuickCreate('+ Ship @ANA @mar', localContext)).toMatchObject({
      assignees: ['Ana', 'Marta'], ambiguousAssignees: [], warnings: []
    });
  });

  it('leaves ambiguous people unassigned until a choice, preserving the other tokens', () => {
    const localContext = { ...context, peopleForProject: () => ['Ana Silva', 'Ana Maria', 'Bruno'] };
    const query = '  + Ship @an !h @br in:mobile @an';
    const draft = parseQuickCreate(query, localContext);
    expect(draft.assignees).toEqual(['Bruno']);
    expect(draft.warnings).toEqual([]);
    expect(draft.ambiguousAssignees).toHaveLength(2);
    expect(draft.ambiguousAssignees[0]).toMatchObject({ value: 'an', candidates: ['Ana Silva', 'Ana Maria'] });
    const chosen = chooseQuickCreateAssignee(query, draft.ambiguousAssignees[0], 'Ana Maria');
    expect(chosen).toBe('  + Ship @"Ana Maria" !h @br in:mobile @an');
    const next = parseQuickCreate(chosen, localContext);
    expect(next).toMatchObject({ title: 'Ship', assignees: ['Ana Maria', 'Bruno'], priority: 'high', projectId: 'app' });
    expect(next.ambiguousAssignees).toHaveLength(1);
    const resolved = parseQuickCreate(chooseQuickCreateAssignee(chosen, next.ambiguousAssignees[0], 'Ana Silva'), localContext);
    expect(resolved).toMatchObject({ assignees: ['Ana Maria', 'Bruno', 'Ana Silva'], ambiguousAssignees: [] });
  });

  it('round-trips names with quotes and treats malformed quoted tokens as title text', () => {
    const name = 'Ana "A" Silva';
    const localContext = { ...context, peopleForProject: () => [name, 'Ana Maria'] };
    const query = '+ Ship @an';
    const draft = parseQuickCreate(query, localContext);
    expect(parseQuickCreate(chooseQuickCreateAssignee(query, draft.ambiguousAssignees[0], name), localContext).assignees).toEqual([name]);
    expect(parseQuickCreate('+ Ship @"Ana\\q"', localContext).title).toBe('Ship @"Ana\\q"');
    expect(parseQuickCreate('+ Ship @"Ana"suffix', localContext).title).toBe('Ship @"Ana"suffix');
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
