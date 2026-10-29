import { consultSprintParticipation } from '@/domain/workitems';
import type {
    PortfolioRoadmapViewModel, RoadmapMilestoneMarker, RoadmapPlanningRow, RoadmapWorkScope
} from '@/features/portfolio/types';
import type { BoardData, RoadmapExtension, RoadmapItem, Task } from '@/domain/types';
import { getSelectedPortfolioTimelineView } from './portfolioTimelineViews';
import { buildPortfolioRowsFromBoardData, getBoardRecord, type SelectorState } from './portfolioRowViews';
import {
    createEmptyRoadmapExtension,
    getRoadmapAxisTicks,
    getRoadmapExtension,
    getVisibleRoadmapDateRange,
    compareRoadmapItemsByDate,
    getRoadmapTaskFieldTasks,
    getRoadmapTimelinePlacement
} from '@/domain/roadmap';
import { phaseTreeRows, planningProgress } from '@/domain/phaseTree';
import { DEFAULT_PORTFOLIO_FILTERS, taskMatchesPortfolioFilters } from '@/domain/portfolioFilters';
import { milestoneColor } from '@/domain/milestonePresentation';

export function buildPortfolioRoadmapView(state: SelectorState): PortfolioRoadmapViewModel | null {
    const timelineView = getSelectedPortfolioTimelineView(state);
    const board = timelineView?.boardRecord || getBoardRecord(state, state?.selectedPortfolioBoardId);
    if (!board) return null;

    const boardData = timelineView?.isPreview
        ? (timelineView.projectedBoard || board.data || null)
        : (board.data || timelineView?.projectedBoard || null);
    const roadmap = getRoadmapExtensionOrEmpty(boardData);
    const range = getVisibleRoadmapDateRange(roadmap);
    const expanded = state?.portfolioRoadmapExpandedRowsByBoardId?.[board.id] || {};
    const filters = { ...DEFAULT_PORTFOLIO_FILTERS, ...state?.portfolioFilters };
    const historical = Boolean(timelineView?.isPreview);
    const sourceRows = buildPortfolioRowsFromBoardData(state, board, boardData, { canMutate: false, historical });
    const byId = new Map(sourceRows.map((row) => [row.taskId, row]));
    const scope = (key: string, item: RoadmapItem | null, input: Task[]): RoadmapWorkScope => {
        const tasks = [...new Map(input.map((task) => [task.id, task])).values()];
        const participation = /^sprints?:/.test(key) && item ? consultSprintParticipation(boardData, item.id) : null;
        const context = participation?.boardData || boardData;
        const ids = new Set(tasks.map((task) => task.id));
        const scopedTasks = participation ? participation.members.filter((task) => ids.has(task.id)) : tasks;
        const rows = participation ? scopedTasks.map((task) => ({
            boardIndex: (state?.portfolioBoards || []).findIndex((entry) => entry.id === board.id),
            boardId: board.id, boardTitle: board.title, boardFileName: board.fileName,
            taskIndex: -1, ...byId.get(task.id), taskId: task.id,
            task: participation.isCurrent(task.id) ? byId.get(task.id)?.task || task : task, boardData: context,
            canMutate: false, historical: historical || !participation.isCurrent(task.id)
        })) : tasks.flatMap((task) => byId.get(task.id) ? [byId.get(task.id)!] : []);
        return { key, item, boardData: context, participation: participation || undefined, tasks: scopedTasks, rows,
            visibleCount: scopedTasks.filter((task) => taskMatchesPortfolioFilters(task, filters, context)).length,
            progress: participation ? planningProgress(participation.planningMembers.filter((task) => ids.has(task.id)), context, { leavesOnly: false }) : planningProgress(tasks, context) };
    };
    function grouped(tasks: Task[], kind: 'sprints' | 'milestones'): RoadmapWorkScope[] {
        const field = kind === 'sprints' ? 'sprintId' : 'milestoneId';
        const groups = new Map<string, Task[]>();
        tasks.forEach((task) => { const id = task[field] || ''; const group = groups.get(id); if (group) group.push(task); else groups.set(id, [task]); });
        return [...groups].map(([id, members]) => ({ ...scope(`${kind}:${id || 'none'}`, roadmap[kind].find((item) => item.id === id) || null, members), referenceId: id }))
            .sort((a, b) => a.item && b.item ? compareRoadmapItemsByDate(a.item, b.item) : a.item ? -1 : b.item ? 1 : 0);
    }
    const tree = phaseTreeRows(roadmap.phases, new Set(roadmap.phases.filter((phase) => expanded[`tree:${phase.id}`]).map((phase) => phase.id)));
    const phaseRows: RoadmapPlanningRow[] = tree.map(({ item, depth, hasChildren }) => {
        const tasks = getRoadmapTaskFieldTasks(boardData, 'phaseId', item.id);
        return { ...scope(`phase:${item.id}`, item, tasks), kind: 'phases', depth, hasChildren, treeCollapsed: Boolean(expanded[`tree:${item.id}`]), expanded: Boolean(expanded[`phase:${item.id}`]),
            sprintGroups: [...grouped(tasks, 'sprints'), ...roadmap.sprints.filter((sprint) => sprint.parentId === item.id && !tasks.some((task) => task.sprintId === sprint.id)).map((sprint) => scope(`sprint:${sprint.id}`, sprint, getRoadmapTaskFieldTasks(boardData, 'sprintId', sprint.id)))], milestoneGroups: grouped(tasks, 'milestones') };
    });
    const sprintRows: RoadmapPlanningRow[] = roadmap.sprints.filter((sprint) => !sprint.parentId || !roadmap.phases.some((phase) => phase.id === sprint.parentId)).sort(compareRoadmapItemsByDate).map((item) => ({ ...scope(`sprint:${item.id}`, item, getRoadmapTaskFieldTasks(boardData, 'sprintId', item.id)),
        kind: 'sprints', depth: 0, hasChildren: false, treeCollapsed: false, expanded: Boolean(expanded[`sprint:${item.id}`]), sprintGroups: [], milestoneGroups: [] }));
    const milestones: RoadmapMilestoneMarker[] = roadmap.milestones.map((item, index) => ({ ...item, color: milestoneColor(item, index) })).sort(compareRoadmapItemsByDate).map((item) => {
        return { ...scope(`milestone:${item.id}`, item, getRoadmapTaskFieldTasks(boardData, 'milestoneId', item.id)), position: getRoadmapTimelinePlacement(item, range)?.point || 0 };
    });
    const deepest = Math.max(0, ...phaseTreeRows(roadmap.phases).map((row) => row.depth));
    const longest = Math.max(0, ...[...roadmap.phases, ...roadmap.sprints].map((item) => item.title.length));

    return {
        boardId: board.id,
        boardTitle: board.title || board.fileName || 'Selected Project',
        boardFileName: board.fileName || '',
        boardData,
        roadmap,
        range,
        axisTicks: getRoadmapAxisTicks(range, state?.activeLanguage || 'en'),
        historical, phaseRows, sprintRows, milestones,
        labelWidth: Math.ceil(Math.min(640, 360 + Math.min(deepest, 12) * 14 + Math.min(longest * 2, 100)) / 10) * 10
    };
}

export function getRoadmapExtensionOrEmpty(boardData: BoardData | null | undefined): RoadmapExtension {
    return getRoadmapExtension(boardData) || createEmptyRoadmapExtension();
}
