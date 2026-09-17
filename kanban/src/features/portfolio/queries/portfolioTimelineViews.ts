import type {
    BoardRecord,
    PortfolioTimelineViewModel
} from '@/features/portfolio/types';
import type { BoardData, TimelineEvent, TimelineExtension } from '@/domain/types';
import type { AppState } from '@/features/portfolio/state/slices';
import { getBoardRecord, type SelectorState } from './portfolioRowViews';
import {
    getBoardTimelineData,
    reconstructBoardStateFromTimeline
} from '@/domain/timeline';

export type PortfolioTimelineSelectionView = {
    boardRecord: BoardRecord;
    timeline: TimelineExtension | null;
    selectedIndex: number | null;
    selectedEvent: TimelineEvent | null;
    isPreview: boolean;
    projectedBoard: BoardData | null;
};

function getTimelineSelectionIndex(state: SelectorState, boardId: string, timeline: TimelineExtension | null): number | null {
    if (!boardId || !timeline?.events?.length) return null;
    const maxIndex = timeline.events.length - 1;
    const selection: Partial<AppState['portfolioTimelineSelection']> = state?.portfolioTimelineSelection || {};
    if (selection.boardId !== boardId || !Number.isInteger(selection.eventIndex)) {
        return maxIndex;
    }
    return Math.max(0, Math.min(maxIndex, selection.eventIndex as number));
}

// True while the board's timeline is scrubbed back to an earlier event, which
// makes the board read-only.
export function isBoardInHistoricalPreview(state: SelectorState, boardId: string | null | undefined): boolean {
    if (!boardId) return false;
    const timeline = getBoardTimelineData(getBoardRecord(state, boardId)?.data);
    if (!timeline || timeline.events.length === 0) return false;
    return (getTimelineSelectionIndex(state, boardId, timeline) as number) < timeline.events.length - 1;
}

// Bulk-selected task ids for a board, ignoring ids whose task no longer exists.
export function getPortfolioBulkTaskIds(state: SelectorState, boardId: string): number[] {
    const board = getBoardRecord(state, boardId);
    if (!board) return [];
    const taskIds = new Set((board.data?.board?.tasks || []).map((task) => Number(task.id)));
    return (state?.portfolioBulkSelectionByBoardId?.[boardId] || [])
        .filter((taskId) => taskIds.has(Number(taskId)));
}

export function getSelectedPortfolioTimelineView(state: SelectorState): PortfolioTimelineSelectionView | null {
    const boardId = state?.selectedPortfolioBoardId || '';
    if (!boardId) return null;

    const boardRecord = getBoardRecord(state, boardId);
    if (!boardRecord) return null;

    const timeline = getBoardTimelineData(boardRecord.data);
    if (!timeline || timeline.events.length === 0) {
        return {
            boardRecord,
            timeline: null,
            selectedIndex: null,
            selectedEvent: null,
            isPreview: false,
            projectedBoard: null
        };
    }

    const selectedIndex = getTimelineSelectionIndex(state, boardId, timeline) as number;
    return {
        boardRecord,
        timeline,
        selectedIndex,
        selectedEvent: timeline.events[selectedIndex] || null,
        isPreview: selectedIndex < timeline.events.length - 1,
        projectedBoard: reconstructBoardStateFromTimeline(boardRecord.data, selectedIndex)
    };
}

export function buildPortfolioTimelineViewModel(state: SelectorState): PortfolioTimelineViewModel | null {
    const timelineView = getSelectedPortfolioTimelineView(state);
    if (!timelineView?.boardRecord) return null;
    return {
        boardId: timelineView.boardRecord.id,
        boardTitle: timelineView.boardRecord.title || timelineView.boardRecord.fileName || 'Selected Project',
        boardFileName: timelineView.boardRecord.fileName || '',
        hasHandle: Boolean(timelineView.boardRecord.handle),
        timeline: timelineView.timeline,
        selectedIndex: timelineView.selectedIndex,
        selectedEvent: timelineView.selectedEvent,
        isPreview: timelineView.isPreview,
        isExpanded: state?.portfolioTimelineExpandedByBoardId?.[timelineView.boardRecord.id] === true
    };
}
