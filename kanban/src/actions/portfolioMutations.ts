// Assemble the feature actions around one immutable board-write path.
import { createBoardMutationContext, type BoardMutationOptions } from './boardMutationContext';
import { createBoardInteractions } from './boardInteractions';
import { createTaskActions, type TaskActions } from './taskActions';
import { createRoadmapActions } from './roadmapActions';
import { createTimelineActions } from './timelineActions';

export function createPortfolioMutationActions(options: BoardMutationOptions = {}) {
    const context = createBoardMutationContext({
        ...options,
        onBoardChanged: (boardId) => tasks.refreshTaskDetail(boardId)
    });
    const interactions = createBoardInteractions(context, (boardId, taskId, targetStatus) => tasks.movePortfolioTaskToStatus(boardId, taskId, targetStatus));
    // Annotated: the callbacks above refer to `tasks` before it is created.
    const tasks: TaskActions = createTaskActions(context, interactions);
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
