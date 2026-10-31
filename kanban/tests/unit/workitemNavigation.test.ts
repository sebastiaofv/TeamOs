import { describe, expect, it, vi } from 'vitest';
import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import { buildTaskDraft } from '@/domain/taskDraft';
import { createAppStore } from '@/features/portfolio/state/store';
import { createPortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';
import type { TaskEditorViewModel } from '@/features/portfolio/types';

function setup() {
    const data = createEmptyProjectData('Project', 'PRJ');
    data.board.tasks = [normalizeTask({ id: 1, title: 'Epic', type: 'epic', effort: null })];
    const store = createAppStore({ portfolioBoards: [{ id: 'p', title: 'Project', colorSeed: 0, fileName: 'p.json', handle: fromPartial({}), data }], selectedPortfolioBoardId: '', selectedPortfolioViewMode: 'board' });
    const alert = vi.fn();
    const actions = createPortfolioMutationActions({ store, alert, confirm: vi.fn(async () => true), markDirty: vi.fn(), enqueueSave: vi.fn(async () => true),
        openDialogFn: (name, props) => store.setState({ activeDialog: name, dialogProps: props }),
        closeDialogFn: (name) => { if (!name || name === store.getState().activeDialog) store.setState({ activeDialog: null, dialogProps: null }); }
    });
    const save = async (title: string) => {
        const vm: TaskEditorViewModel = fromAny(store.getState().dialogProps!);
        await actions.saveTask(buildTaskDraft({ ...vm.initial, title }));
    };
    return { actions, store, save, alert };
}

describe('Creation detail navigation', () => {
    it('opens the created workitem and unwinds Task → Story → Epic without changing the underlying portfolio view', async () => {
        const { actions, store, save, alert } = setup();
        actions.openPortfolioTaskDetails('p', 1);
        actions.openPortfolioCreateChildTask('p', 1, 'story');
        await save('Story');
        expect(alert).not.toHaveBeenCalled();
        expect(store.getState().portfolioDetailContext?.taskId).toBe(2);
        expect(store.getState().activeDialog).toBe('taskDetail');
        actions.openPortfolioCreateChildTask('p', 2, 'task');
        await save('Task');
        expect(store.getState().portfolioDetailContext?.taskId).toBe(3);
        expect(store.getState().portfolioDetailContext?.returnToDetail?.returnToDetail?.taskId).toBe(1);
        await actions.setPortfolioTaskProperties('p', 3, { priority: 'high' });
        actions.closeTaskDetail(); expect(store.getState().portfolioDetailContext?.taskId).toBe(2);
        actions.closeTaskDetail(); expect(store.getState().portfolioDetailContext?.taskId).toBe(1);
        actions.closeTaskDetail(); expect(store.getState().activeDialog).toBeNull();
        expect(store.getState().portfolioDetailContext).toBeNull();
        expect(store.getState().selectedPortfolioBoardId).toBe('');
        expect(store.getState().selectedPortfolioViewMode).toBe('board');
    });
    it('keeps the return chain after cancelling child creation and editing a nested item', async () => {
        const { actions, store, save } = setup();
        actions.openPortfolioTaskDetails('p', 1);
        actions.openPortfolioCreateChildTask('p', 1, 'story'); await save('Story');
        actions.openPortfolioCreateChildTask('p', 2, 'task'); actions.closeTaskEditor();
        expect(store.getState().portfolioBoards[0].data.board.tasks).toHaveLength(2);
        expect(store.getState().portfolioDetailContext?.taskId).toBe(2);
        actions.editPortfolioTask('p', 2); await save('Edited story');
        expect(store.getState().portfolioDetailContext?.taskId).toBe(2);
        actions.closeTaskDetail(); expect(store.getState().portfolioDetailContext?.taskId).toBe(1);
    });
    it('opens a standalone created workitem and skips a deleted return target', async () => {
        const standalone = setup();
        standalone.actions.openPortfolioCreateTaskModal('p', 'backlog'); await standalone.save('Standalone');
        expect(standalone.store.getState().portfolioDetailContext?.taskId).toBe(2);
        standalone.actions.closeTaskDetail(); expect(standalone.store.getState().activeDialog).toBeNull();
        const { actions, store, save } = setup();
        actions.openPortfolioTaskDetails('p', 1);
        actions.openPortfolioCreateRelatedTask('p', 1, 'related'); await save('Related item');
        store.setState((state) => ({ portfolioBoards: state.portfolioBoards.map((board) => ({ ...board, data: { ...board.data, board: { ...board.data.board, tasks: board.data.board.tasks.filter((task) => task.id !== 1) } } })) }));
        actions.closeTaskDetail(); expect(store.getState().activeDialog).toBeNull();
    });
});
