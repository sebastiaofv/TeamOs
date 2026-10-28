import { translateCurrent } from '@/shared/i18n';
import { taskInTechnicalBoard, workitemType } from '@/domain/workitems';
import type { BoardColumn } from '@/domain/types';
import type { PortfolioRow } from '@/features/portfolio/types';
import { getWorkflow, statusCategory } from '@/domain/workflow';
import { hiddenBoardStates } from '@/domain/boardView';
import { getSelectedPortfolioTimelineView } from './portfolioTimelineViews';
import type { SelectorState } from './portfolioRowViews';

/** One column per stable state, preserving project order and per-project visibility in the aggregate. */
export function buildPortfolioBoardView(state: SelectorState, mode?: 'technical' | 'functional') {
    const preview = getSelectedPortfolioTimelineView(state);
    const boards = (state?.portfolioBoards || []).filter((board) => !state?.selectedPortfolioBoardId || board.id === state.selectedPortfolioBoardId);
    const visibility = new Map<string, ReadonlySet<string>>();
    const columns = new Map<string, BoardColumn>();
    boards.forEach((board) => {
        const data = preview?.isPreview && preview.boardRecord.id === board.id ? preview.projectedBoard || board.data : board.data;
        const hidden = hiddenBoardStates(data);
        visibility.set(board.id, hidden);
        getWorkflow(data).states.forEach((item) => {
            if (hidden.has(item.id)) return;
            const categoryKey = ({ 'in-progress': 'doing', completed: 'done' } as Record<string, string>)[item.category] || item.category;
            const id = mode && !state?.selectedPortfolioBoardId ? categoryKey : item.id;
            if (!columns.has(id)) columns.set(id, { status: id, title: mode && !state?.selectedPortfolioBoardId ? translateCurrent(`workflow.${item.category}`) : item.name });
        });
    });
    const buckets: Record<string, PortfolioRow[]> = {};
    (state?.portfolioVisibleRows || []).forEach((row) => {
        const data = row.boardData || boards.find((board) => board.id === row.boardId)?.data;
        if (mode && (!data || (mode === 'functional' ? !['story', 'epic'].includes(workitemType(row.task)) : !taskInTechnicalBoard(data, row.task)))) return;
        if (!visibility.has(row.boardId) || visibility.get(row.boardId)?.has(row.task.status)) return;
        const category = statusCategory(row.task.status, data);
        const key = mode && !state?.selectedPortfolioBoardId ? ({ 'in-progress': 'doing', completed: 'done' } as Record<string, string>)[category] || category : row.task.status;
        (buckets[key] ||= []).push(row);
    });
    return { columns: [...columns.values()], buckets };
}
