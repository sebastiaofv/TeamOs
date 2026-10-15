// Assemble the feature actions around one immutable board-write path.
import { createBoardMutationContext, type BoardMutationOptions } from './mutationContext';
import { createBoardInteractions } from './boardCommands';
import { createTaskActions, type TaskActions } from './taskCommands';
import { createRoadmapActions } from './roadmapCommands';
import { createTimelineActions } from './timelineCommands';
import { createPlannerActions } from './plannerCommands';
import { createProjectSettingsActions } from './projectSettingsCommands';
import { createRelationActions } from './relationCommands';
import { createConversationActions } from './conversationCommands';

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
    return { ...tasks, ...roadmap, ...timeline, ...planner, ...interactions, ...createProjectSettingsActions(context), ...createRelationActions(context), ...createConversationActions(context) };
}

export type PortfolioMutationActions = ReturnType<typeof createPortfolioMutationActions>;

const activeActions: PortfolioMutationActions = createPortfolioMutationActions();

export function getPortfolioMutationActions(): PortfolioMutationActions {
    return activeActions;
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
} = activeActions;
