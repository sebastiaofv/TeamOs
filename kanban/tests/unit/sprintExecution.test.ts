import { describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { appendTimelineEvent, ensureBoardTimelineBaseline } from '@/domain/timeline';
import { closeSprint } from '@/domain/sprintResults';
import { sprintExecution, businessDaysBetween } from '@/domain/sprintExecution';

function fixture() {
    const data = createEmptyProjectData('Execution');
    data.meta.updatedAt = '2026-01-01T12:00:00Z';
    data.board.tasks = [normalizeTask({ id: 1, title: 'Story', type: 'story', storyPoints: 3, status: 'to-do', createdAt: '2026-01-01T12:00:00Z', sprintId: 's1' })];
    data.extensions.roadmap = { version: 5, phases: [], milestones: [], sprints: [] };
    ensureBoardTimelineBaseline(data);
    const status = (value: string, at: string) => {
        const before = data.board.tasks[0].status;
        data.board.tasks[0].status = value;
        appendTimelineEvent(data, { kind: 'task.status.changed', entityType: 'task', entityId: '1', summary: 'Change', at, changes: { status: { before, after: value } } });
    };
    const close = (id: string, at: string, state = 'testing') => {
        data.board.tasks[0].status = state;
        data.board.tasks[0].sprintId = id;
        data.extensions.roadmap!.sprints.push({ id, title: id, status: 'active', startDate: at.slice(0, 10) });
        closeSprint(data, id);
        data.extensions.sprintResults!.closures.at(-1)!.closedAt = at;
    };
    return { data, status, close };
}

describe('Sprint execution history', () => {
    it('counts weekdays, preserves same-day zero, and rejects reversed intervals', () => {
        expect(businessDaysBetween('2026-01-02T12:00:00Z', '2026-01-05T12:00:00Z')).toBe(1);
        expect(businessDaysBetween('2026-01-05T10:00:00Z', '2026-01-05T12:00:00Z')).toBe(0);
        expect(businessDaysBetween('2026-01-06T12:00:00Z', '2026-01-05T12:00:00Z')).toBeNull();
        expect(businessDaysBetween('2026-01-05T00:30:00+01:00', '2026-01-05T01:00:00Z')).toBe(0);
    });
    it('uses the first real In Progress and Testing transitions, even before sprint start, once across sprints', () => {
        const { data, status, close } = fixture();
        status('doing', '2026-01-02T12:00:00Z');
        status('testing', '2026-01-05T12:00:00Z');
        close('s1', '2026-01-06T12:00:00Z');
        status('doing', '2026-01-07T12:00:00Z');
        status('testing', '2026-01-12T12:00:00Z');
        close('s2', '2026-01-13T12:00:00Z');
        const result = sprintExecution(data);
        expect(result.cycles).toHaveLength(1);
        expect(result.cycles[0]).toMatchObject({ days: 1, points: 3 });
        expect(result.sprints.get('s2')?.medianCycleTime).toBe(1);
    });
    it('uses Done as the first endpoint when Testing was skipped, sharing the metric and plot observations', () => {
        const { data, status, close } = fixture();
        status('doing', '2026-01-02T12:00:00Z');
        status('done', '2026-01-05T12:00:00Z');
        status('testing', '2026-01-07T12:00:00Z');
        close('s1', '2026-01-08T12:00:00Z');
        const result = sprintExecution(data);
        expect(result.cycles[0]).toMatchObject({ days: 1, testingAt: '2026-01-05T12:00:00Z' });
        expect(result.sprints.get('s1')?.medianCycleTime).toBe(1);
    });
    it('does not fabricate a start from a baseline already in progress or infer a missing estimate as zero', () => {
        const { data, status, close } = fixture();
        data.extensions.timeline!.events[0].snapshot!.board!.tasks[0].status = 'doing';
        status('testing', '2026-01-05T12:00:00Z');
        close('s1', '2026-01-06T12:00:00Z');
        expect(sprintExecution(data).cycles).toEqual([]);
        expect(sprintExecution(data).sprints.get('s1')?.medianCycleTime).toBeNull();
        const second = fixture();
        second.data.board.tasks[0].storyPoints = null;
        second.status('doing', '2026-01-02T12:00:00Z');
        second.status('testing', '2026-01-05T12:00:00Z');
        second.close('s1', '2026-01-06T12:00:00Z');
        expect(sprintExecution(second.data).cycles[0]).toMatchObject({ points: null, days: 1 });
    });
    it('does not replace a missing first transition with a later work cycle', () => {
        const { data, status, close } = fixture();
        data.extensions.timeline!.events[0].snapshot!.board!.tasks[0].status = 'doing';
        status('backlog', '2026-01-02T12:00:00Z');
        status('doing', '2026-01-05T12:00:00Z');
        status('testing', '2026-01-06T12:00:00Z');
        close('s1', '2026-01-07T12:00:00Z');
        expect(sprintExecution(data).cycles).toEqual([]);
    });
    it('does not measure a later Testing visit after the first Testing preceded In Progress', () => {
        const { data, status, close } = fixture();
        status('testing', '2026-01-02T12:00:00Z');
        status('doing', '2026-01-05T12:00:00Z');
        status('testing', '2026-01-06T12:00:00Z');
        close('s1', '2026-01-07T12:00:00Z');
        expect(sprintExecution(data).cycles).toEqual([]);
    });
    it('excludes in-sprint regressions and supersedes an earlier Testing closure with a Done closure', () => {
        const { data, status, close } = fixture();
        status('doing', '2026-01-02T12:00:00Z');
        status('testing', '2026-01-05T12:00:00Z');
        status('doing', '2026-01-06T12:00:00Z');
        status('testing', '2026-01-07T12:00:00Z');
        close('s1', '2026-01-08T12:00:00Z');
        status('done', '2026-01-09T12:00:00Z');
        close('s2', '2026-01-12T12:00:00Z', 'done');
        status('doing', '2026-01-13T12:00:00Z');
        expect(sprintExecution(data).sprints.get('s1')?.rework).toHaveLength(0);
        expect(sprintExecution(data).sprints.get('s2')?.rework).toHaveLength(0);
    });
    it('attributes regressions through Backlog once per closure, and allows separate later cycles', () => {
        const { data, status, close } = fixture();
        status('doing', '2026-01-02T12:00:00Z');
        status('testing', '2026-01-05T12:00:00Z');
        close('s1', '2026-01-06T12:00:00Z');
        status('backlog', '2026-01-07T12:00:00Z');
        status('doing', '2026-01-08T12:00:00Z');
        status('testing', '2026-01-09T12:00:00Z');
        status('doing', '2026-01-12T12:00:00Z');
        status('testing', '2026-01-13T12:00:00Z');
        close('s2', '2026-01-14T12:00:00Z');
        status('doing', '2026-01-15T12:00:00Z');
        status('done', '2026-01-16T12:00:00Z');
        close('s3', '2026-01-19T12:00:00Z', 'done');
        status('doing', '2026-01-20T12:00:00Z');
        const result = sprintExecution(data);
        expect([...result.sprints.values()].map(row => [row.rework?.length, row.reworkPercent])).toEqual([[1, 100], [1, 100], [0, 0]]);
        expect(result.medianRework).toBe(1);
    });
    it('assigns a late regression only to the latest closure and leaves frozen records intact', () => {
        const { data, status, close } = fixture();
        status('testing', '2026-01-05T12:00:00Z');
        close('s1', '2026-01-06T12:00:00Z');
        close('s2', '2026-01-07T12:00:00Z');
        status('doing', '2026-01-08T12:00:00Z');
        const frozen = JSON.stringify(data.extensions.sprintResults);
        const result = sprintExecution(data);
        expect(result.sprints.get('s1')?.rework).toHaveLength(0);
        expect(result.sprints.get('s2')?.rework).toHaveLength(1);
        expect(JSON.stringify(data.extensions.sprintResults)).toBe(frozen);
    });
    it('does not count a regression at the exact closure instant, across equivalent timestamp formats', () => {
        const { data, status, close } = fixture();
        status('testing', '2026-01-05T12:00:00Z');
        close('s1', '2026-01-06T12:00:00.000Z');
        status('doing', '2026-01-06T12:00:00Z');
        expect(sprintExecution(data).sprints.get('s1')?.rework).toHaveLength(0);
    });
    it('distinguishes unavailable post-closure history from a measured zero', () => {
        const { data, close } = fixture();
        close('s1', '2026-01-06T12:00:00Z');
        delete data.extensions.timeline;
        expect(sprintExecution(data).sprints.get('s1')?.rework).toBeNull();
        expect(sprintExecution(data).medianRework).toBeNull();
    });
});
