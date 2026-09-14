import { useAppStore } from '../state/store.js';
import { cloneSerializable } from '../domain/serialize.js';
import {
    captureTaskTimelineSnapshot,
    ensureBoardTimelineBaseline,
    getBoardTimelineData,
    recordTaskTimelineEvent,
} from '../domain/timeline.js';
import { touchTask } from '../domain/task.js';
import { isBoardInHistoricalPreview } from '../selectors/portfolioViews.js';
import { enqueueProjectSave, markProjectDirty } from '../persistence/projectFiles.js';
import { closeDialog, openDialog } from './dialogs.js';
import { showAlert, showConfirm } from './appMessages.js';

// `alert` and `confirm` return promises (see appMessages.js); await `confirm`.
export function createBoardMutationContext({
    store = useAppStore,
    enqueueSave = enqueueProjectSave,
    markDirty = markProjectDirty,
    closeDialogFn = closeDialog,
    openDialogFn = openDialog,
    alert = showAlert,
    confirm = showConfirm,
    onBoardChanged = () => {}
} = {}) {
    const getState = store.getState;
    const commitState = store.setState;
    const getBoardRecord = (boardId) => getState().portfolioBoards.find((board) => board.id === boardId) || null;

    function findPortfolioTaskSource(boardId, taskId) {
        const boardRecord = getBoardRecord(boardId);
        const taskIndex = boardRecord?.data.board.tasks.findIndex((task) => Number(task.id) === Number(taskId)) ?? -1;
        return taskIndex < 0 ? null : { boardRecord, taskIndex, task: boardRecord.data.board.tasks[taskIndex] };
    }

    function isPortfolioBoardMutable(boardId) {
        return Boolean(getBoardRecord(boardId)?.handle);
    }

    function canUsePortfolioTaskMutations(boardId) {
        return isPortfolioBoardMutable(boardId) && !isBoardInHistoricalPreview(getState(), boardId);
    }

    function notifyPortfolioMutationUnavailable(boardId) {
        alert(isBoardInHistoricalPreview(getState(), boardId)
            ? 'Historical preview is read-only. Click Latest to resume editing.'
            : 'This project is read-only because it was loaded without a file handle.');
    }

    async function runPortfolioBoardMutation(boardId, mutator, { allowHistorical = false, onCommitted = () => {} } = {}) {
        const current = getBoardRecord(boardId);
        if (!current) return false;
        if (!isPortfolioBoardMutable(boardId) || (!allowHistorical && !canUsePortfolioTaskMutations(boardId))) {
            notifyPortfolioMutationUnavailable(boardId);
            return false;
        }
        const draft = { ...current, data: cloneSerializable(current.data) };
        try {
            ensureBoardTimelineBaseline(draft.data);
            if (mutator(draft.data, draft) === false) return false;
        } catch (error) {
            alert(`Portfolio update failed: ${error.message}`);
            return false;
        }
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
        onCommitted();
        await enqueueSave(getBoardRecord(boardId));
        return true;
    }

    function runPortfolioTaskMutation(boardId, taskId, mutator) {
        if (!findPortfolioTaskSource(boardId, taskId)) return false;
        return runPortfolioBoardMutation(boardId, (data, draft) => {
            const task = data.board.tasks.find((entry) => Number(entry.id) === Number(taskId));
            const before = captureTaskTimelineSnapshot(data, taskId);
            if (mutator(task, draft) === false) return false;
            touchTask(task);
            recordTaskTimelineEvent(data, before, captureTaskTimelineSnapshot(data, taskId));
            return true;
        });
    }
    return {
        getState, commitState, getBoardRecord, findPortfolioTaskSource,
        isPortfolioBoardMutable, canUsePortfolioTaskMutations, notifyPortfolioMutationUnavailable,
        runPortfolioBoardMutation, runPortfolioTaskMutation,
        alert, confirm, closeDialogFn, openDialogFn
    };
}
