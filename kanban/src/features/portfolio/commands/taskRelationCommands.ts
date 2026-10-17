import type { TaskRelationKind } from '@/domain/types';
import { cloneSerializable } from '@/domain/serializable';
import { getRelations, removeTaskRelation, setTaskRelation, TaskRelationError } from '@/domain/taskRelations';
import { recordTaskRelationsTimelineEvent } from '@/domain/timeline';
import { translateCurrent } from '@/shared/i18n';
import type { BoardMutationContext } from '@/features/portfolio/commands/mutationContext';

export function createTaskRelationActions({ runPortfolioBoardMutation, confirm }: BoardMutationContext) {
    async function associatePortfolioTasks(boardId: string, taskId: number, otherId: number, kind: TaskRelationKind, replace = false) {
        return runPortfolioBoardMutation(boardId, (data) => {
            const before = cloneSerializable(getRelations(data));
            try {
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
        if (!(await confirm(translateCurrent('relations.removeQuestion', { a: taskId, b: otherId }), { confirmLabel: translateCurrent('common.remove') }))) return false;
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
