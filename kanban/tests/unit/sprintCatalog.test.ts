import { describe, expect, it } from 'vitest';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { readFileSync } from 'node:fs';
import { registerSprintCreation } from '../../src/domain/sprintCatalog';
import { reconstructBoardStateFromTimeline } from '../../src/domain/timeline';

describe('sprint creation identities', () => {
  it('migrates legacy sprints in their existing order without inventing creation dates and preserves identities after save/reopen', () => {
    const legacy = JSON.parse(readFileSync(new URL('../fixtures/sprints-legacy-v1.board.json', import.meta.url), 'utf8'));
    validateBoardData(legacy);
    const migrated = serializeBoardDataFromObject(legacy);
    expect(migrated.extensions.sprintCatalog).toEqual({ version: 1, lastNumber: 2, entries: [
      { sprintId: 'later-dates', number: 1, createdAt: null }, { sprintId: 'earlier-dates', number: 2, createdAt: null }
    ] });
    migrated.extensions.roadmap!.sprints.reverse();
    migrated.extensions.roadmap!.sprints[0].title = 'Renamed';
    const reopened = serializeBoardDataFromObject(JSON.parse(JSON.stringify(migrated)));
    validateBoardData(reopened);
    expect(reopened.extensions.sprintCatalog).toEqual(migrated.extensions.sprintCatalog);
    expect(legacy.extensions.sprintCatalog).toBeUndefined();
    expect(reopened.extensions.custom).toEqual({ preserve: 'legacy extension' });
  });

  it('reserves legacy sprints retained only in history before allocating a new identity', () => {
    const legacy = createEmptyProjectData('Legacy history');
    const live = { id: 'live', title: 'Live', startDate: '2026-10-01', endDate: '2026-10-14' };
    const deleted = { id: 'delivery', title: 'Delivery', startDate: '2026-09-01', endDate: '2026-09-14' };
    legacy.extensions.roadmap = { version: 1, phases: [], milestones: [], sprints: [live] };
    const latest = structuredClone(legacy);
    const baseline = structuredClone(legacy);
    baseline.extensions.roadmap!.sprints = [deleted, live];
    legacy.extensions.timeline = { version: 1, baselineEventId: 'baseline', events: [
      { id: 'baseline', at: '2026-09-01T09:00:00Z', kind: 'board.baseline', entityType: 'board', entityId: 'board', summary: 'Legacy baseline', snapshot: baseline },
      { id: 'created', at: '2026-09-15T09:00:00Z', kind: 'roadmap.bulk-assigned', entityType: 'board', entityId: 'board', summary: 'Legacy sprint creation', meta: { roadmapKind: 'sprints', sprint: { id: 'event-only', title: 'Event only', startDate: '2026-09-15', endDate: '2026-09-30' }, taskIds: [] } },
      { id: 'removed', at: '2026-10-01T09:00:00Z', kind: 'roadmap.updated', entityType: 'board', entityId: 'board', summary: 'Removed Delivery', snapshot: latest }
    ] };
    const migrated = serializeBoardDataFromObject(legacy);
    expect(migrated.extensions.sprintCatalog?.entries).toEqual([
      { sprintId: 'delivery', number: 1, createdAt: null }, { sprintId: 'live', number: 2, createdAt: null }, { sprintId: 'event-only', number: 3, createdAt: null }
    ]);
    expect(registerSprintCreation(migrated, 'new', '2026-10-18T09:00:00Z').number).toBe(4);
    const preview = reconstructBoardStateFromTimeline(migrated, 0);
    expect(preview.extensions.sprintCatalog?.entries[0]).toEqual({ sprintId: 'delivery', number: 1, createdAt: null });
    expect(preview.extensions.roadmap?.sprints.map(sprint => sprint.id)).toEqual(['delivery', 'live']);
  });

  it.each([
    { version: 2, lastNumber: 0, entries: [] },
    { version: 1, lastNumber: -1, entries: [] },
    { version: 1, lastNumber: 1, entries: [{ sprintId: 's1', number: 2, createdAt: null }] },
    { version: 1, lastNumber: 1, entries: [{ sprintId: 's1', number: 1, createdAt: 'invalid' }] },
    { version: 1, lastNumber: 2, entries: [{ sprintId: 's1', number: 1, createdAt: null }, { sprintId: 's2', number: 1, createdAt: null }] }
  ])('rejects malformed or unsupported sprint catalog data on import: %j', (sprintCatalog) => {
    const board = createEmptyProjectData('Invalid');
    const input = { ...board, extensions: { sprintCatalog } };
    expect(() => validateBoardData(input)).toThrow(/sprintCatalog/);
    expect(() => serializeBoardDataFromObject(input)).toThrow(/sprintCatalog/);
  });
});
