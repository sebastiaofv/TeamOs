import { useEffect } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { getProjectInfo } from '@/domain/project';
import { taskWorkContext } from '@/domain/workitems';

export function useWorkitemDeepLink() {
    const boards = useAppStore((s) => s.portfolioBoards);
    const pending = useAppStore((s) => s.pendingTaskLink);
    const actions = usePortfolioActions();
    useEffect(() => {
        if (!pending) return;
        const board = boards.find((board) => getProjectInfo(board.data).id === pending.projectId);
        if (!board) return;
        useAppStore.setState({ pendingTaskLink: null });
        actions.setSelectedPortfolioBoardId(board.id);
        const task = board.data.board.tasks.find((task) => task.id === pending.taskId);
        if (task) useAppStore.setState({ selectedWorkContext: taskWorkContext(task) });
        actions.openPortfolioTaskDetails(board.id, pending.taskId);
    }, [boards, pending, actions]);
}
