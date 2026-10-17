import { describe, expect, it } from 'vitest';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { getProjectInfo, validateProjectInfo } from '../../src/domain/project';

describe('versioned project metadata migration', () => {
    it('round-trips legacy tasks, roadmap, attachments and unknown extensions without changing identity', () => {
        const legacy = createEmptyProjectData('Legacy');
        legacy.board.tasks = [normalizeTask({ id: 42, title: 'Keep me', assignees: ['Ana', 'ANA'], status: 'doing' })];
        legacy.extensions = { custom: { preserve: true }, roadmap: { version: 1, phases: [], milestones: [], sprints: [] } };
        const migrated = serializeBoardDataFromObject(legacy);
        const first = getProjectInfo(migrated);
        expect(first.needsReview).toBe(true);
        expect(first.team.map((m) => m.name)).toEqual(['Ana']);
        migrated.board.settings.title = 'Renamed';
        const reopened = serializeBoardDataFromObject(JSON.parse(JSON.stringify(migrated)));
        validateBoardData(reopened);
        expect(getProjectInfo(reopened).id).toBe(first.id);
        expect(reopened.board.tasks).toEqual(migrated.board.tasks);
        expect(reopened.extensions.custom).toEqual({ preserve: true });
        expect(reopened.extensions.roadmap).toEqual(legacy.extensions.roadmap);
    });

    it('requires only the project name while retaining date and identity validation', () => {
        const info = getProjectInfo(createEmptyProjectData('Incomplete'));
        expect(() => validateProjectInfo(info)).not.toThrow();
        info.team = [{ id: 'member-1', name: '', role: '', email: '', active: true }];
        expect(() => validateProjectInfo(info)).not.toThrow();
        expect(() => validateProjectInfo({ ...info, name: '   ' })).toThrow(/identity/);
        expect(() => validateProjectInfo({ ...info, team: [...info.team, ...info.team] })).toThrow(/unique IDs/);
        info.forecast = { start: '2026-10-15', end: '2026-10-14' };
        expect(() => validateProjectInfo(info)).toThrow(/precede/);
    });
});
