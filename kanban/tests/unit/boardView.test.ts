import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { hiddenBoardStates, parseBoardView, setBoardColumnVisibility } from '../../src/domain/boardView';
import { applyWorkflow, getWorkflow } from '../../src/domain/workflow';
import { normalizeTask } from '../../src/domain/task';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';
import { buildPortfolioBoardView } from '../../src/features/portfolio/queries/portfolioBoardView';

function setup(writable = true) {
    const data = createEmptyProjectData('Columns');
    data.board.tasks = [normalizeTask({ id: 1, title: 'Kept', status: 'cancelled' })];
    const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Columns', handle: writable ? {} : null, data })], selectedPortfolioBoardId: 'p' });
    const save = vi.fn(async () => true); const alert = vi.fn();
    const actions = createPortfolioMutationActions({ store, enqueueSave: save, alert, markDirty: vi.fn(), openDialogFn: vi.fn() });
    return { store, actions, save, data: () => store.getState().portfolioBoards[0].data };
}

describe('persisted Board column visibility', () => {
    it('defaults old projects to every workflow state visible', () => {
        const { store, data } = setup();
        expect(hiddenBoardStates(data()).size).toBe(0);
        expect(buildPortfolioBoardView(store.getState()).columns.map((column) => column.status)).toEqual(getWorkflow(data()).states.map((state) => state.id));
        expect(parseBoardView(undefined)).toBeUndefined();
    });
    it('saves and replays visibility without deleting states, tasks, history or assignments', async () => {
        const { store, actions, data, save } = setup();
        const original = structuredClone(data().board);
        expect(await actions.setPortfolioBoardColumnVisibility('p', 'cancelled', false)).toBe(true);
        const next = serializeBoardDataFromObject(data()); validateBoardData(next);
        expect(next.extensions.boardView).toEqual({ version: 1, hiddenStateIds: ['cancelled'] });
        expect(next.board).toEqual(original);
        expect(buildPortfolioBoardView(store.getState()).columns.some((column) => column.status === 'cancelled')).toBe(false);
        expect(next.extensions.timeline!.events).toHaveLength(2);
        expect(reconstructBoardStateFromTimeline(next, 0).extensions.boardView).toBeUndefined();
        expect(reconstructBoardStateFromTimeline(next, 1).extensions.boardView).toEqual(next.extensions.boardView);
        expect(await actions.setPortfolioBoardColumnVisibility('p', 'cancelled', false)).toBe(false);
        expect(save).toHaveBeenCalledTimes(1);
        expect(await actions.setPortfolioBoardColumnVisibility('p', 'cancelled', true)).toBe(true);
        expect(data().extensions.boardView!.hiddenStateIds).toEqual([]);
    });
    it('allows hiding every column and showing any of them again', () => {
        const { data } = setup();
        const current = data();
        getWorkflow(current).states.forEach((state) => setBoardColumnVisibility(current, state.id, false));
        expect(hiddenBoardStates(current).size).toBe(9);
        setBoardColumnVisibility(current, 'backlog', true);
        expect(hiddenBoardStates(current).has('backlog')).toBe(false);
        expect(current.board.tasks).toHaveLength(1);
    });
    it('rejects malformed, future, duplicate or dangling preferences instead of silently losing them', () => {
        for (const value of [{ version: 2, hiddenStateIds: [] }, { version: 1, hiddenStateIds: [3] }, { version: 1, hiddenStateIds: ['done', 'done'] }, { version: 1, hiddenStateIds: ['missing'] }]) {
            expect(() => parseBoardView(value, new Set(['done']))).toThrow(/boardView/);
        }
        const { data } = setup(); data().extensions.boardView = { version: 1, hiddenStateIds: ['missing'] };
        expect(() => validateBoardData(data())).toThrow(/boardView/);
        expect(() => serializeBoardDataFromObject(data())).toThrow(/boardView/);
    });
    it('preserves hidden state IDs across rename/reorder and cleans them on state deletion', () => {
        const { data } = setup(); const current = data();
        setBoardColumnVisibility(current, 'duplication', false);
        const workflow = getWorkflow(current); workflow.states.find((state) => state.id === 'duplication')!.name = 'Duplicate'; workflow.states.reverse();
        applyWorkflow(current, workflow, {});
        expect(hiddenBoardStates(current).has('duplication')).toBe(true);
        workflow.states = workflow.states.filter((state) => state.id !== 'duplication'); delete workflow.transitions.duplication;
        Object.keys(workflow.transitions).forEach((id) => { workflow.transitions[id] = workflow.transitions[id].filter((target) => target !== 'duplication'); });
        applyWorkflow(current, workflow, {});
        expect(current.extensions.boardView!.hiddenStateIds).toEqual([]); validateBoardData(current);
    });
    it('isolates preferences per project even when the aggregate uses a shared status ID', () => {
        const { store, data } = setup();
        setBoardColumnVisibility(data(), 'cancelled', false);
        const other = createEmptyProjectData('Other'); other.board.tasks = [normalizeTask({ id: 1, title: 'Other', status: 'cancelled' })];
        store.setState({ portfolioBoards: [...store.getState().portfolioBoards, fromPartial({ id: 'q', title: 'Other', data: other })], selectedPortfolioBoardId: '' });
        const view = buildPortfolioBoardView(store.getState());
        expect(view.columns.some((column) => column.status === 'cancelled')).toBe(true);
        expect(view.buckets.cancelled.map((row) => row.boardId)).toEqual(['q']);
    });
    it('protects commands in read-only and historical contexts', async () => {
        const readOnly = setup(false);
        expect(await readOnly.actions.setPortfolioBoardColumnVisibility('p', 'done', false)).toBe(false);
        expect(readOnly.save).not.toHaveBeenCalled();
        const { actions, store, data, save } = setup();
        await actions.setPortfolioBoardColumnVisibility('p', 'done', false);
        store.setState({ portfolioTimelineSelection: { boardId: 'p', eventIndex: 0 } });
        expect(await actions.setPortfolioBoardColumnVisibility('p', 'cancelled', false)).toBe(false);
        expect(save).toHaveBeenCalledTimes(1); expect(data().extensions.boardView!.hiddenStateIds).toEqual(['done']);
        expect(buildPortfolioBoardView(store.getState()).columns.some((column) => column.status === 'done')).toBe(true);
    });
});
