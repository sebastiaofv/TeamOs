import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { closeSprint } from '../../src/domain/sprintResults';
import { vi } from 'vitest';
import type { BoardData } from '../../src/domain/types';
import { validateBoardData } from '../../src/domain/board';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from '../../src/domain/serialize';
import { dashboardInProgress, dashboardActiveSprints, dashboardEpics, dashboardControl, dashboardOverviewPlanning, dashboardMilestones, dashboardPeriodWorkitems, dashboardReportable, dashboardSnapshot, dashboardStatistics } from '../../src/domain/dashboardOverview';

const fixture = (): BoardData => serializeBoardDataFromObject(JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8')));
const ids = (items: { id: number }[]) => items.map((item) => item.id);
const end = (data: BoardData, date: string) => dashboardSnapshot(data, date, '2026-11-04')!.data;

describe('dashboard section reporting', () => {
    it('validates the extended manual board and preserves records, identities and history on round-trip', () => {
        const raw = JSON.parse(readFileSync('test-board/us-9-sections.board.json', 'utf8'));
        validateBoardData(raw);
        const data = fixture();
        validateBoardData(data);
        const saved = serializeBoardDataFromObject(data);
        expect(ids(saved.board.tasks)).toEqual(ids(raw.board.tasks));
        expect(saved.extensions.projectControl).toEqual(data.extensions.projectControl);
        expect(saved.extensions.timeline?.events.map((event) => event.id)).toEqual(raw.extensions.timeline!.events.map((event: { id: string }) => event.id));
    });
    it('replays a legacy baseline without freezing its initially empty people catalog', () => {
        const data = serializeBoardDataFromObject(JSON.parse(readFileSync('test-board/us-6.board.json', 'utf8')));
        const report = dashboardPeriodWorkitems(data, data, '', '2026-10-19', '2026-10-19');
        expect(report.completed.map((task) => ({ id: task.id, responsible: task.responsible }))).toEqual([{ id: 601, responsible: 'Ana' }]);
    });
    it('uses the last saved state on or before the end day, including the entire end date', () => {
        const data = fixture();
        expect(end(data, '2026-10-30').board.tasks.find((task) => task.id === 912)?.status).toBe('accepted');
        expect(end(data, '2026-10-29').board.tasks.find((task) => task.id === 912)?.status).toBe('to-do');
        expect(dashboardSnapshot(data, '2026-10-14', '2026-11-04')).toBeNull();
        delete data.extensions.timeline;
        expect(dashboardSnapshot(data, '2026-10-30', '2026-11-04')).toBeNull();
        expect(dashboardSnapshot(data, '2026-11-04', '2026-11-04')?.data).toBe(data);
    });
    it('infers legacy Sprint status at the historical end date and preserves explicitly recorded lifecycle states', () => {
        const data = fixture();
        data.extensions.roadmap!.sprints.find((sprint) => sprint.id === 'active')!.status = 'done';
        expect(dashboardActiveSprints(end(data, '2026-10-31'), '2026-10-31').map((row) => row.item.id)).toEqual(['active']);
        for (const event of data.extensions.timeline!.events) {
            const sprint = event.snapshot?.extensions?.roadmap?.sprints.find((item) => item.id === 'active');
            if (sprint) sprint.status = 'planned';
        }
        expect(dashboardActiveSprints(end(data, '2026-10-31'), '2026-10-31').map((row) => row.item.id)).toEqual([]);
    });
    it('lists only actual category entries within inclusive boundaries, once per workitem', () => {
        const data = fixture();
        const snapshot = end(data, '2026-10-30');
        const report = dashboardPeriodWorkitems(data, snapshot, '', '2026-10-24', '2026-10-30');
        expect(ids(report.started)).toEqual([910, 911, 914]);
        expect(ids(report.completed)).toEqual([910, 912]);
        expect(report.started.find((task) => task.id === 910)?.status).toBe('accepted');
        expect(report.started.find((task) => task.id === 911)?.status).toBe('testing');
        expect(ids(dashboardPeriodWorkitems(data, snapshot, '', '2026-10-26', '2026-10-29').started)).toEqual([914]);
        expect(dashboardPeriodWorkitems(data, snapshot, 'api', '2026-10-24', '2026-10-30').started).toEqual([]);
        expect(dashboardPeriodWorkitems(data, snapshot, '', '', '2026-10-15').started).toEqual([]);
    });
    it('includes Bugs and a separate Testing category, without counting execution-to-Testing moves twice', () => {
        const data = fixture();
        // A workflow may represent Testing as its own category instead of in-progress.
        for (const event of data.extensions.timeline!.events) {
            const workflow = event.snapshot?.extensions?.workflow;
            if (workflow) { workflow.states.find((state) => state.id === 'testing')!.category = 'testing'; workflow.references.testing = 'testing'; }
        }
        data.extensions.workflow!.states.find((state) => state.id === 'testing')!.category = 'testing';
        data.extensions.workflow!.references.testing = 'testing';
        data.extensions.timeline!.events.push(
            { id: 'bug-completed', at: '2026-10-31T23:59:59.000Z', entityType: 'task', entityId: '914', kind: 'task.status.changed', summary: 'Bug completed', changes: { status: { before: 'doing', after: 'accepted' } } },
            { id: 'reopened', at: '2026-11-01T10:00:00.000Z', entityType: 'task', entityId: '911', kind: 'task.status.changed', summary: 'Reopened', changes: { status: { before: 'testing', after: 'to-do' } } },
            { id: 'restarted', at: '2026-11-01T11:00:00.000Z', entityType: 'task', entityId: '911', kind: 'task.status.changed', summary: 'Retesting', changes: { status: { before: 'to-do', after: 'testing' } } }
        );
        const snapshot = end(data, '2026-11-01');
        const report = dashboardPeriodWorkitems(data, snapshot, '', '2026-10-24', '2026-11-01');
        expect(ids(report.started)).toEqual([910, 911, 914]);
        expect(ids(report.completed)).toEqual([910, 912, 914]);
        expect(report.startedAt.get(911)?.slice(0, 10)).toBe('2026-10-25');
        expect(report.completedAt.get(914)).toBe('2026-10-31T23:59:59.000Z');
        expect(ids(dashboardInProgress(snapshot))).not.toContain(911);
        expect(ids(dashboardInProgress(snapshot))).not.toContain(914);
        const testingOnly = dashboardPeriodWorkitems(data, snapshot, '', '2026-10-26', '2026-10-30');
        expect(ids(testingOnly.started)).toEqual([914]);
        expect(ids(testingOnly.testing)).toEqual([911]);
        expect(ids(report.testing)).toEqual([911]);
        expect(report.testingAt.get(911)).toBe('2026-10-26T12:00:00.000Z');
    });
    it('counts direct entry into Testing and keeps pre-existing execution in the end-date count', () => {
        const data = fixture();
        const baseline = data.extensions.timeline!.events[0];
        for (const event of data.extensions.timeline!.events) {
            const workflow = event.snapshot?.extensions?.workflow;
            if (workflow) { workflow.states.find((state) => state.id === 'testing')!.category = 'testing'; workflow.references.testing = 'testing'; }
        }
        data.extensions.timeline!.events = [baseline, { id: 'direct-test', at: '2026-10-25T00:00:00.000Z', entityType: 'task', entityId: '911', kind: 'task.status.changed', summary: 'Testing', changes: { status: { before: 'to-do', after: 'testing' } } }];
        const snapshot = end(data, '2026-10-25');
        const report = dashboardPeriodWorkitems(data, snapshot, '', '2026-10-25', '2026-10-25');
        expect(ids(report.started)).toEqual([911]);
        expect(report.startedAt.get(911)).toBe('2026-10-25T00:00:00.000Z');
        expect(dashboardInProgress(snapshot).length).toBeGreaterThan(report.started.length);
        expect(dashboardInProgress(snapshot).every((task) => !['epic'].includes(task.type || '') && task.id !== 913)).toBe(true);
    });
    it('counts Testing by category entry in the period, keeps later current status and excludes child Tasks', () => {
        const data = fixture();
        const workflow = data.extensions.workflow!;
        workflow.states.find((state) => state.id === 'testing')!.category = 'testing';
        workflow.references.testing = 'testing';
        workflow.transitions.testing.push('validation');
        workflow.transitions.validation = ['accepted'];
        workflow.states.push({ id: 'validation', name: 'QA review', category: 'testing', color: '#8844aa' });
        data.extensions.functionalWorkflow = structuredClone(workflow);
        const baseline = data.extensions.timeline!.events[0];
        baseline.snapshot!.extensions!.workflow = structuredClone(workflow);
        baseline.snapshot!.extensions!.functionalWorkflow = structuredClone(workflow);
        // Created before the range, entered Testing twice and completed afterwards.
        data.extensions.timeline!.events = [baseline,
            { id: 'qa-start', at: '2026-10-24T00:00:00.000Z', kind: 'task.status.changed', entityType: 'task', entityId: '911', summary: 'QA', changes: { status: { before: 'to-do', after: 'validation' } } },
            { id: 'qa-next', at: '2026-10-24T12:00:00.000Z', kind: 'task.status.changed', entityType: 'task', entityId: '911', summary: 'QA', changes: { status: { before: 'validation', after: 'testing' } } },
            { id: 'qa-child', at: '2026-10-25T12:00:00.000Z', kind: 'task.status.changed', entityType: 'task', entityId: '913', summary: 'QA', changes: { status: { before: 'to-do', after: 'testing' } } },
            { id: 'qa-story', at: '2026-10-25T23:59:59.999Z', kind: 'task.updated', entityType: 'task', entityId: '910', summary: 'QA', changes: { status: { before: 'to-do', after: 'validation' } } },
            { id: 'qa-end', at: '2026-10-26T00:00:00.000Z', kind: 'task.status.changed', entityType: 'task', entityId: '911', summary: 'Done', changes: { status: { before: 'testing', after: 'accepted' } } }
        ];
        data.board.tasks.find((task) => task.id === 911)!.status = 'accepted';
        data.board.tasks.find((task) => task.id === 910)!.status = 'validation';
        const report = dashboardPeriodWorkitems(data, end(data, '2026-10-25'), '', '2026-10-24', '2026-10-25');
        expect(ids(report.testing)).toEqual([911, 910]);
        expect(report.testing[0].status).toBe('accepted');
        expect(report.testingAt.get(911)).toBe('2026-10-24T00:00:00.000Z');
        expect(ids(dashboardPeriodWorkitems(data, data, '', '2026-10-25', '2026-10-25').testing)).toEqual([910]);
        expect(dashboardPeriodWorkitems(data, data, '', '2026-10-26', '2026-10-26').testing).toEqual([]);
    });
    it('does not treat a state named Testing in another category, baselines or workflow edits as Testing events', () => {
        const data = fixture();
        expect(dashboardPeriodWorkitems(data, data, '', '2026-10-24', '2026-10-30').testing).toEqual([]);
        const baseline = data.extensions.timeline!.events[0];
        const snapshot = structuredClone(baseline.snapshot!);
        snapshot.extensions!.workflow!.states.find((state) => state.id === 'testing')!.category = 'testing';
        snapshot.extensions!.workflow!.references.testing = 'testing';
        snapshot.board!.tasks.find((task) => task.id === 911)!.status = 'testing';
        data.extensions.timeline!.events = [baseline, { id: 'edit', at: '2026-10-25T12:00:00Z', kind: 'workflow.updated', entityType: 'board', entityId: 'board', summary: 'Workflow', snapshot }];
        expect(dashboardPeriodWorkitems(data, data, '', '', '2026-10-30').testing).toEqual([]);
        data.extensions.timeline!.events[1].kind = 'board.restored';
        expect(dashboardPeriodWorkitems(data, data, '', '', '2026-10-30').testing).toEqual([]);
        delete data.extensions.timeline;
        expect(dashboardPeriodWorkitems(data, data, '', '', '2026-10-30')).toMatchObject({ available: false, testing: [] });
    });
    it('distinguishes unavailable history, partial coverage and an observed period without activity', () => {
        const data = fixture();
        expect(dashboardPeriodWorkitems(data, data, '', '2026-10-01', '2026-10-15')).toMatchObject({ available: true, availableFrom: '2026-10-15', started: [], completed: [] });
        const noHistory = { ...data, extensions: { ...data.extensions, timeline: undefined } };
        expect(dashboardPeriodWorkitems(noHistory, noHistory, '', '2026-10-01', '2026-11-04')).toMatchObject({ available: false, availableFrom: null, started: [], completed: [] });
        expect(dashboardInProgress(noHistory).length).toBeGreaterThan(0);
    });
    it('filters event dates without assuming the canonical event sequence is timestamp-sorted', () => {
        const data = fixture();
        const baseline = data.extensions.timeline!.events[0];
        data.extensions.timeline!.events = [baseline,
            { id: 'later-day', at: '2026-10-26T12:00:00.000Z', entityType: 'task', entityId: '911', kind: 'task.status.changed', summary: 'Started', changes: { status: { before: 'to-do', after: 'doing' } } },
            { id: 'earlier-day', at: '2026-10-25T12:00:00.000Z', entityType: 'task', entityId: '912', kind: 'task.status.changed', summary: 'Completed', changes: { status: { before: 'to-do', after: 'accepted' } } }
        ];
        const report = dashboardPeriodWorkitems(data, end(data, '2026-10-25'), '', '2026-10-24', '2026-10-25');
        expect(ids(report.started)).toEqual([]);
        expect(ids(report.completed)).toEqual([912]);
    });
    it('does not infer workitem transitions from workflow category edits, board restores or baseline states', () => {
        const data = fixture();
        const baseline = data.extensions.timeline!.events[0];
        const snapshot = structuredClone(baseline.snapshot!);
        snapshot.board!.tasks.find((task) => task.id === 911)!.status = 'accepted';
        data.extensions.timeline!.events = [baseline, { id: 'restore', at: '2026-10-26T12:00:00.000Z', entityType: 'board', entityId: 'board', kind: 'board.restored', summary: 'Restore', snapshot }];
        expect(dashboardPeriodWorkitems(data, data, '', '', '2026-10-30').completed).toEqual([]);
        data.extensions.timeline!.events[1].kind = 'workflow.updated';
        expect(dashboardPeriodWorkitems(data, data, '', '', '2026-10-30').completed).toEqual([]);
    });
    it('preserves source details for an item deleted after its recorded transition', () => {
        const data = fixture();
        data.extensions.timeline!.events.push({ id: 'delete', at: '2026-11-02T12:00:00.000Z', entityType: 'task', entityId: '911', kind: 'task.deleted', summary: 'Deleted' });
        data.board.tasks = data.board.tasks.filter((task) => task.id !== 911);
        const report = dashboardPeriodWorkitems(data, end(data, '2026-11-03'), '', '2026-10-24', '2026-11-03');
        expect(ids(report.started)).toContain(911);
        expect(report.contexts.get(911)?.board.tasks.find((task) => task.id === 911)?.status).toBe('testing');
    });
    it('counts created Stories across inclusive boundaries regardless of state, including baseline and deleted records', () => {
        const data = fixture();
        const templates = data.board.tasks.filter((task) => task.type === 'story');
        const stories = ['2026-10-23T23:59:59Z', '2026-10-24T00:00:00Z', '2026-10-30T23:59:59Z', '2026-10-31T00:00:00Z'].map((createdAt, index) => ({ ...templates[0], id: 1100 + index, permanentId: `created-${index}`, createdAt, status: index === 1 ? 'accepted' : 'backlog' }));
        data.board.tasks = stories;
        delete data.extensions.taskRelations; delete data.extensions.timeline;
        expect(ids(dashboardPeriodWorkitems(data, data, '', '2026-10-24', '2026-10-30').created)).toEqual([1101, 1102]);
        data.extensions.timeline = { version: 1, baselineEventId: 'created-baseline', events: [{ id: 'created-baseline', at: '2026-10-30T23:59:59Z', kind: 'board.baseline', entityType: 'board', entityId: 'board', summary: 'Baseline', snapshot: createBoardStateSnapshot(data) }] };
        data.board.tasks = [];
        const report = dashboardPeriodWorkitems(data, data, '', '2026-10-24', '2026-10-30');
        expect(ids(report.created)).toEqual([1101, 1102]);
        expect(report.contexts.get(1101)?.board.tasks.some((task) => task.id === 1101)).toBe(true);
    });
    it('selects active Sprints and closures within the period, retaining frozen metrics after work moves', () => {
        const data = fixture();
        const sprint = data.extensions.roadmap!.sprints.find((item) => item.id === 'active')!;
        sprint.status = 'active';
        data.board.tasks.find((task) => task.id === 902)!.storyPoints = 8;
        data.board.tasks.find((task) => task.id === 904)!.status = 'accepted';
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2026-11-01T23:59:59Z'));
            closeSprint(data, sprint.id); sprint.status = 'done';
        } finally { vi.useRealTimers(); }
        data.extensions.roadmap!.sprints = [sprint];
        data.extensions.roadmap!.sprints.push({ id: 'parallel', title: 'Parallel', startDate: '2026-10-01', endDate: '2026-10-20', status: 'active' }, { id: 'planned', title: 'Planned', startDate: '2026-11-10', endDate: '2026-11-20', status: 'planned' });
        const report = dashboardActiveSprints(data, '2026-11-04', '2026-11-01');
        expect(report.map((row) => row.item.id)).toEqual(['active', 'parallel']);
        expect(report[0].closed).toBe(true);
        expect(report[0].points.planned).toBe(8);
        expect(report[0].units.map((task) => task.id)).toContain(902);
        expect(report[1].overdue).toBe(true);
        expect(dashboardActiveSprints(data, '2026-11-04', '2026-11-02').map((row) => row.item.id)).toEqual(['parallel']);
        expect(dashboardActiveSprints(data, '2026-10-31', '2026-10-24').map((row) => row.item.id)).not.toContain('active');
    });
    it('groups workflow categories separately for Stories, independent Tasks and Bugs', () => {
        const data = fixture();
        const groups = dashboardStatistics(data, 'ux');
        expect(ids(groups[0].tasks)).toEqual([910]);
        expect(ids(groups[1].tasks)).toEqual([905, 906, 908, 911, 912]);
        expect(ids(groups[1].states.find((state) => state.id === 'in-progress')!.tasks)).toEqual([905, 911]);
        expect(ids(groups[2].tasks)).toEqual([914]);
        for (const group of groups) expect(group.states.reduce((total, state) => total + state.tasks.length, 0)).toBe(group.tasks.length);
        data.extensions.functionalWorkflow = structuredClone(data.extensions.workflow!);
        data.extensions.functionalWorkflow.states.find((state) => state.id === 'accepted')!.category = 'in-progress';
        data.extensions.functionalWorkflow.states.find((state) => state.id === 'testing')!.category = 'completed';
        data.extensions.functionalWorkflow.references.completed = 'testing';
        expect(ids(dashboardStatistics(data, 'ux')[0].states.find((state) => state.id === 'in-progress')!.tasks)).toEqual([910]);
    });
    it('merges workflow states into shared categories while respecting each type workflow', () => {
        const data = fixture();
        data.extensions.functionalWorkflow = structuredClone(data.extensions.workflow!);
        const state = data.extensions.functionalWorkflow.states.find((state) => state.id === 'accepted')!;
        state.name = 'Business approved'; state.color = '#123456';
        data.extensions.functionalWorkflow.states.find((row) => row.id === 'testing')!.category = 'completed';
        data.extensions.functionalWorkflow.references.completed = 'testing';
        state.category = 'in-progress';
        const [stories, tasks] = dashboardStatistics(data, '');
        expect(ids(stories.states.find((row) => row.id === 'in-progress')!.tasks)).toContain(910);
        expect(tasks.states.filter((row) => row.category === 'in-progress')).toHaveLength(1);
        expect(tasks.states.map((row) => row.id)).toEqual(['backlog', 'to-do', 'in-progress', 'testing', 'completed', 'cancelled']);
        expect(tasks.states.map((row) => row.color)).toEqual(stories.states.map((row) => row.color));
    });
    it('uses the same independent-Task rule as Table, including Tasks directly under an Epic', () => {
        const data = fixture();
        const independent = { ...data.board.tasks.find((task) => task.id === 911)!, id: 918, displayId: 'ATL-TK-918', permanentId: 'independent-epic-task', parentId: 901 };
        data.board.tasks.push(independent);
        expect(dashboardReportable(data, independent)).toBe(true);
        expect(dashboardReportable(data, data.board.tasks.find((task) => task.id === 913)!)).toBe(false);
        expect(ids(dashboardStatistics(data, 'ux')[1].tasks)).toContain(918);
        data.extensions.timeline!.events[0].snapshot!.board!.tasks.push({ ...independent, status: 'to-do' });
        data.extensions.timeline!.events.splice(1, 0, { id: 'direct-epic', at: '2026-10-24T09:00:00.000Z', kind: 'task.status.changed', entityType: 'task', entityId: '918', summary: 'Started', changes: { status: { before: 'to-do', after: 'testing' } } });
        expect(ids(dashboardPeriodWorkitems(data, data, 'ux', '2026-10-24', '2026-10-30').started)).toContain(918);
    });
    it('shows all parent phases chronologically, excludes children and includes all milestones', () => {
        const data = fixture();
        const planning = dashboardOverviewPlanning(data, '', '2026-10-31');
        expect(planning.phases.map((group) => group.item.id)).toEqual(['finished', 'late', 'cancelled-only', 'delivery', 'future', 'empty']);
        expect(planning.phases.find((group) => group.item.id === 'late')?.overdue).toBe(true);
        expect(planning.milestones.map((group) => group.item.id)).toEqual(['cancelled-milestone', 'empty-milestone', 'late-milestone', 'next-empty', 'release']);
        expect(planning.milestones[0].overdue).toBe(true);
        expect(dashboardOverviewPlanning(data, 'api', '2026-10-31').phases.map((group) => group.item.id)).toEqual(['delivery']);
    });
    it('honors pending deliverable acceptance for completed phase work', () => {
        const data = fixture();
        data.extensions.projectControl!.records[0] = { ...data.extensions.projectControl!.records[0], kind: 'deliverables', status: 'delivered', related: { phaseIds: ['finished'], milestoneIds: [] } };
        const phase = dashboardOverviewPlanning(data, '', '2026-10-31').phases.find((group) => group.item.id === 'finished');
        expect(phase?.progress.percent).toBe(99);
        expect(phase?.overdue).toBe(true);
    });
    it('distinguishes missed starts from missed deadlines and includes phases started ahead of schedule', () => {
        const data = fixture();
        data.extensions.roadmap!.phases.push(
            { id: 'late-start', title: 'Late start', startDate: '2026-10-01', endDate: '2026-11-30' },
            { id: 'deadline', title: 'Missed deadline', startDate: '2026-10-01', endDate: '2026-10-30' },
            { id: 'today', title: 'Starts today', startDate: '2026-10-31', endDate: '2026-11-30' }
        );
        const phases = dashboardOverviewPlanning(data, '', '2026-10-31').phases;
        expect(phases.find((group) => group.item.id === 'late-start')?.situation).toBe('late');
        expect(phases.find((group) => group.item.id === 'deadline')?.situation).toBe('overdue');
        expect(phases.find((group) => group.item.id === 'today')?.situation).toBe('onTarget');
        expect(phases.find((group) => group.item.id === 'future')?.situation).toBe('onTarget');
        expect(phases.find((group) => group.item.id === 'finished')?.situation).toBe('completed');
        expect(phases.some((group) => group.item.id === 'empty')).toBe(true);
    });
    it('reuses Epic progress and effective workflow status at the selected end date', () => {
        const data = fixture();
        const original = data.board.tasks.find((task) => task.id === 901)!;
        data.board.tasks.push({ ...original, id: 918, status: 'to-do' }, { ...original, id: 919, status: 'accepted' });
        const epics = dashboardEpics(data);
        expect(epics.map(({ task }) => task.id)).toEqual([901, 919]);
        expect(epics[0].progress.percent).toBe(0); // The Story still awaits validation, even with a completed child Task.
        expect(epics[1].progress.percent).toBeNull();
        original.status = 'accepted';
        expect(dashboardEpics(end(data, '2026-10-30'))[0].task.status).toBe('doing');
    });
    it('totals Epic points across its planning units without duplicating child estimates or unrelated work', () => {
        const data = fixture();
        const task = (id: number) => data.board.tasks.find((row) => row.id === id)!;
        task(902).storyPoints = 8;
        task(903).storyPoints = 99; // Legacy child estimates never duplicate Story points.
        task(905).parentId = 901; task(905).storyPoints = 3; task(905).status = 'accepted';
        task(909).parentId = 901; task(909).storyPoints = 5; task(909).status = 'accepted';
        task(906).parentId = 909; task(906).storyPoints = 77;
        task(908).storyPoints = 50; // Unrelated completed work is excluded.
        expect(dashboardEpics(data)[0].points).toEqual({ completed: 8, total: 16 });
        expect(dashboardEpics(data)[0].progress.percent).toBeCloseTo(200 / 3);
        task(904).status = 'accepted';
        expect(dashboardEpics(data)[0].points).toEqual({ completed: 16, total: 16 });
        expect(dashboardEpics(data)[0].progress.percent).toBeCloseTo(200 / 3); // Functional acceptance remains separate.
        task(904).status = 'cancelled';
        expect(dashboardEpics(data)[0].points.completed).toBe(8); // Cancelled children do not earn completion.
        data.board.tasks = data.board.tasks.filter((row) => row.id === 901);
        expect(dashboardEpics(data)[0].points).toEqual({ completed: 0, total: 0 });
    });
    it('uses the selected historical hierarchy and estimates for Epic points', () => {
        const data = fixture();
        data.board.tasks.find((task) => task.id === 902)!.storyPoints = 100;
        const baseline = data.extensions.timeline!.events[0].snapshot!.board!.tasks;
        baseline.find((task) => task.id === 902)!.storyPoints = 8;
        baseline.find((task) => task.id === 904)!.status = 'accepted';
        expect(dashboardEpics(end(data, '2026-10-30'))[0].points).toEqual({ completed: 8, total: 8 });
        expect(dashboardEpics(data)[0].points).toEqual({ completed: 0, total: 100 });
    });
    it('keeps explicitly active overdue Sprints and counts SP once per planning unit using development completion', () => {
        const data = fixture();
        const sprint = data.extensions.roadmap!.sprints.find((item) => item.id === 'active')!;
        sprint.status = 'active'; sprint.capacity = 10;
        data.board.tasks.find((task) => task.id === 902)!.storyPoints = 8;
        data.board.tasks.find((task) => task.id === 905)!.storyPoints = 3;
        data.board.tasks.find((task) => task.id === 904)!.status = 'accepted';
        const summary = dashboardActiveSprints(data, '2026-11-20')[0];
        expect(summary.item.id).toBe('active');
        expect(summary.stories.map((task) => task.id)).toEqual([902]);
        expect(summary.points).toEqual({ planned: 11, capacity: 10, completed: 8 });
        expect(summary.percent).toBe(0); // Existing completion still uses the planning units' own statuses.
        expect(summary.overdue).toBe(true);
        sprint.status = 'done';
        expect(dashboardActiveSprints(data, '2026-11-20').some((row) => row.item.id === 'active')).toBe(false);
        sprint.status = 'planned';
        expect(dashboardActiveSprints(data, '2026-10-31').some((row) => row.item.id === 'active')).toBe(false);
    });
    it('reports open controls at the end date and accepted deliveries only when delivered in the period', () => {
        const data = fixture();
        const current = dashboardControl(data, '', '2026-10-24', '2026-11-04');
        expect(current.risks.map((record) => record.title)).toEqual(['Open high risk']);
        expect(current.decisions.map((record) => record.title)).toEqual(['Pending architecture decision']);
        expect(current.deliverables.map((record) => record.title)).toEqual(['Open delivery', 'Accepted delivery in period']);
        const historic = dashboardControl(end(data, '2026-10-31'), 'ux', '2026-10-24', '2026-10-31');
        expect(historic.risks.map((record) => record.title)).toEqual(['Open high risk', 'Risk closed after period']);
        expect(historic.decisions.map((record) => record.title)).toEqual(['Pending architecture decision', 'Decision resolved after period']);
        expect(historic.deliverables.map((record) => record.title)).toEqual(['Open delivery', 'Accepted delivery in period']);
        expect(dashboardControl(data, 'api', '', '2026-11-04').risks).toEqual([]);
        expect(dashboardControl(data, '', '2026-10-31', '2026-11-04').deliverables.map((record) => record.title)).toEqual(['Open delivery']);
    });
});


