import { isProjectTransferLocked } from './projectTransferLocks';
import { WorkitemError } from '@/domain/workitems';
import type { BoardData, Task } from '@/domain/types';
import type { BoardRecord, DialogName } from '@/features/portfolio/types';
import { useAppStore, type AppStore } from '@/features/portfolio/state/store';
import { getBoardTimelineData } from '@/domain/timeline';
import { applyWorkitemChange } from './workitemChanges';
import { isBoardInHistoricalPreview } from '@/features/portfolio/queries';
import { enqueueProjectSave, markProjectDirty } from '@/infrastructure/persistence/projectFiles';
import { closeDialog, openDialog } from '@/app/overlays/dialogs';
import { showAlert, showConfirm, showChoice, showPrompt, type ConfirmOptions } from '@/app/overlays/appMessages';
import { translateCurrent } from '@/shared/i18n';
import { assertUniqueProjectAcronym, ProjectDataError } from '@/domain/projectData';

// A board mutator edits the cloned board data in place; returning false
// discards the draft.
export type BoardMutator = (data: BoardData, draft: BoardRecord) => boolean;
export type TaskMutator = (task: Task, draft: BoardRecord) => boolean;

export type BoardMutationOptions = {
    store?: AppStore;
    enqueueSave?: (boardRecord: BoardRecord | null) => Promise<unknown>;
    markDirty?: (boardId: string) => unknown;
    closeDialogFn?: (name?: DialogName) => void;
    openDialogFn?: typeof openDialog;
    alert?: (text: string, options?: { title?: string }) => unknown;
    confirm?: (text: string, options?: ConfirmOptions) => unknown;
    choose?: typeof showChoice;
    prompt?: typeof showPrompt;
    onBoardChanged?: (boardId: string) => void;
};

type MutationOptions = { allowHistorical?: boolean; onMutated?: () => void; onCommitted?: () => void };

// `alert` and `confirm` return promises (see appMessages.ts); await `confirm`.
export function createBoardMutationContext({
    store = useAppStore,
    enqueueSave = enqueueProjectSave,
    markDirty = markProjectDirty,
    closeDialogFn = closeDialog,
    openDialogFn = openDialog,
    alert = showAlert,
    confirm = showConfirm,
    choose = showChoice,
    prompt = showPrompt,
    onBoardChanged = () => {}
}: BoardMutationOptions = {}) {
    const getState = store.getState;
    const commitState = store.setState;
    const getBoardRecord = (boardId: string): BoardRecord | null => getState().portfolioBoards.find((board) => board.id === boardId) || null;

    function findPortfolioTaskSource(boardId: string, taskId: unknown): { boardRecord: BoardRecord; taskIndex: number; task: Task } | null {
        const boardRecord = getBoardRecord(boardId);
        if (!boardRecord) return null;
        const taskIndex = boardRecord.data.board.tasks.findIndex((task) => Number(task.id) === Number(taskId));
        return taskIndex < 0 ? null : { boardRecord, taskIndex, task: boardRecord.data.board.tasks[taskIndex] };
    }

    function isPortfolioBoardMutable(boardId: string): boolean {
        return Boolean(getBoardRecord(boardId)?.handle);
    }

    function canUsePortfolioTaskMutations(boardId: string): boolean {
        return isPortfolioBoardMutable(boardId) && !isBoardInHistoricalPreview(getState(), boardId) && !isProjectTransferLocked(boardId);
    }

    function notifyPortfolioMutationUnavailable(boardId: string): void {
        alert(isBoardInHistoricalPreview(getState(), boardId)
            ? translateCurrent('messages.readOnlyHistorical')
            : translateCurrent('messages.readOnlyProject'));
    }

    async function runMutation(
        boardId: string,
        mutator: BoardMutator,
        { allowHistorical = false, onMutated = () => {}, onCommitted = () => {} }: MutationOptions = {},
        taskId?: number
    ): Promise<boolean> {
        const current = getBoardRecord(boardId);
        if (!current) return false;
        if (!isPortfolioBoardMutable(boardId) || (!allowHistorical && !canUsePortfolioTaskMutations(boardId))) {
            notifyPortfolioMutationUnavailable(boardId);
            return false;
        }
        const publish = async (draft: BoardRecord) => {
            if (draft.data.extensions.project && draft.data.extensions.project.acronym !== current.data.extensions.project?.acronym) assertUniqueProjectAcronym(draft.data.extensions.project, getState().portfolioBoards.filter((board) => board.id !== boardId).flatMap((board) => board.data.extensions.project ? [board.data.extensions.project] : []));
            draft.title = draft.data.board.settings.title;
            const state = getState();
            const timeline = getBoardTimelineData(draft.data);
            const pinLatest = state.selectedPortfolioBoardId === boardId || state.portfolioTimelineSelection.boardId === boardId;
            commitState({
                portfolioBoards: state.portfolioBoards.map((board) => board.id === boardId ? draft : board),
                ...(pinLatest ? { portfolioTimelineSelection: { boardId, eventIndex: (timeline?.events.length || 1) - 1 } } : {})
            });
            markDirty(boardId);
            onBoardChanged(boardId);
            onMutated();
            const saved = Boolean(await enqueueSave(getBoardRecord(boardId)));
            if (!saved) return false;
            onCommitted();
            return true;
        };
        try {
            return await applyWorkitemChange(current, mutator, {
                taskId, isCurrent: () => getBoardRecord(boardId)?.data === current.data, alert, confirm, prompt, publish
            });
        } catch (error) {
            alert(error instanceof WorkitemError ? translateCurrent(`workitems.error.${error.code}`) : error instanceof ProjectDataError ? translateCurrent(`project.error.${error.code}`)
                : translateCurrent('messages.portfolioUpdateFailed', { error: (error as Error).message }));
            return false;
        }
    }

    function runPortfolioBoardMutation(boardId: string, mutator: BoardMutator, options: MutationOptions = {}) {
        return runMutation(boardId, mutator, options);
    }

    function runPortfolioTaskMutation(boardId: string, taskId: unknown, mutator: TaskMutator, options: MutationOptions = {}): Promise<boolean> | false {
        if (!findPortfolioTaskSource(boardId, taskId)) return false;
        return runMutation(boardId, (data, draft) => {
            const task = data.board.tasks.find((entry) => entry.id === Number(taskId))!;
            return mutator(task, draft);
        }, options, Number(taskId));
    }

    return {
        getState, commitState, getBoardRecord, findPortfolioTaskSource,
        isPortfolioBoardMutable, canUsePortfolioTaskMutations, notifyPortfolioMutationUnavailable,
        runPortfolioBoardMutation, runPortfolioTaskMutation,
        alert, confirm, choose, prompt, closeDialogFn, openDialogFn, enqueueSave, markDirty, onBoardChanged
    };
}

export type BoardMutationContext = ReturnType<typeof createBoardMutationContext>;
