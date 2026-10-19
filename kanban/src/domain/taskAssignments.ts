import type { Task } from './types';

export function normalizeAssignee(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

export function normalizeAssignees(value: unknown): string[] {
    const source = Array.isArray(value) ? value : [value];
    const seen = new Set<string>();
    return source.map(normalizeAssignee).filter((name) => {
        if (!name || seen.has(name.toLowerCase())) return false;
        seen.add(name.toLowerCase());
        return true;
    });
}

export type TaskAssignments = Pick<Task, 'assignees' | 'responsible'>;

/** Clearing or replacing responsibility never removes existing participation. */
export function setTaskResponsible<T extends TaskAssignments>(task: T, name: unknown): T {
    const assignees = normalizeAssignees(task.assignees);
    const requested = normalizeAssignee(name);
    const responsible = assignees.find((person) => person.toLowerCase() === requested.toLowerCase()) || requested;
    if (responsible && !assignees.includes(responsible)) assignees.push(responsible);
    return { ...task, assignees, responsible };
}

/** An empty correction is ignored: removing a participant is a separate operation. */
export function editTaskParticipant<T extends TaskAssignments>(task: T, index: number, value: unknown): T {
    const name = normalizeAssignee(value);
    const previous = task.assignees[index];
    if (!name || previous === undefined) return task;
    const responsible = previous.toLowerCase() === task.responsible.toLowerCase() ? name : task.responsible;
    return setTaskResponsible({ ...task, assignees: task.assignees.map((person, i) => i === index ? name : person), responsible }, responsible);
}

export function removeTaskParticipant<T extends TaskAssignments>(task: T, index: number, confirmed = false): { needsConfirmation: boolean; task: T } {
    const person = task.assignees[index];
    const removesResponsible = Boolean(person && task.responsible && person.toLowerCase() === task.responsible.toLowerCase());
    if (removesResponsible && !confirmed) return { needsConfirmation: true, task };
    return {
        needsConfirmation: false,
        task: { ...task, assignees: task.assignees.filter((_, i) => i !== index), responsible: removesResponsible ? '' : task.responsible }
    };
}
