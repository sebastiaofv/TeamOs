import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BoardData } from '../../src/domain/types';
import { validateBoardData } from '../../src/domain/board';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { dashboardControl, dashboardOverviewPlanning, dashboardPeriodWorkitems, dashboardReportable, dashboardSnapshot, dashboardStatistics } from '../../src/domain/dashboardOverview';

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
    it('lists only actual category entries within inclusive boundaries, once per workitem', () => {
        const data = fixture();
        const snapshot = end(data, '2026-10-30');
        const report = dashboardPeriodWorkitems(data, snapshot, '', '2026-10-24', '2026-10-30');
        expect(ids(report.started)).toEqual([910, 911]);
        expect(ids(report.completed)).toEqual([910, 912]);
        expect(report.started.find((task) => task.id === 910)?.status).toBe('accepted');
        expect(report.started.find((task) => task.id === 911)?.status).toBe('testing');
        expect(dashboardPeriodWorkitems(data, snapshot, '', '2026-10-26', '2026-10-29').started).toEqual([]);
        expect(dashboardPeriodWorkitems(data, snapshot, 'api', '2026-10-24', '2026-10-30').started).toEqual([]);
        expect(dashboardPeriodWorkitems(data, snapshot, '', '', '2026-10-15').started).toEqual([]);
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
    it('groups all semantic state categories separately for Stories, independent Tasks and Bugs', () => {
        const data = fixture();
        const groups = dashboardStatistics(data, 'ux');
        expect(ids(groups[0].tasks)).toEqual([910]);
        expect(ids(groups[1].tasks)).toEqual([905, 906, 908, 911, 912]);
        expect(ids(groups[1].categories.find((category) => category.category === 'in-progress')!.tasks)).toEqual([905, 911]);
        expect(ids(groups[2].tasks)).toEqual([914]);
        for (const group of groups) expect(group.categories.reduce((total, category) => total + category.tasks.length, 0)).toBe(group.tasks.length);
        data.extensions.functionalWorkflow = structuredClone(data.extensions.workflow!);
        data.extensions.functionalWorkflow.states.find((state) => state.id === 'accepted')!.category = 'in-progress';
        data.extensions.functionalWorkflow.states.find((state) => state.id === 'testing')!.category = 'completed';
        data.extensions.functionalWorkflow.references.completed = 'testing';
        expect(ids(dashboardStatistics(data, 'ux')[0].categories.find((category) => category.category === 'in-progress')!.tasks)).toEqual([910]);
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
    it('shows only started parent phases with open work and retains consistent overdue phase/milestone alerts', () => {
        const data = fixture();
        const planning = dashboardOverviewPlanning(data, '', '2026-10-31');
        expect(planning.phases.map((group) => group.item.id)).toEqual(['late', 'delivery']);
        expect(planning.phases.find((group) => group.item.id === 'late')?.overdue).toBe(true);
        expect(planning.milestones.map((group) => group.item.id)).toEqual(['cancelled-milestone', 'empty-milestone', 'late-milestone', 'next-empty']);
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
