import type { BoardData, LooseBoardData, Task, TimelineEvent } from './types';
import { applyTimelineEventToState } from './timeline';
import { normalizeTimelineExtension } from './timelineSchema';
import { areSerializableValuesEqual, cloneSerializable } from './serializable';

export const HISTORY_CATEGORIES = ['all', 'creation', 'fields', 'status', 'people', 'planning', 'relations', 'archive', 'restore'] as const;
export type HistoryCategory = typeof HISTORY_CATEGORIES[number];
export type HistoryReference = { id: string; label?: string; historical: boolean };
export type HistoryChange = { field: string; before: unknown; after: unknown };
export type TaskHistoryEntry = {
    id: string; eventIds: string[]; index: number; at: string; kinds: string[]; summary: string;
    categories: HistoryCategory[]; changes: HistoryChange[]; author?: string; localAuthor: boolean;
    bulk: boolean; cause?: string; partial: boolean;
    origin?: string;
};
export type TaskHistoryProjection = {
    entries: TaskHistoryEntry[]; availableFrom?: string; historicalIndex?: number;
    baselineOnly: boolean; ambiguous: boolean; lifecycleId: string | null;
};

type State = NonNullable<Parameters<typeof applyTimelineEventToState>[0]>;
type Labels = Record<string, Record<string, string>>;
type Relations = { sourceId: number; targetId: number; kind: string }[];
const OMIT_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'statusChangedAt', 'assignee', 'assigneeIds', 'responsibleId', 'permanentId']);

function taskIn(state: State | null | undefined, id: number): Record<string, unknown> | undefined {
    return Array.isArray(state?.board?.tasks) ? state.board.tasks.find((task) => task && typeof task === 'object' && Number(task.id) === id) : undefined;
}
function signature(task: Record<string, unknown> | Task): string {
    const timestamp = typeof task.createdAt === 'string' && !Number.isNaN(Date.parse(task.createdAt)) ? new Date(task.createdAt).toISOString() : 'unknown';
    return `${task.id}:${timestamp}`;
}
function fields(task: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { responsible: '', assignees: [], tags: [], attachments: [], phaseId: '', milestoneId: '', sprintId: '', blocked: false, blockerReason: '', effort: null, ...task };
    if (!('assignees' in task) && typeof task.assignee === 'string') result.assignees = task.assignee ? [task.assignee] : [];
    for (const key of OMIT_FIELDS) delete result[key];
    return result;
}

