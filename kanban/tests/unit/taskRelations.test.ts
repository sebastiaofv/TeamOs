import { describe, expect, it } from 'vitest';
import { createEmptyProjectData, validateBoardData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { serializeBoardDataFromObject } from '@/domain/serialize';
import { ROADMAP_VERSION } from '@/domain/constants';
import fixture from '../fixtures/task-relations-v1.board.json';
import manualBoard from '../../test-board/us-2.board.json';
import { BoardRepository } from '@/infrastructure/persistence/boardRepository';
import { getRelations, getTaskRelations, isTaskBlocked, removeTaskRelation, setTaskRelation } from '@/domain/taskRelations';

function project() {
  const data = createEmptyProjectData('Relations');
  data.board.tasks = [1, 2, 3].map((id) => normalizeTask({ id, title: `Item ${id}`, status: 'backlog' }));
  return data;
}

describe('workitem relations', () => {
  it('validates and round-trips the manual US2 board with full responsible names and compact relation scenarios', () => {
    validateBoardData(manualBoard);
    const saved = serializeBoardDataFromObject(manualBoard);
    validateBoardData(saved);
    expect(saved.board.tasks.map((task) => task.id)).toEqual(manualBoard.board.tasks.map((task) => task.id));
    expect(saved.extensions.taskRelations).toEqual(manualBoard.extensions.taskRelations);
    expect(saved.board.tasks.find((task) => task.id === 206)).toMatchObject({ responsible: 'Marta Sofia Costa', assignees: ['Ana', 'Marta Sofia Costa'] });
    expect(saved.board.tasks.find((task) => task.id === 207)).toMatchObject({ responsible: '', assignees: ['Ana'] });
  });
  it('imports the versioned file fixture and its legacy equivalent without losing IDs, roadmap, manual blocking or unknown extensions', async () => {
    for (const legacy of [false, true]) {
      const input = structuredClone(fixture);
      if (legacy) Reflect.deleteProperty(input.extensions, 'taskRelations');
      const record = await BoardRepository.createRecordFromFile({ file: { name: 'fixture.board.json', size: 0, lastModified: 0, text: async () => JSON.stringify(input) } });
      const saved = BoardRepository.serialize(record.data);
      BoardRepository.validate(saved);
      expect(saved.board.tasks.map((task) => task.id)).toEqual([41, 72]);
      expect(saved.board.tasks[0]).toMatchObject({ assignees: ['Ana'], archived: true, description: 'Preserve original data', phaseId: 'phase', milestoneId: 'milestone', checklist: [{ text: 'Original step', done: false }] });
      expect(saved.board.tasks[1]).toMatchObject({ blocked: true, blockerReason: 'Awaiting decision' });
      expect(saved.extensions.roadmap).toEqual({ ...fixture.extensions.roadmap, version: ROADMAP_VERSION });
      expect(saved.extensions.customExtension).toEqual({ preserve: 'Unknown extension data' });
      expect(saved.extensions.taskRelations).toEqual(legacy ? undefined : fixture.extensions.taskRelations);
    }
  });
  it('preserves versioned relations and legacy projects on JSON round trips, rejecting incoherent imported graphs', () => {
    const legacy = project();
    const savedLegacy = serializeBoardDataFromObject(legacy);
    expect(savedLegacy.extensions.taskRelations).toBeUndefined();
    expect(savedLegacy.board.tasks.map((task) => task.id)).toEqual([1, 2, 3]);
    setTaskRelation(legacy, 1, 2, 'blocks');
    const saved = serializeBoardDataFromObject(JSON.parse(JSON.stringify(legacy)));
    validateBoardData(saved);
    expect(saved.extensions.taskRelations).toEqual({ version: 1, relations: [{ sourceId: 1, targetId: 2, kind: 'blocks' }] });
    expect(isTaskBlocked(saved, 2)).toBe(true);
    expect(serializeBoardDataFromObject({ ...saved, extensions: { taskRelations: { version: 1, relations: [] } } }).extensions.taskRelations).toBeUndefined();
    for (const invalid of [
      { version: 2, relations: [] },
      { version: 1, relations: [{ sourceId: 1, targetId: 99, kind: 'blocks' }] },
      { version: 1, relations: [{ sourceId: 1, targetId: 2, kind: 'blocks' }, { sourceId: 2, targetId: 1, kind: 'blocks' }] },
      { version: 1, relations: [{ sourceId: 1, targetId: 2, kind: 'blocks' }, { sourceId: 2, targetId: 3, kind: 'blocks' }, { sourceId: 3, targetId: 1, kind: 'blocks' }] }
    ]) {
      const imported = { ...saved, extensions: { taskRelations: invalid } };
      expect(() => validateBoardData(imported)).toThrow();
      expect(() => serializeBoardDataFromObject(imported)).toThrow();
    }
  });
  it('rejects invalid pairs and cycles atomically, and allows explicit replacement and removal', () => {
    const data = project();
    setTaskRelation(data, 1, 2, 'blocks');
    setTaskRelation(data, 2, 3, 'blocks');
    const before = structuredClone(data);
    expect(() => setTaskRelation(data, 1, 1, 'related')).toThrow('self');
    expect(() => setTaskRelation(data, 1, 99, 'related')).toThrow('missing');
    expect(() => setTaskRelation(data, 2, 1, 'related')).toThrow('duplicate');
    expect(() => setTaskRelation(data, 3, 1, 'blocks')).toThrow('cycle');
    expect(data).toEqual(before);
    setTaskRelation(data, 2, 1, 'blocks', true);
    expect(getTaskRelations(data, 1).blockedBy.map((task) => task.id)).toEqual([2]);
    removeTaskRelation(data, 1, 2);
    expect(isTaskBlocked(data, 1)).toBe(false);
    expect(data.board.tasks).toHaveLength(3);
    expect(getRelations(data)).toEqual([{ sourceId: 2, targetId: 3, kind: 'blocks' }]);
  });
  it('shows dependencies in both directions and derives blocking from all direct blockers independently of manual blocking', () => {
    const data = project();
    setTaskRelation(data, 1, 2, 'blocks');
    setTaskRelation(data, 2, 3, 'blockedBy');
    expect(getTaskRelations(data, 1).blocks.map((task) => task.id)).toEqual([2]);
    expect(getTaskRelations(data, 2).blockedBy.map((task) => task.id)).toEqual([1, 3]);
    expect(isTaskBlocked(data, 2)).toBe(true);
    data.board.tasks[0].status = 'done';
    data.board.tasks[2].archived = true;
    expect(isTaskBlocked(data, 2)).toBe(true);
    data.board.tasks[2].status = 'done';
    expect(isTaskBlocked(data, 2)).toBe(false);
    data.board.tasks[0].status = 'doing';
    expect(isTaskBlocked(data, 2)).toBe(true);
    data.board.tasks[1].blocked = true;
    data.board.tasks[1].blockerReason = 'Manual';
    data.board.tasks[0].status = 'done';
    expect(isTaskBlocked(data, 2)).toBe(true);
    expect(data.board.tasks[1].status).toBe('backlog');
  });
});
