import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { readFileSync } from 'node:fs';
import { createEmptyProjectData, validateBoardData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { workitemId, workitemLabel } from '@/domain/taskIdentity';
import { assertWorkitems } from '@/domain/workitems';
import { parseProjectData, assertUniqueProjectAcronym } from '@/domain/projectData';
import { serializeBoardDataFromObject } from '@/domain/serialize';
import { reconstructBoardStateFromTimeline } from '@/domain/timeline';
import { createAppStore } from '@/features/portfolio/state/store';
import { createPortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';
import { tableCellValue } from '@/features/portfolio/table/tableModel';
import { taskMatchesPortfolioFilters, DEFAULT_PORTFOLIO_FILTERS } from '@/domain/portfolioFilters';
import type { WorkitemType } from '@/domain/types';

function setup({ legacy = false, writable = true } = {}) {
    const data = createEmptyProjectData('Checkout', 'CHK');
    if (legacy) delete data.extensions.project!.acronym;
    data.board.tasks = [normalizeTask({ id: 1201, title: 'Legacy item', type: 'task' })];
    const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', data, title: 'Checkout', fileName: 'checkout.board.json', handle: writable ? {} : null })], selectedPortfolioBoardId: 'p' });
    const prompt = vi.fn(async (): Promise<string | null> => 'chk'), alert = vi.fn(), enqueueSave = vi.fn(async () => true);
    const actions = createPortfolioMutationActions({ store, prompt, alert, enqueueSave, markDirty: vi.fn(), confirm: vi.fn(async () => true), closeDialogFn: vi.fn(), openDialogFn: vi.fn() });
    const current = () => store.getState().portfolioBoards[0].data;
    const create = (type: WorkitemType = 'task') => actions.createPortfolioTaskFromFields('p', { type, title: `New ${type}`, assignees: [], tags: [], priority: null, effort: null, dueDate: '' });
    return { store, actions, current, create, prompt, alert, enqueueSave };
}

describe('permanent workitem IDs', () => {
    it('allocates one sequence across all four types and preserves legacy IDs and history on reopen', async () => {
        const { create, current } = setup();
        for (const type of ['epic', 'story', 'task', 'bug'] as const) await create(type);
        expect(current().board.tasks.map(workitemId)).toEqual(['1201', 'CHK-EP-1202', 'CHK-US-1203', 'CHK-TK-1204', 'CHK-BG-1205']);
        const saved = serializeBoardDataFromObject(current());
        validateBoardData(saved);
        const reopened = serializeBoardDataFromObject(JSON.parse(JSON.stringify(saved)));
        expect(reopened.board.tasks).toEqual(saved.board.tasks);
        const replayed = reconstructBoardStateFromTimeline(reopened, reopened.extensions.timeline!.events.length - 1);
        expect(replayed.board.tasks.map(workitemId)).toEqual(saved.board.tasks.map(workitemId));
        expect(saved.extensions.timeline!.events.filter((event) => event.kind === 'task.created').map((event) => event.snapshot!.displayId)).toEqual(['CHK-EP-1202', 'CHK-US-1203', 'CHK-TK-1204', 'CHK-BG-1205']);
    });

    it('requests the missing legacy acronym once and replays configuration before the new item', async () => {
        const { create, current, prompt } = setup({ legacy: true });
        await create(); await create('bug');
        expect(prompt).toHaveBeenCalledTimes(1);
        expect(current().extensions.project!.acronym).toBe('CHK');
        const replayed = reconstructBoardStateFromTimeline(current(), current().extensions.timeline!.events.length - 1);
        expect(replayed.extensions.project!.acronym).toBe('CHK');
        expect(replayed.board.tasks.map(workitemId)).toEqual(['1201', 'CHK-TK-1202', 'CHK-BG-1203']);
    });

    it('does not consume a sequence or write when legacy configuration is cancelled or invalid', async () => {
        const { create, prompt, current, enqueueSave } = setup({ legacy: true });
        prompt.mockResolvedValueOnce(null);
        expect(await create()).toBeNull();
        prompt.mockResolvedValueOnce('4U');
        expect(await create()).toBeNull();
        expect(enqueueSave).not.toHaveBeenCalled();
        expect(current().board.tasks.map(workitemId)).toEqual(['1201']);
        expect(await create()).toBe(1202);
    });

    it('keeps created IDs after a project rename/acronym change, edits and serialization', async () => {
        const { create, current, actions } = setup(); await create();
        const original = structuredClone({ name: 'Checkout', project: current().extensions.project! });
        const draft = structuredClone(original); draft.name = 'Payments'; draft.project.acronym = 'PAY';
        expect(await actions.saveProjectSettings('p', draft, original)).toBe(true);
        await actions.setPortfolioTaskPriority('p', 1202, 'high');
        await create('bug');
        expect(current().board.tasks.map(workitemId)).toEqual(['1201', 'CHK-TK-1202', 'PAY-BG-1203']);
    });

    it('rejects changes to the stored ID and type, including adding an ID to a legacy item', async () => {
        const { create, current } = setup(); await create();
        for (const change of [{ displayId: 'PAY-TK-1202' }, { displayId: undefined }, { type: 'bug' as const }]) {
            const next = structuredClone(current()); Object.assign(next.board.tasks[1], change);
            expect(() => assertWorkitems(next, current())).toThrow();
        }
        const next = structuredClone(current()); next.board.tasks[0].displayId = 'CHK-TK-1201';
        expect(() => assertWorkitems(next, current())).toThrow();
        for (const displayId of ['CHK-BG-1202', 'CHK-TK-01202', 'CHK-TK-1203', 'TOOLONG-TK-1202']) {
            const invalid = structuredClone(current()); invalid.board.tasks[1].displayId = displayId;
            expect(() => validateBoardData(serializeBoardDataFromObject(invalid))).toThrow();
        }
    });

    it('never reuses a deleted ID or an ID removed by a timeline restore', async () => {
        const { create, actions, current } = setup(); await create();
        await actions.deletePortfolioTask('p', 1202);
        expect(await create('bug')).toBe(1203);
        actions.setPortfolioTimelineSelection('p', 0);
        expect(await actions.restorePortfolioTimelineSelection()).toBe(true);
        expect(current().board.tasks.map(workitemId)).toEqual(['1201']);
        expect(await create('epic')).toBe(1204);
        expect(current().board.tasks[1].displayId).toBe('CHK-EP-1204');
    });

    it('requires valid unique acronyms and rejects collisions atomically', async () => {
        const { create, current, store, actions } = setup();
        for (const acronym of ['', 'ABCD', 'A1', 'ab', 'á']) expect(() => parseProjectData({ ...current().extensions.project, acronym })).toThrow();
        const other = createEmptyProjectData('Other', 'OTH');
        store.setState({ portfolioBoards: [...store.getState().portfolioBoards, fromPartial({ id: 'other', data: other, title: 'Other', handle: {} })] });
        const original = structuredClone({ name: 'Checkout', project: current().extensions.project! });
        const draft = structuredClone(original); draft.project.acronym = 'OTH';
        expect(await actions.saveProjectSettings('p', draft, original)).toBe(false);
        expect(current().extensions.project!.acronym).toBe('CHK');
        expect(() => assertUniqueProjectAcronym(original.project, [{ ...other.extensions.project!, acronym: 'CHK' }])).toThrow();
        await create(); expect(current().board.tasks[1].displayId).toBe('CHK-TK-1202');
    });

    it('enforces read-only creation and exposes new IDs to table/CSV and search', async () => {
        const readOnly = setup({ writable: false }); expect(await readOnly.create()).toBeNull(); expect(readOnly.prompt).not.toHaveBeenCalled();
        const { create, current } = setup(); await create();
        const task = current().board.tasks[1];
        expect(tableCellValue(fromPartial({ task }), 'id', current())).toBe('CHK-TK-1202');
        expect(taskMatchesPortfolioFilters(task, { ...DEFAULT_PORTFOLIO_FILTERS, search: 'chk-tk-1202' }, current())).toBe(true);
        expect(workitemLabel(current().board.tasks[0])).toBe('#1201');
    });

    it('migrates schema 4 without rewriting legacy IDs or snapshots', () => {
        const raw = JSON.parse(readFileSync('test-board/us-12-support.board.json', 'utf8'));
        const tasks = structuredClone(raw.board.tasks), timeline = structuredClone(raw.extensions.timeline);
        const migrated = serializeBoardDataFromObject(raw);
        validateBoardData(migrated);
        expect(migrated.meta.schemaVersion).toBe(6);
        expect(migrated.board.tasks.map((task) => task.id)).toEqual(tasks.map((task: { id: number }) => task.id));
        expect(migrated.board.tasks.every((task) => task.displayId === undefined)).toBe(true);
        expect(migrated.extensions.timeline).toEqual(timeline);
    });
});
