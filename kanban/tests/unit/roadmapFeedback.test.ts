import { describe, expect, it } from 'vitest';
import { getRoadmapAxisTicks, getRoadmapYearTicks, normalizeRoadmapExtension, parseRoadmapIsoDate } from '../../src/domain/roadmap';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { validateBoardData } from '../../src/domain/board';
import { readFileSync } from 'node:fs';

describe('roadmap temporal scale', () => {
    const range = { start: parseRoadmapIsoDate('2026-10-01')!, end: parseRoadmapIsoDate('2028-03-01')! };
    it('positions every year boundary and labels the first partial year at the origin', () => {
        const years = getRoadmapYearTicks(range);
        expect(years.map((tick) => tick.label)).toEqual(['2026', '2027', '2028']);
        expect(years[0].position).toBe(0);
        expect(years[1].position).toBeCloseTo(92 / 517 * 100);
        expect(years[2].position).toBeCloseTo(457 / 517 * 100);
        expect(getRoadmapYearTicks(null)).toEqual([]);
    });
    it('adds dates with more horizontal space or zoom while respecting minimum spacing', () => {
        const normal = getRoadmapAxisTicks(range, 'pt', 640);
        const zoomed = getRoadmapAxisTicks(range, 'pt', 1280);
        expect(normal.length).toBeGreaterThan(5);
        expect(zoomed.length).toBeGreaterThan(normal.length);
        for (let index = 1; index < zoomed.length; index++) {
            expect((zoomed[index].position - zoomed[index - 1].position) / 100 * 1280).toBeGreaterThan(70);
        }
        expect(zoomed.every((tick) => !/202[678]/.test(tick.label))).toBe(true);
    });
    it('does not repeat calendar days when there is more width than days', () => {
        expect(getRoadmapAxisTicks({ start: parseRoadmapIsoDate('2026-12-31')!, end: parseRoadmapIsoDate('2027-01-01')! }, 'en', 2000)).toHaveLength(2);
    });
});

describe('phase colour persistence', () => {
    it('round-trips colours without modifying workitem progress inputs or history', () => {
        const board = JSON.parse(readFileSync('test-board/us-5.board.json', 'utf8'));
        const saved = serializeBoardDataFromObject(board);
        validateBoardData(saved);
        expect(saved.extensions.roadmap).toEqual({ ...board.extensions.roadmap, version: 5 });
        expect(serializeBoardDataFromObject(saved).extensions.roadmap).toEqual(saved.extensions.roadmap);
        expect(saved.extensions.timeline).toEqual(board.extensions.timeline);
    });
    it('rejects invalid colours and colours in older phase schemas', () => {
        const roadmap = { version: 4, milestones: [], sprints: [], phases: [{ id: 'p', title: 'Phase', startDate: '2026-10-01', endDate: '2026-10-30', color: 'invalid' }] };
        expect(normalizeRoadmapExtension(roadmap)).toBeNull();
        roadmap.phases[0].color = '#7c3aed';
        expect(normalizeRoadmapExtension(roadmap)?.phases[0].color).toBe('#7c3aed');
        expect(normalizeRoadmapExtension({ ...roadmap, version: 3 })).toBeNull();
    });
});
