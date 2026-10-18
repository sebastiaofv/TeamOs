import { describe, expect, it } from 'vitest';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { readFileSync } from 'node:fs';

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
