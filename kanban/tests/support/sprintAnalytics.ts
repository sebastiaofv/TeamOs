import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { closeSprint } from '../../src/domain/sprintResults';
import { appendTimelineEvent, ensureBoardTimelineBaseline } from '../../src/domain/timeline';
import { createBoardStateSnapshot } from '../../src/domain/serialize';
import { readFileSync } from 'node:fs';

export function sprintAnalyticsFixture(count = 2) {
    const base = JSON.parse(readFileSync('tests/fixtures/manual/us-9.board.json', 'utf8'));
    const closures = Array.from({ length: count }, (_, index) => {
        const early = index === 0;
        const id = `closed-${index + 1}`;
        const startDate = `2026-${String(index + 1).padStart(2, '0')}-01`;
        const sprint = { id, title: `Sprint ${index + 1}`, status: 'done', startDate, endDate: `2026-${String(index + 1).padStart(2, '0')}-14`, capacity: early ? 8 : 20 };
        return { sprint, sprintId: id, closedAt: `${sprint.endDate}T12:00:00Z`, tasks: [
            { ...base.board.tasks[0], id: 1, title: 'Frozen planned work', type: 'task', parentId: null, sprintId: id, storyPoints: 5, status: 'accepted' },
            { ...base.board.tasks[0], id: 2, title: 'Frozen carryover', type: 'bug', parentId: null, sprintId: id, storyPoints: 5, status: 'doing' }
        ], workflow: base.extensions.workflow, functionalWorkflow: base.extensions.workflow,
        plannedPoints: early ? 10 : 20, completedIds: [1], carryOverIds: early ? [2] : [], velocity: early ? 5 : 20,
        initialPlan: { plannedPoints: early ? 10 : 20, completedPlannedPoints: early ? 5 : 20 } };
    });
    // Many-Sprint tests stay within a calendar year with valid daily dates.
    if (count > 12) closures.forEach((closure, index) => {
        closure.sprint.startDate = `2026-01-${String(index + 1).padStart(2, '0')}`;
        closure.sprint.endDate = closure.sprint.startDate;
        closure.closedAt = `${closure.sprint.endDate}T12:00:00Z`;
    });
    return { ...base, board: { ...base.board, tasks: [] }, extensions: { workflow: base.extensions.workflow, functionalWorkflow: base.extensions.workflow,
        roadmap: { version: 5, phases: [], milestones: [], sprints: [...closures.map(closure => closure.sprint), { id: 'active', title: 'Active Sprint', status: 'active', startDate: '2026-11-01', endDate: '2026-11-15' }, { id: 'planned', title: 'Planned Sprint', status: 'planned', startDate: '2026-12-01', endDate: '2026-12-15' }] },
        sprintResults: { version: 1, credits: [], closures } } };
}

