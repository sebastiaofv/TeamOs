import type { BoardData, Task, WorkitemType, WorkitemAutomation } from './types';
import { canTransition, getWorkflow, statusCategory } from './workflow';
import { getSprintCalendarStatus } from './roadmap';
import { nowIso, todayLocalIsoDate } from './util';

export const WORKITEM_TYPES = ['epic', 'story', 'task', 'bug'] as const;
export const WORKITEM_FIELDS = ['objective', 'scope', 'businessValue', 'acceptanceCriteria', 'stepsToReproduce', 'expectedResult', 'actualResult', 'severity', 'environment'] as const;
export function workitemFieldNames(type: WorkitemType): readonly typeof WORKITEM_FIELDS[number][] {
    return type === 'epic' ? ['objective', 'scope', 'businessValue'] : type === 'story' ? ['acceptanceCriteria'] : type === 'bug' ? ['stepsToReproduce', 'expectedResult', 'actualResult', 'severity', 'environment'] : [];
}
export const workitemType = (task: Pick<Task, 'type'>): WorkitemType => task.type || 'task';
export class WorkitemError extends Error {
    constructor(public code: 'type' | 'immutable' | 'parent' | 'children' | 'criteria' | 'pending' | 'acceptance' | 'sprint' | 'configuration' | 'data' | 'epic' | 'author' | 'stale') { super(({ type: 'Unknown workitem type.', immutable: 'A workitem type is immutable after creation.', parent: 'Choose a valid parent in this project.', children: 'Reassign or detach children before deleting or moving this workitem.', criteria: 'Acceptance criteria are required.', pending: 'Complete, cancel or detach pending child Tasks.', acceptance: 'Functional acceptance is required.', sprint: 'Plan this workitem through an eligible Sprint or its Story.', configuration: 'Invalid automation configuration.', data: 'Invalid workitem data.', epic: 'An epic cannot have execution-only fields.', author: 'A non-empty local author is required.', stale: 'The preview is stale; review the changed project.' })[code]); }
}
export function childrenOf(data: BoardData, id: number): Task[] { return data.board.tasks.filter((task) => task.parentId === id); }
export function isTerminal(data: BoardData, task: Task): boolean { return ['completed', 'cancelled'].includes(statusCategory(task.status, data, task)); }
export function parentOf(data: BoardData, task: Task): Task | undefined { return task.parentId == null ? undefined : data.board.tasks.find((item) => item.id === task.parentId); }
export function storyOf(data: BoardData, task: Task): Task | undefined { const parent = parentOf(data, task); return parent && workitemType(parent) === 'story' ? parent : undefined; }
export function epicOf(data: BoardData, task: Task): Task | undefined {
    const parent = parentOf(data, task);
    return parent && workitemType(parent) === 'epic' ? parent : parent && workitemType(parent) === 'story' ? parentOf(data, parent) : undefined;
}
export function validParent(type: WorkitemType, parent: Pick<Task, 'type'>): boolean {
    return type === 'story' ? workitemType(parent) === 'epic' : type === 'task' && ['epic', 'story'].includes(workitemType(parent));
}
export function eligibleSprint(data: BoardData, id: string): boolean {
    const sprint = data.extensions.roadmap?.sprints.find((item) => item.id === id);
    return Boolean(sprint && getSprintCalendarStatus(sprint, todayLocalIsoDate()) !== 'done');
}
export function effectivePlanning(data: BoardData, task: Task, field: 'phaseId' | 'milestoneId'): string {
    const seen = new Set<number>(); let current: Task | undefined = task;
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        const mode = field === 'phaseId' ? current.phaseMode : current.milestoneMode;
        if (mode !== 'inherit') return mode === 'none' ? '' : current[field] || '';
        current = parentOf(data, current);
    }
    return '';
}
export function workitemProgress(data: BoardData, id: number) {
    const children = childrenOf(data, id);
    const cancelled = children.filter((task) => statusCategory(task.status, data, task) === 'cancelled').length;
    const eligible = children.length - cancelled;
    const completed = children.filter((task) => statusCategory(task.status, data, task) === 'completed').length;
    return { total: children.length, eligible, completed, cancelled, percent: eligible ? completed / eligible * 100 : null };
}
export function isPlanningUnit(data: BoardData, task: Task): boolean {
    return workitemType(task) !== 'epic' && !(workitemType(task) === 'task' && workitemType(parentOf(data, task) || {}) === 'story');
}
export function assertWorkitems(data: BoardData, previous?: BoardData): void {
    const byId = new Map(data.board.tasks.map((task) => [task.id, task]));
    const previousById = new Map(previous?.board.tasks.map((task) => [task.id, task]) || []);
    for (const task of data.board.tasks) {
        const type = workitemType(task);
        if (!WORKITEM_TYPES.includes(type)) throw new WorkitemError('type');
        const before = previousById.get(task.id);
        if (before && type !== workitemType(before)) throw new WorkitemError('immutable');
        if (task.parentId != null) {
            const parent = byId.get(task.parentId);
            if (!Number.isSafeInteger(task.parentId) || !parent || parent.id === task.id || !validParent(type, parent)) throw new WorkitemError('parent');
            const seen = new Set([task.id]); let cursor: Task | undefined = parent;
            while (cursor) { if (seen.has(cursor.id)) throw new WorkitemError('parent'); seen.add(cursor.id); cursor = cursor.parentId == null ? undefined : byId.get(cursor.parentId); }
        }
        if (type === 'epic' && (task.effort || task.sprintId || task.pullRequests?.length)) throw new WorkitemError('epic');
        for (const field of WORKITEM_FIELDS) if (task[field] !== undefined && typeof task[field] !== 'string') throw new WorkitemError('data');
        for (const mode of [task.phaseMode, task.milestoneMode]) if (mode !== undefined && !['inherit', 'none', 'explicit'].includes(mode)) throw new WorkitemError('data');
        if (task.acceptance !== undefined && (!task.acceptance || typeof task.acceptance.author !== 'string' || !task.acceptance.author.trim() || !Number.isFinite(Date.parse(task.acceptance.at)) || task.acceptance.local !== true)) throw new WorkitemError('data');
        if (task.sprintHistory !== undefined && (!Array.isArray(task.sprintHistory) || task.sprintHistory.some((entry) => !entry || typeof entry.sprintId !== 'string' || !entry.sprintId || typeof entry.status !== 'string' || !Number.isFinite(Date.parse(entry.at))))) throw new WorkitemError('data');
    }
    if (previous) for (const task of previous.board.tasks) if (!data.board.tasks.some((entry) => entry.id === task.id) && childrenOf(previous, task.id).some((child) => data.board.tasks.some((entry) => entry.id === child.id && entry.parentId === task.id))) throw new WorkitemError('children');
    const participation = data.extensions.sprintParticipation;
    if (participation && (participation.version !== 1 || !Array.isArray(participation.entries) || participation.entries.some((entry) => !entry || typeof entry.sprintId !== 'string' || !entry.sprintId || !entry.task || !Number.isSafeInteger(entry.task.id) || typeof entry.task.title !== 'string' || !WORKITEM_TYPES.includes(workitemType(entry.task)) || typeof entry.task.status !== 'string' || !Number.isFinite(Date.parse(entry.at))) || new Set(participation.entries.map((entry) => `${entry.sprintId}:${entry.task.id}`)).size !== participation.entries.length)) throw new WorkitemError('data');
    validateAutomation(data, data.extensions.workitemAutomation);
}
export function assertAcceptance(data: BoardData, task: Task): void {
    if (workitemType(task) === 'story') {
        if (!task.acceptanceCriteria?.trim()) throw new WorkitemError('criteria');
        if (childrenOf(data, task.id).some((child) => !isTerminal(data, child))) throw new WorkitemError('pending');
    }
}
export function validateAutomation(data: BoardData, config?: WorkitemAutomation): void {
    if (config === undefined) return;
    if (!config || config.version !== 1) throw new WorkitemError('configuration');
    const states = getWorkflow(data, 'functional').states;
    for (const rule of [config.start, config.finish]) {
        if (!rule) continue;
        if (!Array.isArray(rule.from) || !rule.from.length || new Set(rule.from).size !== rule.from.length || !rule.from.every((id) => states.some((state) => state.id === id && !['completed', 'cancelled'].includes(state.category)))) throw new WorkitemError('configuration');
        if (!states.some((state) => state.id === rule.to && !['completed', 'cancelled'].includes(state.category)) || rule.from.includes(rule.to)) throw new WorkitemError('configuration');
    }
}
/** Current allocation follows unfinished work; the recorded roster is never rebuilt from a parent's current Sprint. */
export function syncWorkitemPlanning(data: BoardData, previous: BoardData): void {
    const entries = structuredClone(data.extensions.sprintParticipation?.entries || []);
    const entryIndexes = new Map(entries.map((entry, index) => [`${entry.sprintId}:${entry.task.id}`, index]));
    const previousById = new Map(previous.board.tasks.map((task) => [task.id, task]));
    const byId = new Map(data.board.tasks.map((task) => [task.id, task]));
    const capture = (task: Task, overwrite: boolean) => {
        if (!task.sprintId) return;
        const key = `${task.sprintId}:${task.id}`;
        const index = entryIndexes.get(key) ?? -1;
        const entry = { sprintId: task.sprintId, task: structuredClone(task), at: nowIso() };
        if (index < 0) { entryIndexes.set(key, entries.length); entries.push(entry); } else if (overwrite && JSON.stringify(entries[index].task) !== JSON.stringify(task)) entries[index] = entry;
    };
    previous.board.tasks.forEach((task) => capture(task, false));
    for (const task of data.board.tasks) {
        const before = previousById.get(task.id);
        const parent = task.parentId == null ? undefined : byId.get(task.parentId);
        if (workitemType(task) === 'task' && parent && workitemType(parent) === 'story' && !isTerminal(data, task)) task.sprintId = eligibleSprint(data, parent.sprintId) ? parent.sprintId : '';
        else if (before?.parentId && !task.parentId && !isTerminal(data, task) && !eligibleSprint(data, task.sprintId)) task.sprintId = '';
        if (task.parentId && !before) { task.phaseMode ??= 'inherit'; task.milestoneMode ??= 'inherit'; }
        if (before?.sprintId && before.sprintId !== task.sprintId) {
            task.sprintHistory ||= [];
            const previousEntry = task.sprintHistory.find((entry) => entry.sprintId === before.sprintId);
            if (previousEntry) Object.assign(previousEntry, { status: before.status, parentId: before.parentId ?? null, at: nowIso() });
            else task.sprintHistory.push({ sprintId: before.sprintId, status: before.status, parentId: before.parentId ?? null, at: nowIso() });
        }
        if (task.sprintId && (!before || before.sprintId !== task.sprintId)) {
            task.sprintHistory ||= [];
            if (!task.sprintHistory.some((entry) => entry.sprintId === task.sprintId)) task.sprintHistory.push({ sprintId: task.sprintId, status: task.status, parentId: task.parentId ?? null, at: nowIso() });
        }
    }
    data.board.tasks.forEach((task) => capture(task, eligibleSprint(data, task.sprintId)));
    if (entries.length) data.extensions.sprintParticipation = { version: 1, entries };
}
export function applyStoryAutomation(data: BoardData, previous: BoardData): { storyId: number; taskId: number; blocked: boolean }[] {
    const effects: ReturnType<typeof applyStoryAutomation> = [];
    const previousById = new Map(previous.board.tasks.map((task) => [task.id, task]));
    const changed = data.board.tasks.filter((task) => { const before = previousById.get(task.id); return workitemType(task) === 'task' && before && before.status !== task.status && before.parentId === task.parentId; });
    const handled = new Set<number>();
    for (const task of changed) {
        const story = parentOf(data, task);
        if (!story || workitemType(story) !== 'story' || handled.has(story.id) || isTerminal(data, story)) continue;
        handled.add(story.id);
        const children = childrenOf(data, story.id).filter((child) => statusCategory(child.status, data, child) !== 'cancelled');
        const old = childrenOf(previous, story.id).filter((child) => statusCategory(child.status, previous, child) !== 'cancelled');
        const started = (list: Task[], board: BoardData) => list.some((child) => ['in-progress', 'completed'].includes(statusCategory(child.status, board, child)));
        const finished = (list: Task[], board: BoardData) => list.length > 0 && list.every((child) => statusCategory(child.status, board, child) === 'completed');
        const rule = finished(children, data) && !finished(old, previous) ? data.extensions.workitemAutomation?.finish : started(children, data) && !started(old, previous) ? data.extensions.workitemAutomation?.start : undefined;
        if (!rule?.from.includes(story.status) || rule.to === story.status) continue;
        const blocked = !canTransition(data, story.status, rule.to, story);
        if (!blocked) { story.status = rule.to; story.updatedAt = nowIso(); }
        effects.push({ storyId: story.id, taskId: task.id, blocked });
    }
    return effects;
}
export function taskInTechnicalBoard(data: BoardData, task: Task): boolean {
    if (!['task', 'bug'].includes(workitemType(task))) return false;
    const parent = parentOf(data, task);
    if (!parent || workitemType(parent) !== 'story') return true;
    const sprint = data.extensions.roadmap?.sprints.find((item) => item.id === task.sprintId);
    return Boolean(sprint && getSprintCalendarStatus(sprint, todayLocalIsoDate()) === 'active');
}

