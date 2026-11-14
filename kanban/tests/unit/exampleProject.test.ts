import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BoardRepository } from '../../src/infrastructure/persistence/boardRepository';
import { loadDirectoryHistory, openProjectDirectory } from '../../src/infrastructure/persistence/projectDirectory';
import { MemoryDirectory, MemoryFile } from '../support/projectDirectory';
import { reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import { dashboardPeriodWorkitems, dashboardSnapshot, dashboardMilestones } from '../../src/domain/dashboardOverview';
import { dashboardHistorySummary, dashboardSprintScopeChanges } from '../../src/domain/dashboard';
import { validateBoardData } from '../../src/domain/board';
import { visibleComments } from '../../src/domain/comments';
import { allSprintAnalytics } from '../../src/domain/sprintAnalytics';
import { sprintBurndown } from '../../src/domain/sprintBurndown';
import { businessDaysBetween } from '../../src/domain/businessDays';
import { planningProgress } from '../../src/domain/phaseTree';
import { getRoadmapTaskFieldTasks } from '../../src/domain/roadmap';

const root = 'test-board/teamos-development';
async function openExample() {
    const directory = new MemoryDirectory('teamos-development');
    for (const name of ['project.json', 'history.json']) directory.children.set(name, new MemoryFile(name, readFileSync(join(root, name), 'utf8')));
    const attachments = new MemoryDirectory('attachments');
    for (const name of readdirSync(join(root, 'attachments'))) {
        const file = new MemoryFile(name); file.bytes = new Uint8Array(readFileSync(join(root, 'attachments', name))); attachments.children.set(name, file);
    }
    directory.children.set('attachments', attachments);
    const record = await BoardRepository.createRecordFromHandle(await openProjectDirectory(directory));
    record.data.extensions.timeline = await loadDirectoryHistory(record.handle!);
    return record.data;
}

describe('the TeamOS historical example', () => {
    it.each([['sprint-1', 61, 5], ['sprint-2', 12, 2]] as const)('preserves the reported commitment and burndown for %s', async (id, planned, remaining) => {
        const data = await openExample();
        expect(allSprintAnalytics(data).rows.find(row => row.id === id)?.planned).toBe(planned);
        const sprint = data.extensions.roadmap!.sprints.find(sprint => sprint.id === id)!;
        expect(businessDaysBetween(sprint.startDate!, sprint.endDate!)).toBe(9);
        const points = sprintBurndown(data, id, '2026-11-13').points;
        expect(points[0]).toMatchObject({ ideal: planned, actual: planned });
        expect(points.at(-1)?.ideal).toBe(0);
        expect(points.at(-1)?.actual).toBe(remaining);
    });

    it('opens with the production folder reader and preserves hierarchy, planning, native comments and frozen Sprints', async () => {
        const data = await openExample();
        validateBoardData(data);
        expect(data.board.tasks).toHaveLength(396);
        expect(data.extensions.roadmap?.phases.length).toBeGreaterThan(20);
        expect(data.extensions.roadmap?.sprints).toHaveLength(9);
        expect(data.extensions.sprintResults?.closures).toHaveLength(6);
        expect(data.extensions.sprintResults?.closures.some((c) => c.tasks.length && c.velocity > 0)).toBe(true);
        expect(data.extensions.sprintResults?.closures.some((c) => c.carryOverIds.length > 0)).toBe(true);
        for (const story of data.board.tasks.filter((item) => item.type === 'story')) expect(data.board.tasks.filter((item) => item.parentId === story.id).length).toBeGreaterThanOrEqual(3);
        const source = data.board.tasks.find((item) => item.type === 'story' && item.title.includes('Separar os anexos'))!;
        expect(source.pullRequests).toContain('https://github.com/sebastiaofv/TeamOs/pull/82');
        expect(source.attachments).toHaveLength(3);
        expect(visibleComments(data, source).some((c) => c.text.includes('(fictício'))).toBe(true);
        expect(visibleComments(data, source).some((c) => c.text.includes('REFERÊNCIA REAL'))).toBe(true);
        expect(visibleComments(data, source).some((c) => c.images.length)).toBe(true);
        expect(data.extensions.projectControl?.records).toHaveLength(23);
        for (const milestone of ['prototype-ready','react-ready','merge-88']) {
            const members = getRoadmapTaskFieldTasks(data, 'milestoneId', milestone);
            expect(planningProgress(members, data).percent).toBe(100);
        }
    });

    it('replays different monthly states and feeds actual Dashboard activity from canonical events', async () => {
        const data = await openExample();
        const observations = [];
        for (const [start, end] of [['2026-06-01','2026-06-30'],['2026-09-01','2026-09-30']]) {
            const snapshot = dashboardSnapshot(data, end, '2026-11-12')!;
            validateBoardData(snapshot.data);
            const activity = dashboardPeriodWorkitems(snapshot.data, snapshot.data, '', start, end);
            expect(activity.available).toBe(true);
            expect(activity.started.length).toBeGreaterThan(0);
            expect(activity.completed.length).toBeGreaterThan(0);
            observations.push([snapshot.data.board.tasks.length, activity.started.length, activity.completed.length]);
        }
        expect(new Set(observations.map((row) => row.join(':'))).size).toBe(2);
        const timeline = data.extensions.timeline!;
        const final = reconstructBoardStateFromTimeline(data, timeline.events.length - 1);
        expect(final.board.tasks.map((t) => [t.id,t.status,t.parentId,t.permanentId,t.pullRequests])).toEqual(data.board.tasks.map((t) => [t.id,t.status,t.parentId,t.permanentId,t.pullRequests]));
        expect(timeline.events.every((event, index) => !index || event.at >= timeline.events[index - 1].at)).toBe(true);
    }, 30_000);

    it('feeds All Sprints from the native closure records and recorded initial commitments', async () => {
        const data = await openExample();
        const results = allSprintAnalytics(data);
        expect(results.rows).toHaveLength(6);
        expect(results.rows.some(row => row.planned !== null && row.planned > 0)).toBe(true);
        expect(results.rows.reduce((sum, row) => sum + (row.completed ?? 0), 0)).toBe(data.extensions.sprintResults!.closures.reduce((sum, closure) => sum + closure.velocity, 0));
        expect(results.rows.map(row => row.startDate)).toEqual(results.rows.map(row => row.startDate).sort());
        expect(results.summary.velocity).toBeGreaterThan(0);
    });

    it('keeps native milestone history below the previous multi-minute regression', async () => {
        const data = await openExample();
        const started = performance.now();
        const milestones = dashboardMilestones(data, '2026-11-12');
        const elapsed = performance.now() - started;
        expect(milestones.summary.completed).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(120_000);
    }, 150_000);

    // Issue 104: with the full history loaded, these took 3-75 s each and froze the
    // Dashboard. Counts preserve this branch's Bug, Testing and creation activity rules.
    it('reports period activity, history counts and Sprint scope changes over the loaded history without freezing', async () => {
        const data = await openExample();
        const phases = (data.extensions.roadmap?.phases || []).map((phase) => phase.id);
        const elapsed: number[] = [];
        const measure = <T,>(run: () => T) => { const start = performance.now(); const value = run(); elapsed.push(performance.now() - start); return value; };
        const counts = ([start, end, phase]: [string, string, string]) => {
            const report = measure(() => dashboardPeriodWorkitems(data, dashboardSnapshot(data, end, '2026-11-12')!.data, phase, start, end));
            expect([...report.contexts.keys()].sort()).toEqual([...new Set([...report.created, ...report.started, ...report.completed, ...report.testing].map((task) => task.id))].sort());
            return [report.started.length, report.completed.length, report.testing.length, report.created.length];
        };
        expect(counts(['2026-11-05', '2026-11-12', ''])).toEqual([15, 12, 11, 9]);
        expect(counts(['', '2026-11-12', ''])).toEqual([54, 46, 40, 49]);
        expect(counts(['', '2026-11-12', phases[8]])).toEqual([4, 4, 2, 2]);
        expect(counts(['2026-10-01', '2026-10-31', ''])).toEqual([22, 16, 14, 23]);
        expect(counts(['2026-10-01', '2026-10-31', phases[15]])).toEqual([1, 0, 0, 1]);
        expect(measure(() => dashboardSprintScopeChanges(data, 'sprint-6')).length).toBe(39);
        expect(measure(() => dashboardSprintScopeChanges(data, 'sprint-1')).length).toBe(20);
        const history = measure(() => dashboardHistorySummary(data, '', '2026-11-05', '2026-11-12'));
        expect(history).toHaveLength(581);
        expect(history.at(-1)).toMatchObject({ index: 2027, completed: 285, open: 47 });
        expect(measure(() => dashboardHistorySummary(data, phases[15], '2026-10-01', '2026-10-31')).at(-1)).toMatchObject({ index: 1250, completed: 0, open: 10, percent: 0 });
        // Generous for slow CI machines; each one now takes well under a second.
        expect(Math.max(...elapsed)).toBeLessThan(5_000);
    }, 60_000);
});
