import type { BoardColumn } from '@/domain/types';
import type { PortfolioRow } from '@/features/portfolio/types';
import { getWorkflow } from '@/domain/workflow';
import { hiddenBoardStates } from '@/domain/boardView';
import { getSelectedPortfolioTimelineView } from './portfolioTimelineViews';
import type { SelectorState } from './portfolioRowViews';

/** One column per stable state, preserving project order and per-project visibility in the aggregate. */
export function buildPortfolioBoardView(state: SelectorState) {
    const preview = getSelectedPortfolioTimelineView(state);
    const boards = (state?.portfolioBoards || []).filter((board) => !state?.selectedPortfolioBoardId || board.id === state.selectedPortfolioBoardId);
    const visibility = new Map<string, ReadonlySet<string>>();
    const columns = new Map<string, BoardColumn>();
    boards.forEach((board) => {
        const data = preview?.isPreview && preview.boardRecord.id === board.id ? preview.projectedBoard || board.data : board.data;
        const hidden = hiddenBoardStates(data);
        visibility.set(board.id, hidden);
        getWorkflow(data).states.forEach((item) => { if (!hidden.has(item.id) && !columns.has(item.id)) columns.set(item.id, { status: item.id, title: item.name }); });
    });
    const buckets: Record<string, PortfolioRow[]> = {};
    (state?.portfolioVisibleRows || []).forEach((row) => {
        if (!visibility.has(row.boardId) || visibility.get(row.boardId)?.has(row.task.status)) return;
        (buckets[row.task.status] ||= []).push(row);
    });
    return { columns: [...columns.values()], buckets };
}
