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