/** Real legacy timeline and lifecycle records for execution/rework integration tests. */
export function sprintExecutionFixture() {
    const data = createEmptyProjectData('Execution Analytics', 'EXE');
    data.meta.createdAt = data.meta.updatedAt = '2026-01-01T12:00:00Z';
    data.board.tasks = [
        normalizeTask({ assigneeIds: [], responsibleId: '', id: 1, type: 'story', title: 'First execution', status: 'to-do', storyPoints: 3, sprintId: 's1', createdAt: data.meta.createdAt }),
        normalizeTask({ assigneeIds: [], responsibleId: '', id: 2, type: 'bug', title: 'Second execution', status: 'to-do', storyPoints: 3, sprintId: 's1', createdAt: data.meta.createdAt }),
        normalizeTask({ assigneeIds: [], responsibleId: '', id: 3, type: 'task', title: 'Same-day execution', status: 'to-do', storyPoints: 5, sprintId: 's1', createdAt: data.meta.createdAt }),
        normalizeTask({ assigneeIds: [], responsibleId: '', id: 4, type: 'task', title: 'Unestimated execution', status: 'to-do', storyPoints: null, sprintId: 's1', createdAt: data.meta.createdAt })
    ];
    data.extensions.roadmap = { version: 5, phases: [], milestones: [], sprints: [{ id: 's1', title: 'Sprint One', status: 'planned', startDate: '2026-01-05', endDate: '2026-01-09', capacity: 20 }] };
    ensureBoardTimelineBaseline(data);
    const snapshot = (at: string) => appendTimelineEvent(data, { kind: 'roadmap.updated', entityType: 'board', entityId: 'board', summary: 'Sprint change', at, snapshot: createBoardStateSnapshot(data) });
    const state = (id: number, status: string, at: string) => {
        const task = data.board.tasks.find(task => task.id === id)!;
        const before = task.status;
        task.status = status;
        appendTimelineEvent(data, { kind: 'task.status.changed', entityType: 'task', entityId: String(id), summary: 'Status', at, changes: { status: { before, after: status } } });
    };
    data.extensions.roadmap.sprints[0].status = 'active'; snapshot('2026-01-05T09:00:00Z');
    state(1, 'doing', '2026-01-05T10:00:00Z');
    state(2, 'doing', '2026-01-06T10:00:00Z');
    state(4, 'doing', '2026-01-06T10:00:00Z');
    state(2, 'testing', '2026-01-08T10:00:00Z');
    state(4, 'testing', '2026-01-08T10:00:00Z');
    state(3, 'doing', '2026-01-09T10:00:00Z');
    state(3, 'testing', '2026-01-09T12:00:00Z');
    state(1, 'testing', '2026-01-09T15:00:00Z');
    closeSprint(data, 's1'); data.extensions.sprintResults!.closures[0].closedAt = '2026-01-09T17:00:00Z';
    data.extensions.roadmap.sprints[0].status = 'done'; snapshot('2026-01-09T17:00:00Z');
    state(1, 'doing', '2026-01-12T10:00:00Z');
    state(1, 'testing', '2026-01-13T10:00:00Z');
    data.extensions.roadmap.sprints.push({ id: 's2', title: 'Sprint Two', status: 'active', startDate: '2026-01-12', endDate: '2026-01-16', capacity: 20 });
    for (const task of data.board.tasks) task.sprintId = 's2';
    snapshot('2026-01-13T12:00:00Z');
    closeSprint(data, 's2'); data.extensions.sprintResults!.closures[1].closedAt = '2026-01-16T17:00:00Z';
    data.extensions.roadmap.sprints[1].status = 'done'; snapshot('2026-01-16T17:00:00Z');
    state(1, 'doing', '2026-01-19T10:00:00Z');
    return data;
}

export function sprintRemovedWorkFixture() {
    const data = sprintExecutionFixture();
    const sprint = { id: 'removed', title: 'Removed scope Sprint', status: 'planned' as 'planned' | 'active' | 'done', startDate: '2026-02-02', endDate: '2026-02-06' };
    data.extensions.roadmap!.sprints.push(sprint);
    const observe = (date: string) => appendTimelineEvent(data, { kind: 'board.workitems.updated', entityType: 'board', entityId: 'board', summary: 'Scope', at: `${date}T12:00:00Z`, snapshot: createBoardStateSnapshot(data) });
    observe('2026-02-01');
    sprint.status = 'active'; observe('2026-02-02');
    data.board.tasks.push(normalizeTask({ id: 90, title: 'Temporary work', type: 'bug', status: 'doing', sprintId: sprint.id, storyPoints: 5, createdAt: '2026-02-03T09:00:00Z' })); observe('2026-02-03');
    data.board.tasks = data.board.tasks.filter(task => task.id !== 90); observe('2026-02-04');
    closeSprint(data, sprint.id); data.extensions.sprintResults!.closures.at(-1)!.closedAt = '2026-02-06T12:00:00Z';
    sprint.status = 'done'; observe('2026-02-06');
    return data;
}
