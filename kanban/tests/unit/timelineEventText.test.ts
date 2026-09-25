import { fromPartial } from '@total-typescript/shoehorn';
import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '../../src/domain/types';
import { buildTaskTimelineEvent } from '../../src/domain/timeline';
import { describeTimelineEvent } from '../../src/features/portfolio/timeline/timelineEventText';

const event = (kind: string, summary: string, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: 'e', at: '2026-09-25T10:00:00.000Z', kind, entityType: 'board', entityId: 'board', summary, ...extra
});

describe('describeTimelineEvent', () => {
  it('translates fixed event wording and keeps names as typed', () => {
    expect(describeTimelineEvent(event('board.baseline', 'Baseline snapshot created'), 'pt')).toBe('Cópia de base criada');
    expect(describeTimelineEvent(event('board.restored', 'Board restored from timeline'), 'pt'))
      .toBe('Projeto restaurado a partir da linha temporal');
    expect(describeTimelineEvent(event('task.updated', 'Task updated: Ship: v2'), 'pt')).toBe('Tarefa atualizada: Ship: v2');
    expect(describeTimelineEvent(event('task.status.changed', 'Status changed: Write spec'), 'pt')).toBe('Estado alterado: Write spec');
  });

  it('keeps the saved English wording in English', () => {
    expect(describeTimelineEvent(event('task.created', 'Task created: Write spec'), 'en')).toBe('Task created: Write spec');
  });

  it('matches the summaries the domain writes for every task event kind', () => {
    const task = fromPartial<any>({ id: 3, title: 'Write spec', status: 'to-do', archived: false });
    const cases: [any, any, string][] = [
      [null, task, 'Tarefa criada: Write spec'],
      [task, null, 'Tarefa eliminada: Write spec'],
      [task, { ...task, archived: true }, 'Tarefa arquivada: Write spec'],
      [{ ...task, archived: true }, task, 'Tarefa restaurada: Write spec'],
      [task, { ...task, status: 'doing' }, 'Estado alterado: Write spec'],
      [task, { ...task, title: 'Write spec' , description: 'x' }, 'Tarefa atualizada: Write spec']
    ];
    cases.forEach(([before, after, expected]) => {
      const input = buildTaskTimelineEvent(before, after)!;
      expect(describeTimelineEvent(event(input.kind, input.summary), 'pt')).toBe(expected);
    });
  });

  it('translates roadmap wording, including the item type and action words', () => {
    expect(describeTimelineEvent(event('roadmap.updated', 'Sprint created: Sprint 12'), 'pt')).toBe('Sprint criado: Sprint 12');
    expect(describeTimelineEvent(event('roadmap.updated', 'Milestone deleted: Launch'), 'pt')).toBe('Marco eliminado: Launch');
    expect(describeTimelineEvent(event('roadmap.bulk-assigned', 'Added 2 selected tasks to sprint: Sprint 12'), 'pt'))
      .toBe('2 tarefas selecionadas adicionadas ao sprint: Sprint 12');
  });

  it('translates entries that were saved in Portuguese back to English', () => {
    expect(describeTimelineEvent(event('roadmap.updated', 'Fase atualizado: Build'), 'en')).toBe('Phase updated: Build');
  });

  it('rebuilds planner wording with a localized date from the stored block', () => {
    const block = { id: 'b', taskId: 1, date: '2026-09-25', start: '09:00', end: '10:00' };
    const planned = event('planner.block.added', 'Planned "Write "spec"" on Fri 25 Sept, 09:00–10:00', {
      entityType: 'task', entityId: '1', changes: { block: { before: null, after: block } }
    });
    expect(describeTimelineEvent(planned, 'en')).toBe('Planned "Write "spec"" on Fri 25 Sept, 09:00–10:00');
    expect(describeTimelineEvent(planned, 'pt')).toMatch(/^"Write "spec"" planeada para sexta.*25.*, 09:00–10:00$/);

    const removed = event('planner.block.removed', 'Removed "Write spec" from the plan (Fri 25 Sept, 09:00–10:00)', {
      entityType: 'task', entityId: '1', changes: { block: { before: block, after: null } }
    });
    expect(describeTimelineEvent(removed, 'pt')).toContain('"Write spec" removida do plano');
  });

  it('falls back to the saved text when the wording is not recognised', () => {
    expect(describeTimelineEvent(event('task.updated', 'Something custom'), 'pt')).toBe('Something custom');
    expect(describeTimelineEvent(event('plugin.thing', 'Plugin did a thing'), 'pt')).toBe('Plugin did a thing');
  });
});
