import { fromAny } from '@total-typescript/shoehorn';
import type { Task } from '../../src/domain/types';
import { describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { translate } from '../../src/shared/i18n';
import { buildPaletteModel, type PaletteInput } from '../../src/features/portfolio/palette/paletteModel';

function board(id: string, title: string, tasks: any[], handle: unknown = {}) {
  const data = createEmptyProjectData(title);
  data.board.tasks.push(...tasks.map((task) => fromAny<Task, Record<string, unknown>>({
    description: '', archived: false, assignees: [], tags: [], checklist: [], priority: null, effort: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...task
  })));
  if (title === 'Website') data.extensions.roadmap = { version: 1, milestones: [{ id: 'launch', title: 'Public launch', dueDate: '2026-10-15' }], phases: [], sprints: [] };
  return { id, colorSeed: 0, handle, fileName: `${id}.json`, title, data };
}

function input(overrides: Partial<PaletteInput> = {}): PaletteInput {
  const state = createAppStore(fromAny({
    portfolioBoards: [
      board('web', 'Website', [
        { id: 15, title: 'Hero copy review', status: 'to-do', assignees: ['Rui'] },
        { id: 18, title: 'Old login page', status: 'backlog', archived: true }
      ]),
      board('app', 'Mobile App', [
        { id: 7, title: 'Login bug on Android', status: 'doing', assignees: ['Marta'], tags: ['auth'] },
        { id: 9, title: 'Push notification spec', status: 'to-do', assignees: ['Ana'] }
      ]),
      board('ops', 'Ops', [{ id: 3, title: 'Rotate API keys', status: 'to-do' }], null)
    ],
    portfolioTimelineSelection: { boardId: '', eventIndex: null }
  })).getState();
  return {
    query: '',
    stack: [],
    boards: state.portfolioBoards,
    rows: state.portfolioTasks,
    selectedBoardId: '',
    boardSearch: '',
    contextTask: null,
    recent: [],
    today: '2026-09-26',
    nowMinutes: 10 * 60 + 20,
    t: (key, values) => translate('en', key, values),
    language: 'en',
    ...overrides
  };
}

const labels = (model: ReturnType<typeof buildPaletteModel>, sectionId: string) =>
  model.sections.find((section) => section.id === sectionId)?.items.map((item) => item.label) || [];

describe('buildPaletteModel', () => {
  it('opens with actions for the context task, then recent items and commands', () => {
    const model = buildPaletteModel(input({
      contextTask: { boardId: 'web', taskId: 15 },
      recent: ['task:app:7', 'cmd:view-planner', 'task:gone:1']
    }));
    expect(model.sections.map((section) => section.id)).toEqual(['context', 'recent', 'commands']);
    expect(model.sections[0].title).toBe('Hero copy review');
    expect(labels(model, 'context')).toEqual(['Open details', 'Move to In Progress', 'Move to Done', 'Assign…', 'Plan in Day Planner…']);
    expect(labels(model, 'recent')).toEqual(['Login bug on Android', 'Go to Day Planner']);
  });

  it('puts "Filter board by" first, then matching tasks, projects and commands', () => {
    const model = buildPaletteModel(input({ query: 'login' }));
    expect(model.sections[0].items[0]).toMatchObject({ label: 'Filter board by "login"', action: { type: 'filterBoard', text: 'login' } });
    expect(labels(model, 'tasks')).toEqual(['Login bug on Android']);
    const task = model.sections.find((section) => section.id === 'tasks')!.items[0];
    expect(task.detail).toBe('#7 · Mobile App · In Progress · Marta');
    expect(task.ranges).toEqual([[0, 5]]);
    expect(task.action).toEqual({ type: 'openTask', boardId: 'app', taskId: 7 });
    expect(task.drill).toEqual({ kind: 'task', boardId: 'app', taskId: 7 });
  });

  it('ranks matching actions of the context task above everything else', () => {
    const model = buildPaletteModel(input({ query: 'assign', contextTask: { boardId: 'app', taskId: 7 } }));
    expect(model.sections[0]).toMatchObject({ id: 'context', title: 'Login bug on Android' });
    expect(labels(model, 'context')).toEqual(['Assign…']);
    expect(model.sections[1].id).toBe('filter');
    expect(buildPaletteModel(input({ query: 'login', contextTask: { boardId: 'app', taskId: 7 } })).sections[0].id).toBe('filter');
  });

  it('finds tasks by #id, tag, assignee and project, and roadmap items and projects by name', () => {
    expect(labels(buildPaletteModel(input({ query: '#9' })), 'tasks')).toEqual(['Push notification spec']);
    expect(labels(buildPaletteModel(input({ query: '#auth' })), 'tasks')).toEqual(['Login bug on Android']);
    expect(labels(buildPaletteModel(input({ query: 'marta' })), 'tasks')).toEqual(['Login bug on Android']);
    expect(labels(buildPaletteModel(input({ query: 'launch' })), 'roadmap')).toEqual(['Public launch']);
    expect(labels(buildPaletteModel(input({ query: 'mobile' })), 'projects')).toEqual(['Mobile App']);
  });

  it('lists commands with their keyboard shortcuts, and Roadmap only with a selected project', () => {
    const planner = buildPaletteModel(input({ query: 'planner' })).sections.find((section) => section.id === 'commands')!.items[0];
    expect(planner).toMatchObject({ label: 'Go to Day Planner', hint: ['P'], action: { type: 'command', id: 'view-planner' } });
    expect(labels(buildPaletteModel(input({ query: 'roadmap' })), 'commands')).toEqual([]);
    expect(labels(buildPaletteModel(input({ query: 'roadmap', selectedBoardId: 'web' })), 'commands')).toEqual(['Go to Roadmap']);
  });

  it('offers help on using the palette', () => {
    expect(labels(buildPaletteModel(input({ query: 'how to use' })), 'commands')).toEqual(['How to use the command palette']);
  });

  it('offers clearing the board filter when one is active', () => {
    expect(labels(buildPaletteModel(input({ boardSearch: 'x' })), 'commands')).toContain('Clear board filter "x"');
  });

  it('shows a task\'s actions, and only Open details for read-only projects', () => {
    const model = buildPaletteModel(input({ stack: [{ kind: 'task', boardId: 'app', taskId: 7 }] }));
    expect(model.breadcrumbs).toEqual(['#7 Login bug on Android']);
    expect(labels(model, 'actions')).toEqual([
      'Open details', 'Move to Backlog', 'Move to To Do', 'Move to Done', 'Move to…',
      'Assign…', 'Set priority…', 'Plan in Day Planner…', 'Edit', 'Archive'
    ]);
    const readOnly = buildPaletteModel(input({ stack: [{ kind: 'task', boardId: 'ops', taskId: 3 }] }));
    expect(labels(readOnly, 'actions')).toEqual(['Open details']);
  });

  it('walks through active team assignment without offering arbitrary new people', () => {
    const model = buildPaletteModel(input({
      stack: [{ kind: 'task', boardId: 'app', taskId: 7 }, { kind: 'step', step: 'assignee', boardId: 'app', taskId: 7 }],
      query: 'a'
    }));
    expect(model.breadcrumbs).toEqual(['#7 Login bug on Android', 'Assign']);
    const items = model.sections[0].items;
    expect(items.map((item) => [item.label, item.checked])).toEqual([
      ['Ana', false], ['Marta', true]
    ]);
    expect(items[1].action).toMatchObject({ type: 'toggleAssignee', boardId: 'app', taskId: 7 });
    expect(items[1].action).toHaveProperty('name', expect.stringMatching(/^member_/));
  });

  it('offers planning slots later today and tomorrow', () => {
    const model = buildPaletteModel(input({
      stack: [{ kind: 'task', boardId: 'app', taskId: 7 }, { kind: 'step', step: 'plan', boardId: 'app', taskId: 7 }]
    }));
    expect(model.sections[0].items.map((item) => item.label)).toEqual(['Today 11:00', 'Today 14:00', 'Today 16:00', 'Tomorrow 09:00', 'Tomorrow 14:00']);
    expect(model.sections[0].items[3].action).toEqual({ type: 'planTask', boardId: 'app', taskId: 7, date: '2026-09-27', startMinutes: 540 });
  });

  it('parses quick create into a preview and a create action', () => {
    const model = buildPaletteModel(input({ query: '+ Fix crash @ma !high in:mobile', contextTask: { boardId: 'web', taskId: 15 } }));
    expect(model.preview).toMatchObject({ title: 'Fix crash', assignees: ['Marta'], priority: 'high', projectId: 'app', projectTitle: 'Mobile App' });
    expect(model.sections[0].items[0]).toMatchObject({
      label: 'Create "Fix crash" in Mobile App',
      action: { type: 'createTask', boardId: 'app', fields: { title: 'Fix crash', assignees: ['Marta'], priority: 'high' } }
    });
    expect(buildPaletteModel(input({ query: '+ ' })).sections[0].items).toEqual([]);
  });

  it('creates in the context project by default, never in a read-only one', () => {
    expect(buildPaletteModel(input({ query: '+ x', contextTask: { boardId: 'web', taskId: 15 } })).preview!.projectId).toBe('web');
    expect(buildPaletteModel(input({ query: '+ x', selectedBoardId: 'ops' })).preview!.projectId).toBe('web');
  });

  it('plans a matching task directly when a time is given, or opens the time step', () => {
    const withTime = buildPaletteModel(input({ query: 'plan push 9:30' }));
    expect(withTime.sections[0].items[0]).toMatchObject({
      label: 'Push notification spec',
      action: { type: 'planTask', boardId: 'app', taskId: 9, date: '2026-09-26', startMinutes: 570 }
    });
    const noTime = buildPaletteModel(input({ query: 'plan push' }));
    expect(noTime.sections[0].items[0].action).toEqual({
      type: 'push', frames: [{ kind: 'task', boardId: 'app', taskId: 9 }, { kind: 'step', step: 'plan', boardId: 'app', taskId: 9 }]
    });
  });

  it('suggests creating a task when nothing matches', () => {
    const model = buildPaletteModel(input({ query: 'zzzz' }));
    expect(model.sections.map((section) => section.id)).toEqual(['filter', 'create']);
    expect(model.sections[1].items[0].action).toEqual({ type: 'setQuery', query: '+ zzzz' });
  });
});
