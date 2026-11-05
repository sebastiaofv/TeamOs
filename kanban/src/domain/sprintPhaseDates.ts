import type { BoardData } from './types';
import { effectivePlanning, workitemType } from './workitems';

/** One review per phase, including Tasks inheriting their parent's phase. */
export function sprintPhaseDateConflicts(data: BoardData, previous: BoardData) {
    const conflicts = new Map<string, { phaseId: string; title: string; startDate: string; endDate: string; tasks: number[] }>();
    for (const task of data.board.tasks) {
        if (workitemType(task) !== 'task' || !task.sprintId) continue;
        const phaseId = effectivePlanning(data, task, 'phaseId');
        const phase = data.extensions.roadmap?.phases.find((entry) => entry.id === phaseId);
        const sprint = data.extensions.roadmap?.sprints.find((entry) => entry.id === task.sprintId);
        if (!phase?.startDate || !phase.endDate || !sprint?.startDate || !sprint.endDate) continue;
        const before = previous.board.tasks.find((entry) => entry.id === task.id);
        const oldSprint = previous.extensions.roadmap?.sprints.find((entry) => entry.id === before?.sprintId);
        const oldPhase = previous.extensions.roadmap?.phases.find((entry) => entry.id === (before && effectivePlanning(previous, before, 'phaseId')));
        if (before?.sprintId === task.sprintId && oldPhase?.id === phase.id && oldSprint?.startDate === sprint.startDate && oldSprint?.endDate === sprint.endDate) continue;
        if (sprint.startDate >= phase.startDate && sprint.endDate <= phase.endDate) continue;
        const conflict = conflicts.get(phaseId) || { phaseId, title: phase.title, startDate: phase.startDate, endDate: phase.endDate, tasks: [] };
        conflict.startDate = [conflict.startDate, sprint.startDate].sort()[0];
        conflict.endDate = [conflict.endDate, sprint.endDate].sort().at(-1)!;
        conflict.tasks.push(task.id);
        conflicts.set(phaseId, conflict);
    }
    return [...conflicts.values()];
}
