import type { BoardData, Task } from './types';
import { getProjectInfo } from './project';

export function migrateAssignments(data: BoardData): void {
    const team = getProjectInfo(data).team;
    for (const task of data.board.tasks) {
        if (task.assigneeId || task.assignees.length !== 1) continue;
        const matches = team.filter((member) => member.name.toLowerCase() === task.assignees[0].toLowerCase());
        if (matches.length === 1) task.assigneeId = matches[0].id;
    }
}

export function reconcileAssignments(data: BoardData, previous: BoardData): void {
    const team = getProjectInfo(data).team;
    const beforeById = new Map(previous.board.tasks.map((task) => [task.id, task]));
    for (const task of data.board.tasks) {
        const before = beforeById.get(task.id);
        const changed = !before || task.assigneeId !== before.assigneeId || JSON.stringify(task.assignees) !== JSON.stringify(before.assignees);
        if (!changed) {
            const member = team.find((member) => member.id === task.assigneeId);
            if (member) task.assignees = [member.name];
            continue;
        }
        if (task.assignees.length > 1) throw new Error('Choose exactly one responsible team member.');
        if (before && before.assignees.length > 1) task.legacyAssignees = [...before.assignees];
        if (!task.assignees.length && !task.assigneeId) { task.assigneeId = ''; continue; }
        const matches = task.assigneeId ? team.filter((m) => m.id === task.assigneeId) : team.filter((m) => m.name.toLowerCase() === task.assignees[0]?.toLowerCase());
        if (matches.length !== 1 || !matches[0].active) throw new Error('Choose an active member of this project team.');
        task.assigneeId = matches[0].id;
        task.assignees = [matches[0].name];
    }
}

export function assignmentNeedsReview(data: BoardData, task: Task): boolean {
    const team = getProjectInfo(data).team;
    return task.assignees.length > 1 || Boolean(task.assignees.length && !task.assigneeId) || Boolean(task.assigneeId && !team.some((member) => member.id === task.assigneeId && member.active));
}
