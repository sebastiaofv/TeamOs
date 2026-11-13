import { describe, expect, it } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { canEditProjectWorkitems, canTransferProjectFile, projectAccessBlockers, type ProjectAccessState } from '../../src/features/portfolio/queries/projectAccess';
import { createProjectSaveState, type ProjectSaveState } from '../../src/infrastructure/persistence/projectSaveLifecycle';
import { createEmptyProjectData } from '../../src/domain/board';
import { appendTimelineEvent } from '../../src/domain/timeline';

function projectData(events: number) {
  const data = createEmptyProjectData('Project');
  for (let index = 0; index < events; index += 1) appendTimelineEvent(data, { kind: 'board.settings.updated', entityType: 'board', entityId: 'board', summary: `Event ${index}` });
  return data;
}

function state({ handle = true, events = 1, selected = null as number | null, save = createProjectSaveState() as ProjectSaveState } = {}): ProjectAccessState {
  return fromPartial({
    portfolioBoards: [{ id: 'p1', handle: handle ? {} : null, data: projectData(events) }],
    portfolioTimelineSelection: { boardId: 'p1', eventIndex: selected },
    projectSaveStateById: new Map([['p1', save]])
  });
}
const conflict: ProjectSaveState = { ...createProjectSaveState(), phase: { kind: 'conflict', source: 'merge', merge: null, error: '' } };
const unreachable: ProjectSaveState = { ...createProjectSaveState(), phase: { kind: 'unreachable', error: 'Gone' } };

describe('project access', () => {
  it('allows everything for a current, writable project', () => {
    const blockers = projectAccessBlockers(state(), 'p1');
    expect(blockers).toEqual([]);
    expect(canEditProjectWorkitems(blockers)).toBe(true);
    expect(canTransferProjectFile(blockers)).toBe(true);
  });

  it('lists every reason a project is read-only', () => {
    expect(projectAccessBlockers(state(), 'missing')).toEqual(['missing']);
    expect(projectAccessBlockers(state({ handle: false }), 'p1')).toEqual(['noFile']);
    expect(projectAccessBlockers(state({ events: 3, selected: 0 }), 'p1')).toEqual(['history']);
    expect(projectAccessBlockers(state(), 'p1', { transferLocked: true })).toEqual(['transferLocked']);
    expect(projectAccessBlockers(state({ save: conflict }), 'p1')).toEqual(['conflict']);
    expect(projectAccessBlockers(state({ save: unreachable }), 'p1')).toEqual(['unreachable']);
  });

  it('keeps workitem edits local during a conflict or an unreachable file, but blocks transfers', () => {
    for (const save of [conflict, unreachable]) {
      const blockers = projectAccessBlockers(state({ save }), 'p1');
      expect(canEditProjectWorkitems(blockers)).toBe(true);
      expect(canTransferProjectFile(blockers)).toBe(false);
    }
  });

  it('blocks workitem edits, but not the transfer writing it, while a transfer holds the lock', () => {
    const blockers = projectAccessBlockers(state(), 'p1', { transferLocked: true });
    expect(canEditProjectWorkitems(blockers)).toBe(false);
    expect(canTransferProjectFile(blockers)).toBe(true);
  });
});
