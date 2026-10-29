import { getWorkflow } from '@/domain/workflow';
import type { BoardData, Task } from '@/domain/types';
import { getTaskRelations } from '@/domain/taskRelations';
import type { TaskDetailViewModel } from '@/features/portfolio/types';

export function buildTaskRelationView(data: BoardData, taskId: number): Pick<TaskDetailViewModel, 'relations' | 'relationCandidates'> {
    const entry = (task: Task) => ({ displayId: task.displayId, id: task.id, title: task.title, status: getWorkflow(data, task).states.find((state) => state.id === task.status)?.name || task.status, statusKey: task.status, responsible: task.responsible?.trim().split(/\s+/)[0] || '', archived: task.archived });
    const groups = getTaskRelations(data, taskId);
    return {
        relations: { blockedBy: groups.blockedBy.map(entry), blocks: groups.blocks.map(entry), related: groups.related.map(entry) },
        relationCandidates: data.board.tasks.filter((task) => task.id !== taskId).map(entry)
    };
}