export function sprintMembers(data: BoardData, sprintId: string): Task[] {
    const members = new Map<number, Task>();
    for (const entry of data.extensions.sprintParticipation?.entries || []) if (entry.sprintId === sprintId) members.set(entry.task.id, structuredClone(entry.task));
    for (const task of data.board.tasks) {
        if (task.sprintId === sprintId) {
            if (eligibleSprint(data, sprintId) || !members.has(task.id)) members.set(task.id, task);
        } else {
            const history = task.sprintHistory?.find((entry) => entry.sprintId === sprintId);
            if (history && !members.has(task.id)) members.set(task.id, { ...task, status: history.status, sprintId, parentId: Object.hasOwn(history, 'parentId') ? history.parentId : task.parentId });
        }
    }
    return [...members.values()];
}

/** One consultation context for actual participation, independent of live parent/allocation changes.
 * Workflow presentation stays with the supplied project; no historical workflow is invented.
 */
export function consultSprintParticipation(data: BoardData, sprintId: string) {
    const members = structuredClone(sprintMembers(data, sprintId));
    const boardData = { ...data, board: { ...data.board, tasks: members } };
    const currentIds = new Set(eligibleSprint(data, sprintId)
        ? data.board.tasks.filter((task) => task.sprintId === sprintId).map((task) => task.id) : []);
    return {
        boardData,
        members,
        planningMembers: members.filter((task) => isPlanningUnit(boardData, task)),
        isCurrent: (taskId: number) => currentIds.has(taskId)
    };
}

export type SprintParticipation = ReturnType<typeof consultSprintParticipation>;

/** US-13 calls this boundary before previewing a transfer; transferring a parent never transfers its children implicitly. */
export function assertWorkitemTransfer(data: BoardData, id: number, mode: 'copy' | 'move'): void {
    const task = data.board.tasks.find((entry) => entry.id === id);
    if (!task) throw new WorkitemError('data');
    if (mode === 'move' && childrenOf(data, id).length) throw new WorkitemError('children');
}
/** Acceptance belongs to the workitem's lifecycle: a copy needs its own acceptance even if its source was accepted. */
export function transferredAcceptance(source: Task, mode: 'copy' | 'move', targetCompleted: boolean, author?: string): Task['acceptance'] {
    if (!targetCompleted || !['story', 'bug'].includes(workitemType(source))) return undefined;
    if (mode === 'move' && source.acceptance) return structuredClone(source.acceptance);
    if (!author?.trim()) throw new WorkitemError('author');
    return { author: author.trim(), at: nowIso(), local: true };
}
