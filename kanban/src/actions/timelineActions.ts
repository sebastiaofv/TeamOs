// Historical preview selection and restoration.

import type { BoardMutationContext } from './boardMutationContext';
import type { TaskActions } from './taskActions';
import { TIMELINE_EXTENSION_KEY } from '../domain/constants';

import { cloneSerializable, createBoardStateSnapshot, getBoardExtensionsObject } from '../domain/serialize';
import { getBoardTimelineData, recordBoardRestoreTimelineEvent } from '../domain/timeline';

import { getSelectedPortfolioTimelineView } from '../selectors/portfolioViews';

export function createTimelineActions(
    { getState, commitState, getBoardRecord, notifyPortfolioMutationUnavailable, runPortfolioBoardMutation }: BoardMutationContext,
    { closeTaskDetail, closeTaskEditor }: Pick<TaskActions, 'closeTaskDetail' | 'closeTaskEditor'>
) {
    function clearPortfolioTimelineSelection(options: { keepModals?: boolean } = {}) {
        commitState({ portfolioTimelineSelection: { boardId: '', eventIndex: null } });
        if (options.keepModals !== true) {
            closeTaskDetail();
            closeTaskEditor();
        }
    }

    function setPortfolioTimelineSelection(boardId: string, eventIndex: unknown) {
        const boardRecord = getBoardRecord(boardId);
        const timeline = getBoardTimelineData(boardRecord?.data);
        if (!boardRecord || !timeline || timeline.events.length === 0) {
            clearPortfolioTimelineSelection();
            return;
        }

        const maxIndex = timeline.events.length - 1;
        const nextIndex = Math.max(0, Math.min(maxIndex, Number(eventIndex)));
        commitState({ portfolioTimelineSelection: { boardId, eventIndex: nextIndex } });
        closeTaskDetail();
        closeTaskEditor();
    }

    function movePortfolioTimelineToLatest(boardId = getState().selectedPortfolioBoardId) {
        if (!boardId) {
            clearPortfolioTimelineSelection();
            return;
        }
        const boardRecord = getBoardRecord(boardId);
        const timeline = getBoardTimelineData(boardRecord?.data);
        if (!timeline || timeline.events.length === 0) {
            clearPortfolioTimelineSelection();
            return;
        }

        commitState({ portfolioTimelineSelection: { boardId, eventIndex: timeline.events.length - 1 } });
        closeTaskDetail();
        closeTaskEditor();
    }

    function setPortfolioTimelineExpanded(boardId: string, expanded: boolean) {
        if (!boardId) return;
        commitState({ portfolioTimelineExpandedByBoardId: {
            ...getState().portfolioTimelineExpandedByBoardId, [boardId]: Boolean(expanded)
        } });
    }

    async function restorePortfolioTimelineSelection(): Promise<boolean> {
        const view = getSelectedPortfolioTimelineView(getState());
        if (!view?.boardRecord || !view.projectedBoard) return false;
        if (!view.boardRecord.handle) {
            notifyPortfolioMutationUnavailable(view.boardRecord.id);
            return false;
        }
        const currentTimeline = getBoardTimelineData(view.boardRecord.data);
        if (!currentTimeline) return false;
        closeTaskDetail();
        closeTaskEditor();
        return runPortfolioBoardMutation(view.boardRecord.id, (_, draft) => {
            draft.data = createBoardStateSnapshot(view.projectedBoard);
            getBoardExtensionsObject(draft.data, { create: true })[TIMELINE_EXTENSION_KEY] = cloneSerializable(currentTimeline);
            recordBoardRestoreTimelineEvent(draft.data, view.selectedEvent);
            return true;
        }, { allowHistorical: true });
    }
    return {
        clearPortfolioTimelineSelection,
        setPortfolioTimelineSelection,
        movePortfolioTimelineToLatest,
        setPortfolioTimelineExpanded,
        restorePortfolioTimelineSelection,
    };
}