export function historicalLabels(data: LooseBoardData | State | null | undefined): Labels {
    const columns = data?.board?.columns as { status: string; title: string }[] | undefined;
    const roadmap = data?.extensions?.roadmap as { phases?: { id: string; title: string }[]; milestones?: { id: string; title: string }[]; sprints?: { id: string; title: string }[] } | undefined;
    const result: Labels = { status: Object.fromEntries((Array.isArray(columns) ? columns : []).filter((column) => column && typeof column.status === 'string' && typeof column.title === 'string').map((column) => [column.status, column.title])) };
    for (const [field, kind] of [['phaseId', 'phases'], ['milestoneId', 'milestones'], ['sprintId', 'sprints']] as const) result[field] = Object.fromEntries((Array.isArray(roadmap?.[kind]) ? roadmap[kind]! : []).filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string').map((item) => [item.id, item.title]));
    return result;
}

/** Annotate only newly appended canonical events. No shadow log or retroactive edits. */
export function annotateTimelineOperation(before: BoardData, after: BoardData, firstEvent: number, operationId: string): void {
    const labels = { before: historicalLabels(before), after: historicalLabels(after) };
    for (const event of after.extensions.timeline?.events.slice(firstEvent) || []) event.meta = {
        ...event.meta, historyVersion: 1, operationId: event.meta?.operationId || operationId, labels
    };
}

function reference(field: string, value: unknown, event: TimelineEvent, side: 'before' | 'after', state: State | null | undefined, current: BoardData): unknown {
    if (!['status', 'phaseId', 'milestoneId', 'sprintId'].includes(field) || !value) return value;
    const id = String(value);
    const stored = event.meta?.labels as { before?: Labels; after?: Labels } | undefined;
    const oldStatusLabels = event.meta?.statusLabels as Record<string, string> | undefined;
    const candidate = stored?.[side]?.[field]?.[id] || (field === 'status' ? oldStatusLabels?.[id] : undefined) || historicalLabels(state)[field]?.[id];
    const known = typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
    return { id, label: known || historicalLabels(current)[field]?.[id], historical: Boolean(known) } satisfies HistoryReference;
}

function safeValue(field: string, value: unknown): unknown {
    if (field === 'attachments') {
        if (value === undefined || value === null) return value;
        if (!Array.isArray(value)) return { unavailable: true };
        return value.map((item) => item && typeof item === 'object' ? { id: item.id, name: item.name, mime: item.mime, sizeBytes: item.sizeBytes, kind: item.kind } : { unavailable: true });
    }
    return value;
}

function associations(state: State | null | undefined, id: number) {
    const extension = state?.extensions?.taskRelations as { relations?: Relations } | undefined;
    const relations = Array.isArray(extension?.relations) ? extension.relations : [];
    const blocks = state?.extensions?.dayPlanner as { blocks?: { taskId: number; id?: string }[] } | undefined;
    return {
        relations: relations.filter((relation) => relation && ['related', 'blocks'].includes(relation.kind) && (relation.sourceId === id || relation.targetId === id)).map((relation) => relation.kind === 'related' ? { ...relation, sourceId: Math.min(relation.sourceId, relation.targetId), targetId: Math.max(relation.sourceId, relation.targetId) } : relation).sort((a, b) => a.sourceId - b.sourceId || a.targetId - b.targetId || a.kind.localeCompare(b.kind)),
        planner: Array.isArray(blocks?.blocks) ? blocks.blocks.filter((block) => block && block.taskId === id).sort((a, b) => String(a.id).localeCompare(String(b.id))) : []
    };
}

function relationValue(relations: Relations, id: number, state: State | null | undefined) {
    return relations.map((relation) => {
        const other = relation.sourceId === id ? relation.targetId : relation.sourceId;
        return { direction: relation.kind === 'related' ? 'related' : relation.sourceId === id ? 'blocks' : 'blockedBy', id: other, ...(taskIn(state, other)?.displayId ? { displayId: taskIn(state, other)!.displayId } : {}), title: taskIn(state, other)?.title };
    });
}

function categories(event: TimelineEvent, changes: HistoryChange[]): HistoryCategory[] {
    const values = new Set<HistoryCategory>();
    if (event.kind === 'task.created') values.add('creation');
    if (event.kind === 'board.restored') values.add('restore');
    for (const { field } of changes) {
        values.add(field === 'status' ? 'status' : ['assignees', 'responsible'].includes(field) ? 'people'
            : ['phaseId', 'milestoneId', 'sprintId', 'planner'].includes(field) ? 'planning'
                : field === 'relations' ? 'relations' : field === 'archived' ? 'archive' : 'fields');
    }
    if (!values.size) values.add(event.kind.startsWith('planner.') ? 'planning' : event.kind.includes('relation') ? 'relations' : 'fields');
    return [...values];
}

/** A sequence-based projection, with proven lifecycle boundaries instead of timestamp guesses. */
export function projectTaskHistory(data: BoardData, selectedTask: Task, eventIndex?: number): TaskHistoryProjection {
    const timeline = normalizeTimelineExtension(data.extensions.timeline);
    const result: TaskHistoryProjection = { entries: [], baselineOnly: false, ambiguous: false, lifecycleId: null };
    if (!timeline?.events.length) return result;
    const end = eventIndex === undefined ? timeline.events.length - 1 : Math.max(0, Math.min(eventIndex, timeline.events.length - 1));
    if (eventIndex !== undefined) result.historicalIndex = end;
    result.availableFrom = timeline.events[0].at;
    const baseline = timeline.events[0];
    let state: State = baseline.snapshot ? cloneSerializable(baseline.snapshot) as State : { board: { tasks: [], columns: [], settings: {} }, extensions: {} };
    const id = selectedTask.id;
    const registry = new Map<string, Set<string>>();
    const register = (task: Record<string, unknown>, token: string) => { const key = signature(task); registry.set(key, new Set([...(registry.get(key) || []), token])); return token; };
    let active: string | null = taskIn(state, id) ? register(taskIn(state, id)!, `baseline:${baseline.id}:${id}`) : null;
    const candidates: { token: string | null; entry: TaskHistoryEntry }[] = [];

    for (let index = 1; index <= end; index++) {
        const event = timeline.events[index];
        const beforeState = state;
        const beforeTask = taskIn(beforeState, id);
        const previousToken = active;
        state = applyTimelineEventToState(state, event) || state;
        const afterTask = taskIn(state, id);
        if (event.kind === 'task.created' && Number(event.entityId) === id && afterTask) {
            active = register(afterTask, `created:${event.id}:${index}`);
        } else if (!afterTask) active = null;
        else if (!beforeTask || signature(afterTask) !== signature(beforeTask) || event.kind === 'board.restored') {
            const known = registry.get(signature(afterTask));
            if (known && known.size === 1) active = [...known][0];
            else if (known && known.size > 1) { active = null; result.ambiguous = true; }
            else active = register(afterTask, `snapshot:${event.id}:${id}`);
        }

        const changes: HistoryChange[] = [];
        const rawBefore = beforeTask ? fields(beforeTask) : {};
        const rawAfter = afterTask ? fields(afterTask) : {};
        const sameLife = previousToken === active || !beforeTask || !afterTask;
        const own = event.entityType === 'task' && Number(event.entityId) === id;
        if (sameLife && (beforeTask || afterTask)) {
            for (const field of new Set([...Object.keys(rawBefore), ...Object.keys(rawAfter)])) {
                if (field === 'pullRequests' && [rawBefore[field], rawAfter[field]].every((value) => value === undefined || (Array.isArray(value) && value.length === 0))) continue;
                if (areSerializableValuesEqual(rawBefore[field], rawAfter[field])) continue;
                changes.push({ field,
                    before: reference(field, safeValue(field, rawBefore[field]), event, 'before', beforeState, data),
                    after: reference(field, safeValue(field, rawAfter[field]), event, 'after', state, data) });
            }
        } else if (!sameLife) changes.push({ field: 'existence', before: false, after: true });
        const beforeAssociations = associations(beforeState, id);
        const afterAssociations = associations(state, id);
        if (!areSerializableValuesEqual(beforeAssociations.relations, afterAssociations.relations)) changes.push({ field: 'relations', before: relationValue(beforeAssociations.relations, id, beforeState), after: relationValue(afterAssociations.relations, id, state) });
        if (!areSerializableValuesEqual(beforeAssociations.planner, afterAssociations.planner)) changes.push({ field: 'planner', before: beforeAssociations.planner, after: afterAssociations.planner });

        // Partial legacy task events can still prove their explicitly recorded changes.
        if (!changes.length && own && !beforeTask && event.changes && event.kind !== 'task.relations.updated') {
            for (const [field, change] of Object.entries(event.changes)) changes.push({ field: field === 'block' ? 'planner' : field,
                before: reference(field, safeValue(field, change.before), event, 'before', null, data),
                after: reference(field, safeValue(field, change.after), event, 'after', null, data) });
        }
        if (own && event.meta?.transfer) changes.push({ field: 'transfer', before: null, after: event.meta.transfer });
        const publication = own && event.kind === 'task.comment.published';
        if (!changes.length && !publication && !(own && ['task.created', 'task.deleted', 'task.updated', 'task.status.changed', 'task.archived', 'task.restored'].includes(event.kind))) continue;
        // A known no-op is not a fictitious update. Unknown legacy details remain explicit.
        if (!changes.length && !publication && beforeTask && afterTask && event.changes) continue;
        const author = event.meta?.author;
        const authorName = typeof author === 'string' ? author : author && typeof author === 'object' && 'name' in author && typeof author.name === 'string' ? author.name : undefined;
        const entry: TaskHistoryEntry = {
            id: typeof event.meta?.operationId === 'string' ? event.meta.operationId : `${event.id}:${index}`, eventIds: [event.id], index, at: event.at,
            kinds: [event.kind], summary: event.summary, categories: categories(event, changes), changes,
            author: authorName, localAuthor: Boolean(authorName), bulk: event.kind.includes('bulk') || event.meta?.cause === 'bulk',
            cause: typeof event.meta?.cause === 'string' ? event.meta.cause : undefined,
            origin: typeof event.meta?.fromEventId === 'string' ? event.meta.fromEventId : undefined,
            partial: changes.length === 0 && !publication
        };
        candidates.push({ token: active || previousToken, entry });
    }
    const matching = registry.get(signature(selectedTask));
    let target = active && taskIn(state, id) && signature(taskIn(state, id)!) === signature(selectedTask) ? active : null;
    if (!target && matching && matching.size > 1) result.ambiguous = true;
    if (!target && registry.size) result.ambiguous = true;
    // No snapshot evidence: only a single, unambiguous legacy lifecycle can be queried by numeric ID.
    if (!target && !registry.size && !timeline.events.slice(1, end + 1).some((e) => Number(e.entityId) === id && ['task.created', 'task.deleted'].includes(e.kind))) target = `partial:${id}`;
    if (!target && timeline.events.slice(1, end + 1).some((e) => Number(e.entityId) === id && ['task.created', 'task.deleted'].includes(e.kind))) result.ambiguous = true;
    result.lifecycleId = target;
    const grouped = new Map<string, TaskHistoryEntry>();
    for (const candidate of candidates) {
        if (candidate.token !== target && !(target === `partial:${id}` && !candidate.token)) continue;
        const entry = candidate.entry;
        const existing = grouped.get(entry.id);
        if (!existing) { grouped.set(entry.id, entry); continue; }
        existing.eventIds.push(...entry.eventIds); existing.kinds.push(...entry.kinds);
        existing.changes.push(...entry.changes); existing.categories = [...new Set([...existing.categories, ...entry.categories])];
        existing.index = entry.index; existing.at = entry.at; existing.bulk ||= entry.bulk;
        existing.partial ||= entry.partial;
        existing.author ||= entry.author; existing.localAuthor ||= entry.localAuthor;
    }
    result.entries = [...grouped.values()].sort((a, b) => b.index - a.index);
    const archive = data.extensions.projectTransfers?.operations.filter((operation) => operation.mode === 'move' && operation.to.permanentId === selectedTask.permanentId).at(-1)?.history || [];
    if (archive.length) {
        const seen = new Set(result.entries.map((entry) => entry.id));
        result.entries.push(...cloneSerializable(archive.filter((entry) => !seen.has(entry.id))));
    }
    result.baselineOnly = !result.entries.length && Boolean(target?.startsWith('baseline:'));
    return result;
}
