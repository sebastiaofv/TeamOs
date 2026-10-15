import type { BoardData, RoadmapKind, Task } from './types';
import { getRoadmapExtension } from './roadmap';
import { validateDatePair, type ProjectDates } from './project';
import { eligibleLeafTasks } from './workitems';
import { isTaskCompleted, statusCategory } from './workflow';

export type PhasePlanDetails = { parentId: string; baseline?: ProjectDates; actual?: ProjectDates; baselineRevisions?: { at: string; reason: string; dates: ProjectDates }[] };
export type ProjectPlan = { version: 1; phases: Record<string, PhasePlanDetails> };
export function getProjectPlan(data: BoardData): ProjectPlan {
    const stored = data.extensions.projectPlan as ProjectPlan | undefined;
    if (stored && (stored.version !== 1 || !stored.phases || typeof stored.phases !== 'object')) throw new Error('Unsupported project plan metadata.');
    return stored || { version: 1, phases: {} };
}

export function validatePhaseHierarchy(data: BoardData): void {
    const plan = getProjectPlan(data), phases = getRoadmapExtension(data)?.phases || [];
    const ids = new Set(phases.map((phase) => phase.id));
    const parents = new Set<string>();
    for (const [id, detail] of Object.entries(plan.phases)) {
        if (!detail || typeof detail.parentId !== 'string') throw new Error('Invalid phase metadata.');
        if (detail.baseline) validateDatePair(detail.baseline);
        if (detail.actual) validateDatePair(detail.actual);
        for (const revision of detail.baselineRevisions || []) {
            if (!revision.reason?.trim() || !Number.isFinite(Date.parse(revision.at))) throw new Error('Invalid baseline revision.');
            validateDatePair(revision.dates);
        }
        if (!ids.has(id)) throw new Error('Phase metadata references a missing phase.');
        if (!detail.parentId) continue;
        if (!ids.has(detail.parentId)) throw new Error('Parent phase does not exist.');
        parents.add(detail.parentId);
        const visited = new Set([id]);
        let cursor = detail.parentId;
        while (cursor) {
            if (visited.has(cursor)) throw new Error('Phase hierarchy cannot contain cycles.');
            visited.add(cursor);
            cursor = plan.phases[cursor]?.parentId || '';
        }
    }
    for (const task of data.board.tasks) if (task.phaseId && parents.has(task.phaseId)) throw new Error('Workitems must be assigned to a leaf phase.');
}

export function phaseDescendants(data: BoardData, phaseId: string): Set<string> {
    const plan = getProjectPlan(data), included = new Set([phaseId]), pending = [phaseId];
    while (pending.length) {
        const parent = pending.pop()!;
        for (const [id, detail] of Object.entries(plan.phases)) if (detail.parentId === parent && !included.has(id)) { included.add(id); pending.push(id); }
    }
    return included;
}

export function planWorkitems(data: BoardData, kind: RoadmapKind, id: string): Task[] {
    const field = kind === 'phases' ? 'phaseId' : kind === 'milestones' ? 'milestoneId' : 'sprintId';
    const refs = kind === 'phases' ? phaseDescendants(data, id) : new Set([id]);
    const included = new Set(data.board.tasks.filter((task) => refs.has(task[field])).map((task) => task.id));
    const children = new Map<number, number[]>();
    for (const task of data.board.tasks) if (task.parentId) children.set(task.parentId, [...(children.get(task.parentId) || []), task.id]);
    const pending = [...included];
    while (pending.length) for (const child of children.get(pending.pop()!) || []) if (!included.has(child)) { included.add(child); pending.push(child); }
    return data.board.tasks.filter((task) => included.has(task.id));
}

export function executionProgress(data: BoardData, tasks: readonly Task[] = data.board.tasks): { eligible: Task[]; completed: Task[]; percent: number | null } {
    const ids = new Set(tasks.map((task) => task.id));
    const eligible = eligibleLeafTasks(data).filter((task) => ids.has(task.id) && statusCategory(data, task.status) !== 'cancelled');
    const completed = eligible.filter((task) => isTaskCompleted(data, task));
    return { eligible, completed, percent: eligible.length ? completed.length / eligible.length * 100 : null };
}

export function phaseDepth(data: BoardData, id: string): number {
    const plan = getProjectPlan(data), seen = new Set<string>();
    let depth = 0, parent = plan.phases[id]?.parentId;
    while (parent && !seen.has(parent)) { seen.add(parent); depth++; parent = plan.phases[parent]?.parentId; }
    return depth;
}

export function orderedPhases(data: BoardData) {
    const phases = getRoadmapExtension(data)?.phases || [], plan = getProjectPlan(data), ordered: typeof phases = [], seen = new Set<string>();
    const visit = (parentId: string) => {
        for (const phase of phases.filter((phase) => (plan.phases[phase.id]?.parentId || '') === parentId).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))) {
            if (seen.has(phase.id)) continue;
            seen.add(phase.id); ordered.push(phase); visit(phase.id);
        }
    };
    visit('');
    return [...ordered, ...phases.filter((phase) => !seen.has(phase.id))];
}