describe('relevant Dashboard milestones', () => {
    function milestonesFixture() {
        const data = fixture();
        data.extensions.roadmap!.milestones = [
            { id: 'old', title: 'Older completion', dueDate: '2026-10-01' },
            { id: 'recent', title: 'Latest completion', dueDate: '2026-10-02' },
            { id: 'delayed', title: 'Missed deadline', dueDate: '2026-10-03' },
            { id: 'next', title: 'Next checkpoint', dueDate: '2026-11-20' },
            { id: 'later', title: 'Later checkpoint', dueDate: '2026-11-21' }
        ];
        const template = data.board.tasks.find((task) => task.id === 905)!;
        data.board.tasks = data.extensions.roadmap!.milestones.map((milestone, index) => ({ ...template, id: index + 1,
            permanentId: `milestone-task-${index}`, displayId: `ATL-TK-${index + 1}`, parentId: null,
            status: 'to-do', milestoneId: milestone.id, milestoneMode: 'explicit', phaseId: '', phaseMode: 'none' }));
        data.extensions.projectControl!.records = [];
        delete data.extensions.taskRelations;
        delete data.extensions.sprintResults;
        data.extensions.timeline = { version: 1, baselineEventId: 'baseline', events: [
            { id: 'baseline', at: '2026-10-15T12:00:00Z', kind: 'board.baseline', entityType: 'board', entityId: 'board', summary: 'Baseline', snapshot: createBoardStateSnapshot(data) }
        ] };
        return data;
    }
    function status(data: BoardData, id: number, after: string, day: string) {
        const task = data.board.tasks.find((task) => task.id === id)!;
        data.extensions.timeline!.events.push({ id: `${id}-${day}-${after}`, at: `${day}T12:00:00Z`, kind: 'task.status.changed', entityType: 'task', entityId: String(id), summary: after, changes: { status: { before: task.status, after } } });
        task.status = after;
    }
    it('summarizes all milestones but selects only the latest recent completion, every delay and the next pending date', () => {
        const data = milestonesFixture();
        status(data, 1, 'accepted', '2026-10-20');
        status(data, 2, 'accepted', '2026-10-25');
        const result = dashboardMilestones(data, '2026-11-04');
        expect(result.summary).toEqual({ completed: 2, delayed: 1, remaining: 3 });
        expect(result.visible.map((row) => row.item.id)).toEqual(['recent', 'delayed', 'next']);
        expect(dashboardMilestones(data, '2026-11-05').visible.map((row) => row.item.id)).toEqual(['delayed', 'next']);
    });
    it('selects the latest completion time when several milestones complete on the same day', () => {
        const data = milestonesFixture();
        status(data, 1, 'accepted', '2026-10-25');
        status(data, 2, 'accepted', '2026-10-25');
        data.extensions.timeline!.events.at(-1)!.at = '2026-10-25T18:00:00Z';
        expect(dashboardMilestones(data, '2026-11-04').visible.map((row) => row.item.id)).toEqual(['recent', 'delayed', 'next']);
    });
    it('uses report-end history, includes the tenth day, and resets completion after reopening', () => {
        const data = milestonesFixture();
        status(data, 1, 'accepted', '2026-10-20');
        status(data, 2, 'accepted', '2026-10-25');
        status(data, 1, 'doing', '2026-10-26');
        status(data, 1, 'accepted', '2026-11-01');
        const historical = dashboardSnapshot(data, '2026-10-30', '2026-11-04')!.data;
        expect(dashboardMilestones(historical, '2026-10-30').visible.map((row) => row.item.id)).toEqual(['old', 'recent', 'delayed', 'next']);
        expect(dashboardMilestones(data, '2026-11-11').visible.map((row) => row.item.id)).toEqual(['old', 'delayed', 'next']);
        expect(dashboardMilestones(data, '2026-11-12').visible.map((row) => row.item.id)).toEqual(['delayed', 'next']);
    });
    it('does not invent completion dates for a completed baseline or a file without history', () => {
        const data = milestonesFixture();
        data.board.tasks.forEach((task) => { task.status = 'accepted'; });
        data.extensions.timeline!.events[0].snapshot = createBoardStateSnapshot(data);
        expect(dashboardMilestones(data, '2026-10-16')).toMatchObject({ summary: { completed: 5, delayed: 0, remaining: 0 }, visible: [] });
        delete data.extensions.timeline;
        expect(dashboardMilestones(data, '2026-10-16').visible).toEqual([]);
    });
    it('starts the completion window only after pending deliverable acceptance releases the progress gate', () => {
        const data = milestonesFixture();
        const record = fixture().extensions.projectControl!.records.find((record) => record.kind === 'deliverables')!;
        data.extensions.projectControl!.records = [{ ...record, status: 'delivered', related: { phaseIds: [], milestoneIds: ['recent'] } }];
        data.extensions.timeline!.events[0].snapshot = createBoardStateSnapshot(data);
        status(data, 2, 'accepted', '2026-10-20');
        expect(dashboardMilestones(data, '2026-10-25').summary.completed).toBe(0);
        data.extensions.projectControl!.records[0].status = 'accepted';
        data.extensions.timeline!.events.push({ id: 'accept', at: '2026-10-30T12:00:00Z', kind: 'board.control.updated', entityType: 'board', entityId: 'board', summary: 'Accepted deliverable', snapshot: createBoardStateSnapshot(data) });
        expect(dashboardMilestones(data, '2026-11-09').visible.map((row) => row.item.id)).toContain('recent');
        expect(dashboardMilestones(data, '2026-11-10').visible.map((row) => row.item.id)).not.toContain('recent');
    });
    it('shows the next future milestone even when no recent completion or delay exists', () => {
        const data = milestonesFixture();
        data.extensions.roadmap!.milestones = data.extensions.roadmap!.milestones.filter((item) => ['next', 'later'].includes(item.id));
        expect(dashboardMilestones(data, '2026-11-04').visible.map((row) => row.item.id)).toEqual(['next']);
        data.extensions.roadmap!.milestones = [];
        expect(dashboardMilestones(data, '2026-11-04').visible).toEqual([]);
    });
});
