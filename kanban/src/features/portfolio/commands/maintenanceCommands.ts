import { enableMaintenance } from '@/domain/applications';
import { moveWorkitemContext, workitemSubtree, type WorkContext } from '@/domain/maintenance';
import { appendTimelineEvent } from '@/domain/timeline';
import { updatePortfolioUrlState } from './portfolioNavigation';
import { translateCurrent } from '@/shared/i18n';
import type { BoardMutationContext } from './mutationContext';

export function createMaintenanceActions(context: BoardMutationContext) {
    function enableApplicationMaintenance(boardId: string) {
        return context.runPortfolioBoardMutation(boardId, (data) => { enableMaintenance(data); return true; });
    }
    async function moveWorkitemToContext(boardId: string, taskId: number, target: WorkContext, mapping: Record<string, string>) {
        const board = context.getBoardRecord(boardId);
        if (!board) return false;
        const count = workitemSubtree(board.data, taskId).length;
        if (!(await context.confirm(translateCurrent('maintenance.moveConfirm', { count })))) return false;
        return context.runPortfolioBoardMutation(boardId, (data) => {
            if (target === 'maintenance' && !data.extensions.maintenance) enableMaintenance(data);
            const taskIds = moveWorkitemContext(data, taskId, target, mapping);
            appendTimelineEvent(data, { kind: 'workitem.context.changed', entityType: 'task', entityId: String(taskId), summary: `Workitems moved to ${target}`, meta: { taskIds, target } });
            return true;
        });
    }
    function openWorkContext(boardId: string, target: WorkContext, view: 'board' | 'table' = 'board') {
        if (!context.getBoardRecord(boardId)) return;
        context.closeDialogFn('taskDetail');
        // Selected tasks belong to the context being left and would no longer be visible.
        const portfolioBulkSelectionByBoardId = { ...(context.getState().portfolioBulkSelectionByBoardId || {}) };
        delete portfolioBulkSelectionByBoardId[boardId];
        context.commitState({ portfolioDetailContext: null, selectedPortfolioBoardId: boardId, selectedWorkContext: target, selectedPortfolioViewMode: view, portfolioBulkSelectionByBoardId });
        const state = context.getState();
        const filters = state.portfolioTableFiltersByBoardId[boardId];
        if (filters) context.commitState({ portfolioTableFiltersByBoardId: { ...state.portfolioTableFiltersByBoardId, [boardId]: { ...filters, statuses: [], phaseId: '', milestoneId: '', sprintId: '' } } });
        updatePortfolioUrlState(undefined, context.getState());
    }
    return { enableApplicationMaintenance, moveWorkitemToContext, openWorkContext };
}
