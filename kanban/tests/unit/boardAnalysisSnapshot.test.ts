import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BoardData, Task } from '../../src/domain/types';
import { createBoardAnalysisCache, createBoardAnalysisSnapshot, createBoardStateSnapshot, serializeBoardDataFromObject } from '../../src/domain/serialize';
import { iterateBoardTimeline } from '../../src/domain/timeline';
import { clearInvalidRoadmapTaskRefs, roadmapTaskRefIds } from '../../src/domain/roadmap';
import { getWorkflow, statusCategory } from '../../src/domain/workflow';
import { effectivePlanning, isPlanningUnit } from '../../src/domain/workitems';

const boards = readdirSync('tests/fixtures/manual').filter((file) => file.endsWith('.json')).flatMap((file) => {
    try { return [[file, serializeBoardDataFromObject(JSON.parse(readFileSync(join('tests/fixtures/manual', file), 'utf8')))] as const]; } catch { return []; }
}).filter(([, data]) => data.extensions.timeline?.events[0]?.snapshot?.board);

// Everything transition and scope reports read from a replayed board.
const analysed = (data: BoardData) => data.board.tasks.map((task: Task) => ({
    id: task.id, createdAt: task.createdAt, type: task.type, status: task.status, parentId: task.parentId, sprintId: task.sprintId,
    phase: effectivePlanning(data, task, 'phaseId'), milestone: effectivePlanning(data, task, 'milestoneId'),
    category: statusCategory(task.status, data, task), planningUnit: isPlanningUnit(data, task)
}));

describe('board analysis snapshots', () => {
    it('has fixtures with history to compare', () => expect(boards.length).toBeGreaterThan(3));

    it.each(boards)('match full snapshots on every replayed state of %s', (_name, data) => {
        const cache = createBoardAnalysisCache();
        for (const point of iterateBoardTimeline(data)) {
            const full = createBoardStateSnapshot(point.state);
            const analysis = createBoardAnalysisSnapshot(point.state, cache);
            expect(analysed(analysis)).toEqual(analysed(full));
            expect(analysis.extensions.roadmap).toEqual(full.extensions.roadmap);
            expect(getWorkflow(analysis).states).toEqual(getWorkflow(full).states);
            expect(analysis.board.columns).toEqual(full.board.columns);
        }
    });

    it('normalizes only workitems that changed since the previous state', () => {
        const data = boards[0][1];
        // A current-schema state: legacy saves are migrated, which copies every workitem.
        const state = createBoardStateSnapshot(data.extensions.timeline!.events[0].snapshot) as Parameters<typeof createBoardAnalysisSnapshot>[0] & BoardData;
        const cache = createBoardAnalysisCache();
        const first = createBoardAnalysisSnapshot(state, cache);
        const changed = { ...state, board: { ...state.board, tasks: state.board.tasks.map((task, index) => index ? task : { ...task, title: 'Changed' }) } };
        const second = createBoardAnalysisSnapshot(changed, cache);
        expect(second.board.tasks[0]).not.toBe(first.board.tasks[0]);
        expect(second.board.tasks[0].title).toBe('Changed');
        expect(second.board.tasks.slice(1).every((task, index) => task === first.board.tasks[index + 1])).toBe(true);
        // A changed workflow or roadmap can change every workitem: nothing is reused.
        const replanned = { ...changed, extensions: { ...changed.extensions, roadmap: structuredClone(changed.extensions.roadmap) } };
        expect(createBoardAnalysisSnapshot(replanned, cache).board.tasks[1]).not.toBe(second.board.tasks[1]);
    });
});

describe('roadmap task references', () => {
    it('clears the same invalid references with precomputed ids', () => {
        const roadmap = { version: 1, phases: [{ id: 'p1', title: 'Phase' }], milestones: [{ id: 'm1', title: 'Milestone' }], sprints: [{ id: 's1', title: 'Sprint' }] };
        for (const task of [{ phaseId: 'p1', milestoneId: 'm1', sprintId: 's1' }, { phaseId: 'gone', milestoneId: 'gone', sprintId: 'gone' }, { phaseId: '', milestoneId: '', sprintId: '' }]) {
            expect(clearInvalidRoadmapTaskRefs({ ...task }, roadmap, roadmapTaskRefIds(roadmap))).toEqual(clearInvalidRoadmapTaskRefs({ ...task }, roadmap));
        }
        expect(clearInvalidRoadmapTaskRefs({ phaseId: 'gone' }, null, roadmapTaskRefIds(null))).toEqual({ phaseId: 'gone' });
    });
});
