import type { BoardData } from '@/domain/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { setPortfolioViewMode } from './portfolioControls';

export function selectRoadmapMilestone(boardId: string, milestoneId: string) {
    useAppStore.setState((state) => ({ portfolioRoadmapMilestoneByBoardId: { ...state.portfolioRoadmapMilestoneByBoardId, [boardId]: milestoneId } }));
}

/** Reuse Roadmap consultation, including opening collapsed ancestors and milestone details. */
export function navigateToRoadmapItem(boardId: string, kind: 'phases' | 'milestones' | 'sprints', itemId: string, data: BoardData) {
    if (kind === 'milestones') selectRoadmapMilestone(boardId, itemId);
    else {
        const expanded = { ...useAppStore.getState().portfolioRoadmapExpandedRowsByBoardId[boardId], [`${kind === 'sprints' ? 'sprint' : 'phase'}:${itemId}`]: true };
        let item = data.extensions.roadmap?.[kind].find((phase) => phase.id === itemId);
        const visited = new Set<string>();
        while (item?.parentId && !visited.has(item.parentId)) {
            visited.add(item.parentId);
            expanded[`tree:${item.parentId}`] = false;
            item = data.extensions.roadmap?.phases.find((phase) => phase.id === item!.parentId);
        }
        useAppStore.setState((state) => ({ portfolioRoadmapExpandedRowsByBoardId: { ...state.portfolioRoadmapExpandedRowsByBoardId, [boardId]: expanded } }));
    }
    setPortfolioViewMode('roadmap');
}

export function setAllRoadmapProjectsExpanded(expanded: boolean) {
    useAppStore.setState((state) => {
        const rows = { ...state.portfolioRoadmapExpandedRowsByBoardId };
        for (const board of state.portfolioBoards) {
            if (board.data.extensions.project?.status !== 'active') continue;
            rows[board.id] = { ...rows[board.id], project: expanded };
            for (const phase of board.data.extensions.roadmap?.phases || []) rows[board.id][`tree:${phase.id}`] = !expanded;
        }
        return { portfolioRoadmapExpandedRowsByBoardId: rows };
    });
}
