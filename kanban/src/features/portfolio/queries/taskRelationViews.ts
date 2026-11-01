import { getWorkflow } from '@/domain/workflow';
import type { BoardData, Task } from '@/domain/types';
import { getTaskRelations } from '@/domain/taskRelations';
import { permanentTaskRelations, type RelationProject, type PermanentRelation } from '@/domain/permanentRelations';
import type { TaskDetailViewModel, TaskRelationEntry } from '@/features/portfolio/types';

export function buildTaskRelationView(data: BoardData, taskId: number, projects: readonly RelationProject[] = [], unavailable: readonly PermanentRelation[] = []): Pick<TaskDetailViewModel, 'relations' | 'relationCandidates'> {
    const entry = (task: Task, board = data): TaskRelationEntry => ({ displayId: task.displayId, permanentId: task.permanentId, id: task.id, title: task.title, status: getWorkflow(board, task).states.find((state) => state.id === task.status)?.name || task.status, statusKey: task.status, responsible: task.responsible?.trim().split(/\s+/)[0] || '', archived: task.archived });
    const groups = getTaskRelations(data, taskId);
    const relations = { blockedBy: groups.blockedBy.map((task) => entry(task)), blocks: groups.blocks.map((task) => entry(task)), related: groups.related.map((task) => entry(task)) };
    const task = data.board.tasks.find((item) => item.id === taskId);
    if (projects.length && task?.permanentId) for (const link of permanentTaskRelations(projects, task.permanentId, unavailable)) {
        if (relations[link.kind].some((item) => item.permanentId === link.reference.permanentId)) continue;
        const location = link.location;
        relations[link.kind].push(location ? { ...entry(location.task, location.project.data), boardId: location.project.id, external: true }
            : { id: link.reference.taskId, permanentId: link.reference.permanentId, displayId: link.reference.displayId, title: `${link.reference.title} · ${link.reference.projectTitle}${link.reference.fileName ? ` (${link.reference.fileName})` : ''}`, status: '', statusKey: '', responsible: '', archived: false, unavailable: true, external: true });
    }
    return { relations, relationCandidates: data.board.tasks.filter((task) => task.id !== taskId).map((task) => entry(task)) };
}
