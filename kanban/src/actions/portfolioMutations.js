// Assemble the feature actions around one immutable board-write path.
import { createBoardMutationContext } from './boardMutationContext.js';
import { createBoardInteractions } from './boardInteractions.js';
import { createTaskActions } from './taskActions.js';
import { createRoadmapActions } from './roadmapActions.js';
import { createTimelineActions } from './timelineActions.js';

export function createPortfolioMutationActions(options = {}) {
    const context = createBoardMutationContext({
        ...options,
        onBoardChanged: (boardId) => tasks.refreshTaskDetail(boardId)
    });
    const interactions = createBoardInteractions(context, (...args) => tasks.movePortfolioTaskToStatus(...args));
    const tasks = createTaskActions(context, interactions);
    const roadmap = createRoadmapActions(context, interactions);
    const timeline = createTimelineActions(context, tasks);
    return { ...tasks, ...roadmap, ...timeline, ...interactions };
}

export const {
    setSelectedPortfolioCard,
    setHoveredPortfolioCard,
    togglePortfolioTaskBulkSelection,
    endPortfolioCardDrag,
    dropPortfolioTaskOnColumn,
    openPortfolioTaskDetails,
    editPortfolioTask,
    openPortfolioCreateTaskModal,
    closeTaskEditor,
    closeTaskDetail,
    openPortfolioTaskDetailsForCalendar,
    togglePortfolioArchiveTask,
    deletePortfolioTask,
    saveTask,
    toggleTaskDetailChecklistItem,
    movePortfolioTaskToStatus,
    performUndo,
    openRoadmapEntityModal,
    closeRoadmapEntity,
    togglePortfolioRoadmapRowExpanded,
    saveRoadmapEntity,
    deleteRoadmapEntity,
    clearPortfolioTimelineSelection,
    setPortfolioTimelineSelection,
    movePortfolioTimelineToLatest,
    setPortfolioTimelineExpanded,
    restorePortfolioTimelineSelection,
} = createPortfolioMutationActions();
