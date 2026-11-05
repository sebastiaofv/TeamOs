import { formatPlannerDateLabel } from '@/shared/i18n';
import type { showConfirm } from '@/app/overlays/appMessages';
import { parseQuickCreate } from '@/features/portfolio/palette/quickCreate';
import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { defaultWorkflow, nextWorkflowState, workflowKind } from '@/domain/workflow';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from '@/domain/serialize';
import { reconstructBoardStateFromTimeline } from '@/domain/timeline';
import { assertAcceptance, isPlanningUnit, syncWorkitemPlanning } from '@/domain/workitems';
import { parseDateInput, formatDate, formatTimestamp } from '@/domain/dates';
import { sprintPhaseDateConflicts } from '@/domain/sprintPhaseDates';
import { createAppStore } from '@/features/portfolio/state/store';
import { createPortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';
import { buildPortfolioBoardView } from '@/features/portfolio/queries/portfolioBoardView';
import { buildPortfolioTasks } from '@/features/portfolio/queries/portfolioRowViews';
import { buildPortfolioCalendarViewModel } from '@/features/portfolio/queries/portfolioCalendarViews';
import { buildPortfolioPlannerViewModel } from '@/features/portfolio/queries/portfolioPlannerViews';

function setup() {
    const data = createEmptyProjectData('Planning', 'PLAN');
    data.extensions.roadmap = { version: 5, phases: [{ id: 'phase', title: 'Delivery', startDate: '2026-11-05', endDate: '2026-11-10' }], milestones: [], sprints: [
        { id: 'active', title: 'Current', startDate: '2026-11-01', endDate: '2026-11-15' },
        { id: 'future', title: 'Future', startDate: '2099-01-01', endDate: '2099-01-10' }
    ] };
    const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Planning', data, handle: {} })], selectedPortfolioBoardId: 'p' });
    const confirm = vi.fn<typeof showConfirm>(async () => ({ phase: 'update' }));
    const actions = createPortfolioMutationActions({ store, confirm, alert: vi.fn(), prompt: async () => 'Ana', enqueueSave: async () => true, markDirty: vi.fn(), openDialogFn: vi.fn(), closeDialogFn: vi.fn() });
    return { data, store, confirm, actions, current: () => store.getState().portfolioBoards[0].data };
}

describe('issue 54 agreed planning changes', () => {
    it('creates each Bug and its execution Task atomically with permanent identities and replayable history', async () => {
        const { actions, current } = setup();
        const id = await actions.createPortfolioTaskFromFields('p', { type: 'bug', title: 'Checkout fails', assignees: [], tags: [], priority: 'high', effort: 'M', dueDate: '2026-11-10' });
        const [bug, task] = current().board.tasks;
        expect(id).toBe(1);
        expect(bug).toMatchObject({ type: 'bug', displayId: 'PLAN-BG-1' });
        expect(task).toMatchObject({ type: 'task', displayId: 'PLAN-TK-2', parentId: 1, phaseMode: 'inherit', milestoneMode: 'inherit', priority: 'high', dueDate: '2026-11-10' });
        expect(task.permanentId).not.toBe(bug.permanentId);
        expect(workflowKind(bug)).toBe('functional');
        expect(workflowKind(task)).toBe('technical');
        expect(() => assertAcceptance(current(), bug)).toThrow('pending');
        expect(isPlanningUnit(current(), task)).toBe(false);
        const saved = serializeBoardDataFromObject(current());
        expect(() => validateBoardData(saved)).not.toThrow();
        const replayed = reconstructBoardStateFromTimeline(saved, saved.extensions.timeline!.events.length - 1);
        expect(replayed.board.tasks).toEqual(saved.board.tasks);
    });

    it('maps a legacy Bug to a functional state of the same category and accepts retired severity data', () => {
        const { data } = setup();
        const functional = defaultWorkflow();
        functional.states.find((state) => state.id === 'doing')!.id = 'analysis';
        functional.references['in-progress'] = 'analysis';
        functional.transitions.analysis = functional.transitions.doing;
        delete functional.transitions.doing;
        for (const state of Object.keys(functional.transitions)) functional.transitions[state] = functional.transitions[state].map((id) => id === 'doing' ? 'analysis' : id);
        data.extensions.functionalWorkflow = functional;
        data.board.tasks.push(normalizeTask({ id: 9, title: 'Legacy Bug', type: 'bug', status: 'doing', assigneeIds: [], responsibleId: '' }));
        data.board.tasks[0].severity = 'critical';
        expect(() => validateBoardData(data)).not.toThrow();
        for (const normalized of [createBoardStateSnapshot(data), serializeBoardDataFromObject(data)]) {
            expect(normalized.board.tasks[0]).toMatchObject({ id: 9, status: 'analysis' });
            expect(normalized.board.tasks[0].severity).toBeUndefined();
            expect(() => validateBoardData(normalized)).not.toThrow();
        }
    });

    it('filters active Sprints inclusively while the all-items Board includes unsprinted Tasks', () => {
        const { data, store } = setup();
        data.board.tasks = [normalizeTask({ id: 1, title: 'Active', status: 'to-do', sprintId: 'active' }), normalizeTask({ id: 2, title: 'Future', status: 'to-do', sprintId: 'future' }), normalizeTask({ id: 3, title: 'Unplanned', status: 'to-do' })];
        const state = { ...store.getState(), portfolioVisibleRows: buildPortfolioTasks(store.getState()) };
        expect(buildPortfolioBoardView(state, 'technical', { activeSprintsOnly: true, today: '2026-11-15' }).buckets['to-do'].map((row) => row.taskId)).toEqual([1]);
        expect(buildPortfolioBoardView(state, 'technical').buckets['to-do'].map((row) => row.taskId)).toEqual([1, 2, 3]);
    });

    it('follows forward allowed transitions and supports workflow loops', () => {
        const { data } = setup();
        expect(nextWorkflowState(data, { status: 'doing' })?.id).toBe('ready-to-test');
        expect(nextWorkflowState(data, { status: 'testing' })?.id).toBe('done');
        expect(nextWorkflowState(data, { status: 're-analysis' })?.id).toBe('doing');
        expect(nextWorkflowState(data, { status: 'done' })).toBeUndefined();
    });

    it('warns once per inherited phase, expands both date boundaries, and records the choice in history', async () => {
        vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
        try {
            const { data, store, actions, current, confirm } = setup();
            data.board.tasks = [normalizeTask({ id: 1, title: 'Story', type: 'story', phaseId: 'phase', phaseMode: 'explicit' }), normalizeTask({ id: 2, title: 'Task', parentId: 1, phaseMode: 'inherit' })];
            store.setState({ portfolioBoards: store.getState().portfolioBoards.map((board) => ({ ...board, data })) });
            expect(await actions.setPortfolioTaskProperties('p', 1, { sprintId: 'active' })).toBe(true);
            expect(current().board.tasks[1].sprintId).toBe('active');
            expect(confirm.mock.calls.some(([text]) => text.includes('falls outside'))).toBe(true);
            expect(current().extensions.roadmap!.phases[0]).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-15' });
            expect(current().extensions.timeline!.events.some((event) => event.kind === 'roadmap.updated')).toBe(true);
            const replayed = reconstructBoardStateFromTimeline(current(), current().extensions.timeline!.events.length - 1);
            expect(replayed.extensions.roadmap!.phases).toEqual(current().extensions.roadmap!.phases);
        } finally { vi.useRealTimers(); }
    });

    it('does not warn again for unchanged allocations and detects a Task added directly to an incompatible Sprint', () => {
        const { data } = setup();
        const before = structuredClone(data);
        data.board.tasks = [normalizeTask({ id: 1, title: 'Task', phaseId: 'phase', phaseMode: 'explicit', sprintId: 'active' })];
        expect(sprintPhaseDateConflicts(data, before)).toMatchObject([{ phaseId: 'phase', startDate: '2026-11-01', endDate: '2026-11-15', tasks: [1] }]);
        expect(sprintPhaseDateConflicts(data, data)).toEqual([]);
    });

    it('removes legacy Sprint-to-phase associations while preserving workitem phases', () => {
        const { data } = setup(); data.extensions.roadmap!.sprints[0].parentId = 'phase';
        data.board.tasks.push(normalizeTask({ id: 1, title: 'Task', phaseId: 'phase' }));
        const saved = serializeBoardDataFromObject(data);
        expect(saved.extensions.roadmap!.sprints[0].parentId).toBeUndefined();
        expect(saved.board.tasks[0].phaseId).toBe('phase');
    });

    it('limits Calendar and Planner to Tasks, including legacy archived Tasks', () => {
        const { data, store } = setup();
        data.board.tasks = (['task', 'bug', 'story', 'epic'] as const).map((type, index) => normalizeTask({ id: index + 1, title: type, type, status: 'to-do', dueDate: '2026-11-05', archived: true }));
        const state = { ...store.getState(), portfolioVisibleRows: buildPortfolioTasks(store.getState()) };
        expect(buildPortfolioCalendarViewModel(state).items.map((item) => item.taskId)).toEqual([1]);
        expect(buildPortfolioPlannerViewModel(state, { today: '2026-11-05', trayStatuses: ['to-do'], includeParents: true }).trayGroups[0].items.map((item) => item.taskId)).toEqual([1]);
    });

    it('keeps unfinished Bug child Tasks in the parent Sprint without changing Story automation', () => {
        const { data } = setup(); const before = structuredClone(data);
        data.board.tasks = [normalizeTask({ id: 1, title: 'Bug', type: 'bug', sprintId: 'future' }), normalizeTask({ id: 2, title: 'Task', parentId: 1 })];
        syncWorkitemPlanning(data, before);
        expect(data.board.tasks[1].sprintId).toBe('future');
        expect(data.extensions.workitemAutomation).toBeUndefined();
    });
});

describe('uniform date entry', () => {
    it('validates real dates, leap years and unambiguous day/month/year input', () => {
        expect(parseDateInput('05/11/2026')).toBe('2026-11-05');
        expect(parseDateInput('29/02/2024')).toBe('2024-02-29');
        for (const value of ['29/02/2025', '31/04/2026', '5/11/2026', '11/32/2026', '2026-11-05']) expect(parseDateInput(value)).toBeNull();
        expect(parseDateInput('')).toBe('');
        expect(parseQuickCreate('+ Task due:05/11/2026', { people: [], projects: [], defaultProjectId: 'p', today: '2026-11-01' }).dueDate).toBe('2026-11-05');
        expect(formatDate('2026-11-05')).toBe('05/11/2026');
        expect(formatPlannerDateLabel('en', '2026-11-05')).toBe('Thursday, 05/11/2026');
        expect(formatTimestamp('2026-11-05T23:05:01Z')).toBe('05/11/2026 23:05:01');
    });
});
