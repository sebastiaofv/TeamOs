import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateBoardData } from '../../src/domain/board';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { deletePlanningGroup, isLeafPhase, phaseDescendants, phaseTreeRows, planningProgress, recalculatePhaseDates, updatePhase, validatePhaseTree } from '../../src/domain/phaseTree';
import { getRoadmapTaskFieldTasks, normalizeRoadmapExtension } from '../../src/domain/roadmap';
import { taskMatchesPortfolioFilters, DEFAULT_PORTFOLIO_FILTERS } from '../../src/domain/portfolioFilters';
import type { BoardData } from '../../src/domain/types';

const fixture = (): BoardData => JSON.parse(readFileSync('test-board/us-5.board.json', 'utf8'));
describe('hierarchical planning', () => {
    it('validates and round-trips the manual board and migrates v1 without changing IDs', () => {
        const data = fixture(); validateBoardData(data);
        const next = serializeBoardDataFromObject(data); validateBoardData(next);
        expect(next.extensions.roadmap).toEqual(data.extensions.roadmap);
        expect(next.board.tasks.map((task) => task.id)).toEqual(data.board.tasks.map((task) => task.id));
        expect(normalizeRoadmapExtension({ version: 1, phases: [], milestones: [], sprints: [] })?.version).toBe(4);
    });
    it('rejects cycles and unknown parents and exposes only leaf destinations', () => {
        const phases = fixture().extensions.roadmap!.phases;
        expect(isLeafPhase(phases, 'delivery')).toBe(false);
        expect(isLeafPhase(phases, 'api')).toBe(true);
        expect(phaseDescendants(phases, 'delivery').size).toBe(4);
        phases[0].parentId = 'api'; expect(() => validatePhaseTree(phases)).toThrow(/ancestor/);
        phases[0].parentId = 'foreign'; expect(() => validatePhaseTree(phases)).toThrow(/exist/);
    });
    it('calculates global 25% including archive, while filters affect only the visible roster', () => {
        const data = fixture();
        const tasks = getRoadmapTaskFieldTasks(data, 'phaseId', 'delivery');
        expect(planningProgress(tasks, data)).toMatchObject({ eligible: 4, completed: 1, percent: 25 });
        const filtered = tasks.filter((task) => taskMatchesPortfolioFilters(task, { ...DEFAULT_PORTFOLIO_FILTERS, statuses: ['done'] }, data));
        expect(filtered).toHaveLength(1);
        expect(planningProgress(tasks, data).percent).toBe(25);
        expect(planningProgress([], data).percent).toBeNull();
        expect(taskMatchesPortfolioFilters(data.board.tasks[0], { ...DEFAULT_PORTFOLIO_FILTERS, phaseId: 'delivery' }, data)).toBe(true);
        expect(taskMatchesPortfolioFilters(data.board.tasks[4], { ...DEFAULT_PORTFOLIO_FILTERS, phaseId: '__none__' }, data)).toBe(true);
    });
    it('requires explicit relocation when adding a first child and preserves independent fields', () => {
        const data = fixture();
        const child = { id: 'child', parentId: 'api', title: 'Child', startDate: '2026-10-05', endDate: '2026-10-10' };
        expect(() => updatePhase(data, child)).toThrow(/explicitly/);
        expect(data.extensions.roadmap!.phases.some((phase) => phase.id === child.id)).toBe(false);
        updatePhase(data, child, child.id);
        expect(data.board.tasks[0]).toMatchObject({ phaseId: 'child', milestoneId: 'release', sprintId: 'october', status: 'done' });
        expect(data.extensions.roadmap!.phases.find((phase) => phase.id === 'api')).toMatchObject({ startDate: child.startDate, endDate: child.endDate });
        deletePlanningGroup(data, 'phases', 'child', 'ui');
        expect(data.extensions.roadmap!.phases.find((phase) => phase.id === 'api')).toMatchObject({ startDate: child.startDate, endDate: child.endDate });
    });
    it('does not delete branches or silently clear assignments, including archive', () => {
        const data = fixture();
        expect(() => deletePlanningGroup(data, 'phases', 'delivery', '')).toThrow(/subphases/);
        expect(() => deletePlanningGroup(data, 'phases', 'ui')).toThrow(/explicitly/);
        deletePlanningGroup(data, 'phases', 'ui', 'future');
        expect(data.board.tasks[2]).toMatchObject({ phaseId: 'future', archived: true, milestoneId: 'release', status: 'to-do' });
        validateBoardData(data);
    });
    it('orders siblings chronologically then by title and collapses a branch independently', () => {
        const phases = fixture().extensions.roadmap!.phases;
        recalculatePhaseDates(phases);
        expect(phaseTreeRows(phases).map((row) => row.depth)).toEqual([0, 1, 2, 2, 0, 0]);
        expect(phaseTreeRows(phases, new Set(['engineering'])).map((row) => row.item.id)).toEqual(['delivery', 'engineering', 'empty-phase', 'future']);
    });
});
