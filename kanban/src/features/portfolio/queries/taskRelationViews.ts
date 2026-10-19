import type { BoardData, Task } from '@/domain/types';
import { getTaskRelations } from '@/domain/taskRelations';
import type { TaskDetailViewModel } from '@/features/portfolio/types';

export function buildTaskRelationView(data: BoardData, taskId: number): Pick<TaskDetailViewModel, 'relations' | 'relationCandidates'> {
    const statusMap = new Map(data.board.columns.map((column) => [column.status, column.title]));
    const entry = (task: Task) => ({ id: task.id, title: task.title, status: statusMap.get(task.status) || task.status, responsible: task.responsible?.trim().split(/\s+/)[0] || '', archived: task.archived });
    const groups = getTaskRelations(data, taskId);
    return {
        relations: { blockedBy: groups.blockedBy.map(entry), blocks: groups.blocks.map(entry), related: groups.related.map(entry) },
        relationCandidates: data.board.tasks.filter((task) => task.id !== taskId).map(entry)
    };
}
