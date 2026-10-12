// Assemble the feature actions around one immutable board-write path.
import { createBoardMutationContext, type BoardMutationOptions } from './mutationContext';
import { createBoardInteractions } from './boardCommands';
import { createTaskActions, type TaskActions } from './taskCommands';
import { createRoadmapActions } from './roadmapCommands';
import { createTimelineActions } from './timelineCommands';
import { createPlannerActions } from './plannerCommands';
import { createProjectDetailsActions } from './projectDetailsCommands';

export type { BoardMutationOptions } from './mutationContext';

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
    const planner = createPlannerActions(context, tasks);
    const projectDetails = createProjectDetailsActions(context);
    return { ...tasks, ...roadmap, ...timeline, ...planner, ...interactions, ...projectDetails };
}

export type PortfolioMutationActions = ReturnType<typeof createPortfolioMutationActions>;

const activeActions: PortfolioMutationActions = createPortfolioMutationActions();

export function getPortfolioMutationActions(): PortfolioMutationActions {
    return activeActions;
}

export const {
    openProjectDetails,
    closeProjectDetails,
    saveProjectDetails,
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
} = activeActions;
