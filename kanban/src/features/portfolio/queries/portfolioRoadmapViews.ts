import type {
    PortfolioRoadmapViewModel
} from '@/features/portfolio/types';
import type { BoardData, RoadmapExtension } from '@/domain/types';
import { getSelectedPortfolioTimelineView } from './portfolioTimelineViews';
import { getBoardRecord, type SelectorState } from './portfolioRowViews';
import {
    createEmptyRoadmapExtension,
    getRoadmapAxisTicks,
    getRoadmapExtension,
    getVisibleRoadmapDateRange
} from '@/domain/roadmap';

export function buildPortfolioRoadmapView(state: SelectorState): PortfolioRoadmapViewModel | null {
    const timelineView = getSelectedPortfolioTimelineView(state);
    const board = timelineView?.boardRecord || getBoardRecord(state, state?.selectedPortfolioBoardId);
    if (!board) return null;

    const boardData = timelineView?.isPreview
        ? (timelineView.projectedBoard || board.data || null)
        : (board.data || timelineView?.projectedBoard || null);
    const roadmap = getRoadmapExtensionOrEmpty(boardData);
    const range = getVisibleRoadmapDateRange(roadmap);

    return {
        boardId: board.id,
        boardTitle: board.title || board.fileName || 'Selected Project',
        boardFileName: board.fileName || '',
        boardData,
        roadmap,
        range,
        axisTicks: getRoadmapAxisTicks(range, state?.activeLanguage || 'en'),
        historical: Boolean(timelineView?.isPreview)
    };
}

export function getRoadmapExtensionOrEmpty(boardData: BoardData | null | undefined): RoadmapExtension {
    return getRoadmapExtension(boardData) || createEmptyRoadmapExtension();
}
