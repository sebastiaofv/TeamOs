import { allPermanentRelations, assertPermanentGraph, referenceFor, relationPairKey } from '@/domain/permanentRelations';
import { workitemLabelFor } from '@/domain/taskIdentity';
import type { TaskRelationKind } from '@/domain/types';
import { cloneSerializable } from '@/domain/serializable';
import { getRelations, removeTaskRelation, setTaskRelation, TaskRelationError } from '@/domain/taskRelations';
import { recordTaskRelationsTimelineEvent } from '@/domain/timeline';
import { translateCurrent } from '@/shared/i18n';
import type { BoardMutationContext } from '@/features/portfolio/commands/mutationContext';

export function createTaskRelationActions({ runPortfolioBoardMutation, confirm, getBoardRecord, getState }: BoardMutationContext) {
    async function associatePortfolioTasks(boardId: string, taskId: number, otherId: number, kind: TaskRelationKind, replace = false) {
        if (replace && !(await confirm(translateCurrent('relations.replaceQuestion', { a: workitemLabelFor(getBoardRecord(boardId)?.data, taskId), b: workitemLabelFor(getBoardRecord(boardId)?.data, otherId) }) + '\n\n' +
            translateCurrent(`relations.sentence.${kind}`, { a: workitemLabelFor(getBoardRecord(boardId)?.data, taskId), b: workitemLabelFor(getBoardRecord(boardId)?.data, otherId) }), { confirmLabel: translateCurrent('common.save') }))) return false;
        return runPortfolioBoardMutation(boardId, (data) => {
            const before = cloneSerializable(getRelations(data));
            try {
                const board = getBoardRecord(boardId)!;
                const a = data.board.tasks.find((task) => task.id === taskId), b = data.board.tasks.find((task) => task.id === otherId);
                if (a?.permanentId && b?.permanentId) {
                    const source = referenceFor({ ...board, data }, a), target = referenceFor({ ...board, data }, b);
                    const key = relationPairKey({ source, target, kind: 'related' });
                    const graph = allPermanentRelations(getState().portfolioBoards, getState().unloadedRelationSources.flatMap((entry) => entry.relations));
                    if (graph.some((edge) => relationPairKey(edge) === key) && !before.some((edge) => (edge.sourceId === taskId && edge.targetId === otherId) || (edge.sourceId === otherId && edge.targetId === taskId))) throw new TaskRelationError('duplicate');
                    assertPermanentGraph([...graph.filter((edge) => relationPairKey(edge) !== key), { source: kind === 'blockedBy' ? target : source, target: kind === 'blockedBy' ? source : target, kind: kind === 'related' ? 'related' : 'blocks' }]);
                }
                setTaskRelation(data, taskId, otherId, kind, replace);
            } catch (error) {
                if (error instanceof TaskRelationError) throw new Error(translateCurrent(`relations.error.${error.code}`));
                throw error;
            }
            recordTaskRelationsTimelineEvent(data, taskId, before);
            return true;
        });
    }

    async function removePortfolioTaskRelation(boardId: string, taskId: number, otherId: number) {
        if (!(await confirm(translateCurrent('relations.removeQuestion', { a: workitemLabelFor(getBoardRecord(boardId)?.data, taskId), b: workitemLabelFor(getBoardRecord(boardId)?.data, otherId) }), { confirmLabel: translateCurrent('common.remove') }))) return false;
        return runPortfolioBoardMutation(boardId, (data) => {
            const before = cloneSerializable(getRelations(data));
            removeTaskRelation(data, taskId, otherId);
            if (getRelations(data).length === before.length) return false;
            recordTaskRelationsTimelineEvent(data, taskId, before);
            return true;
        });
    }

    return { associatePortfolioTasks, removePortfolioTaskRelation };
}
