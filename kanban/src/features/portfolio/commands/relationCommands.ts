import { addRelation, getRelations, taskRef, type WorkitemRelation } from '@/domain/relations';
import { appendTimelineEvent } from '@/domain/timeline';
import type { BoardMutationContext } from './mutationContext';

export function createRelationActions(context: BoardMutationContext) {
    function linkWorkitems(boardId: string, taskId: number, targetBoardId: string, targetTaskId: number, kind: WorkitemRelation['kind'], reverse = false) {
        const target = context.getBoardRecord(targetBoardId);
        if (!target) return false;
        return context.runPortfolioBoardMutation(boardId, (data) => {
            const sourceRef = taskRef(data, taskId), targetRef = taskRef(target.data, targetTaskId);
            const link = addRelation(data, context.getState().portfolioBoards.map((board) => board.id === boardId ? data : board.data), {
                kind, from: reverse ? targetRef : sourceRef, to: reverse ? sourceRef : targetRef
            });
            appendTimelineEvent(data, { kind: 'workitem.relation.added', entityType: 'task', entityId: String(taskId), summary: 'Workitem relation added', meta: { relation: link } });
            return true;
        });
    }
    function unlinkWorkitems(ownerBoardId: string, relationId: string) {
        return context.runPortfolioBoardMutation(ownerBoardId, (data) => {
            const links = getRelations(data), link = links.find((link) => link.id === relationId);
            if (!link) return false;
            data.extensions.relations = { version: 1, links: links.filter((link) => link.id !== relationId) };
            appendTimelineEvent(data, { kind: 'workitem.relation.removed', entityType: 'task', entityId: String(link.from.taskId), summary: 'Workitem relation removed', meta: { relation: link } });
            return true;
        });
    }
    function setWorkitemParent(boardId: string, taskId: number, parentId: number | null) {
        return context.runPortfolioTaskMutation(boardId, taskId, (task) => { task.parentId = parentId; return true; });
    }
    return { linkWorkitems, unlinkWorkitems, setWorkitemParent };
}
