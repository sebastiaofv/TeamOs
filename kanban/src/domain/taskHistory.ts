import type { BoardData, DayPlanBlock, Task, TimelineEvent } from './types';
import type { TaskHistory, TaskHistoryChange, TaskHistoryEntry } from './taskHistoryTypes';
import { applyTimelineEventToState } from './timeline';
import { normalizeTimelineEvent } from './timelineSchema';
import { TIMELINE_VERSION } from './constants';
import { getDayPlannerBlocks, normalizeDayPlannerBlock } from './dayPlanner';
import { areSerializableValuesEqual, cloneSerializable } from './serializable';
import { isRecord } from './util';
import {
    HISTORY_FIELDS, historyLabelState, historyTask, matchesHistoryTask, planningHistoryValue, recordedFieldValue,
    taskFieldValue, taskHistoryChanges, unknownHistoryValue
} from './taskHistoryValues';
import type { HistoryState, HistoryTask } from './taskHistoryValues';

type Lifecycle = { earlierUnavailable: boolean; incomplete: boolean };
type Frame = {
    task: HistoryTask | null;
    lifecycle: Lifecycle | null;
    blocks: DayPlanBlock[];
    owners: Map<string, Lifecycle | null>;
    labels: HistoryState;
};
type OwnedEntry = { lifecycle: Lifecycle; entry: TaskHistoryEntry };
const TASK_EDIT_KINDS = new Set(['task.updated', 'task.status.changed', 'task.archived', 'task.restored']);

function couldAffectTask(raw: unknown, taskId: number): boolean {
    if (!isRecord(raw)) return true;
    if (raw.entityType === 'task') return Number(raw.entityId) === taskId;
    if (raw.kind === 'board.settings.updated' || raw.kind === 'board.columns.updated') return false;
    if (raw.kind === 'roadmap.bulk-assigned' && isRecord(raw.meta) && Array.isArray(raw.meta.taskIds)) return raw.meta.taskIds.some((id) => Number(id) === taskId);
    if (typeof raw.kind === 'string' && raw.kind.startsWith('planner.block.') && isRecord(raw.changes) && isRecord(raw.changes.block)) {
        const { before, after } = raw.changes.block;
        return [before, after].some((block) => isRecord(block) && Number(block.taskId) === taskId);
    }
    return true;
}

function ownedBlocks(frame: Frame, lifecycle: Lifecycle): DayPlanBlock[] {
    if (frame.lifecycle !== lifecycle) return [];
    return frame.blocks.filter((block) => frame.owners.get(block.id) === lifecycle)
        .sort((a, b) => a.id.localeCompare(b.id));
}

/** A pure, project-local projection. Array position, not event time, is the clock. */
export function deriveTaskHistory(boardData: BoardData, task: Task, options: { eventIndex?: number | null } = {}): TaskHistory {
    const empty = (): TaskHistory => ({ entries: [], earlierHistoryUnavailable: true, incomplete: true, asOf: null });
    const rawTimeline = boardData.extensions?.timeline;
    if (!isRecord(rawTimeline) || Number(rawTimeline.version) !== TIMELINE_VERSION || !Array.isArray(rawTimeline.events) || !rawTimeline.events.length) return empty();
    const rawEvents: unknown[] = rawTimeline.events;
    const latest = rawEvents.length - 1;
    const requested = options.eventIndex;
    const limit = typeof requested === 'number' && Number.isFinite(requested)
        ? Math.max(0, Math.min(latest, Math.trunc(requested))) : latest;
    const limitEvent = normalizeTimelineEvent(rawEvents[limit]);
    const asOf = limit < latest && limitEvent ? { eventId: limitEvent.id, at: limitEvent.at } : null;
    let state: HistoryState = {};
    let labels: HistoryState = {};
    let lifecycle: Lifecycle | null = null;
    let owners = new Map<string, Lifecycle | null>();
    // Keep tombstones as well as live ownership: a late move of a removed
    // orphan is not proof that it belongs to the replacement task.
    const knownBlockOwners = new Map<string, Lifecycle | null>();
    let absenceKnown = false;
    const frames = new Map<string, Frame>();
    const duplicateIds = new Set<string>();
    const entries: OwnedEntry[] = [];

    const addEntry = (event: TimelineEvent, owner: Lifecycle, changes: TaskHistoryChange[], kind = event.kind, incomplete = false) => {
        if (!changes.length && kind !== 'task.created' && kind !== 'task.deleted') return;
        const missing = incomplete || changes.some((change) => !change.before.known || !change.after.known);
        if (missing) owner.incomplete = true;
        entries.push({ lifecycle: owner, entry: { id: event.id, at: event.at, kind, changes, incomplete: missing } });
    };

    for (let index = 0; index <= limit; index += 1) {
        const rawEvent = rawEvents[index];
        const event = normalizeTimelineEvent(rawEvent);
        if (!event) {
            // An invalid lifecycle boundary cannot prove continuity, even if
            // the replacement happens to have exactly the same task fields.
            if (isRecord(rawEvent) && (rawEvent.kind === 'board.restored' || (Number(rawEvent.entityId) === task.id && ['task.created', 'task.deleted'].includes(String(rawEvent.kind))))) {
                state = { ...state, board: { ...state.board, tasks: state.board?.tasks?.filter((item) => Number(item.id) !== task.id) } };
                lifecycle = null;
                absenceKnown = false;
            } else if (lifecycle && couldAffectTask(rawEvent, task.id)) lifecycle.incomplete = true;
            continue;
        }
        const beforeLabels = labels;
        let beforeTask = historyTask(state, task.id);
        const beforeLifecycle = lifecycle;
        const beforeFrame: Frame = { task: beforeTask, lifecycle, blocks: getDayPlannerBlocks(state).filter((block) => block.taskId === task.id), owners, labels };
        const direct = event.entityType === 'task' && Number(event.entityId) === task.id;
        const baseline = event.kind === 'board.baseline' && Boolean(event.snapshot?.board && Array.isArray(event.snapshot.board.tasks));

        if (baseline) {
            state = cloneSerializable(event.snapshot) as HistoryState;
            lifecycle = historyTask(state, task.id) ? { earlierUnavailable: true, incomplete: true } : null;
            absenceKnown = true;
        } else {
            // Without a baseline, explicit field pairs still carry useful
            // evidence. Seed only those fields, never the current board/task.
            if (direct && TASK_EDIT_KINDS.has(event.kind) && !beforeTask && !absenceKnown && event.changes) {
                beforeTask = { id: task.id };
                for (const field of HISTORY_FIELDS) {
                    if (event.changes[field]) beforeTask[field] = cloneSerializable(event.changes[field].before);
                }
                state = { ...state, board: { ...state.board, tasks: [...(state.board?.tasks || []), beforeTask] } };
                lifecycle = { earlierUnavailable: true, incomplete: true };
            }
            state = applyTimelineEventToState(state, event) || {};
            if (direct && event.kind === 'task.created') {
                // Creation always opens a new incarnation, including identical
                // snapshots and equal createdAt timestamps.
                lifecycle = historyTask(state, task.id) && event.snapshot
                    ? { earlierUnavailable: false, incomplete: false } : null;
                absenceKnown = Boolean(event.snapshot);
            } else if (direct && event.kind === 'task.deleted') {
                lifecycle = null;
                absenceKnown = true;
            } else if (event.kind === 'board.restored') {
                const sourceId = event.meta?.fromEventId || '';
                const source = duplicateIds.has(sourceId) ? undefined : frames.get(sourceId);
                const restoredTask = historyTask(state, task.id);
                const proven = Boolean(event.snapshot?.board && source && (
                    (!source.task && !restoredTask) || (source.task && restoredTask && matchesHistoryTask(source.task, restoredTask) && matchesHistoryTask(restoredTask, source.task))
                ));
                lifecycle = proven && source ? source.lifecycle : restoredTask && event.snapshot?.board ? { earlierUnavailable: true, incomplete: true } : null;
                absenceKnown = Boolean(event.snapshot?.board);
            } else if (event.kind === 'roadmap.updated' && event.snapshot?.board) {
                const afterTask = historyTask(state, task.id);
                if (!afterTask) lifecycle = null;
                else if (!beforeTask || (beforeTask.createdAt && afterTask.createdAt && beforeTask.createdAt !== afterTask.createdAt)) lifecycle = { earlierUnavailable: true, incomplete: true };
                absenceKnown = true;
            }
        }

        const afterTask = historyTask(state, task.id);
        const blocks = getDayPlannerBlocks(state).filter((block) => block.taskId === task.id);
        const nextOwners = new Map<string, Lifecycle | null>();
        const sourceId = event.meta?.fromEventId || '';
        const source = event.kind === 'board.restored' && !duplicateIds.has(sourceId) ? frames.get(sourceId) : undefined;
        const recovered = source && source.lifecycle === lifecycle && source.task && afterTask && matchesHistoryTask(source.task, afterTask) && matchesHistoryTask(afterTask, source.task);
        labels = historyLabelState(recovered ? source.labels : labels, state);
        let planningGap = false;
        for (const block of blocks) {
            if (baseline) nextOwners.set(block.id, lifecycle);
            else if (event.kind === 'board.restored') {
                const sourceBlock = recovered ? source.blocks.find((item) => item.id === block.id) : null;
                nextOwners.set(block.id, sourceBlock && areSerializableValuesEqual(sourceBlock, block) ? source?.owners.get(block.id) || null : null);
                if (!sourceBlock && lifecycle) lifecycle.incomplete = true;
            } else {
                const change = event.kind.startsWith('planner.block.') ? event.changes?.block : null;
                const priorBlock = change ? normalizeDayPlannerBlock(change.before) : null;
                const changedBlock = change ? normalizeDayPlannerBlock(change.after) : null;
                const assigned = changedBlock?.id === block.id && (change?.before == null || priorBlock && priorBlock.taskId !== task.id);
                let owner = owners.get(block.id) ?? knownBlockOwners.get(block.id) ?? null;
                if (assigned || event.kind === 'roadmap.updated' && !knownBlockOwners.has(block.id)) owner = lifecycle;
                else if (changedBlock?.id === block.id && priorBlock && !knownBlockOwners.has(block.id)) {
                    owner = lifecycle;
                    planningGap = true;
                }
                if (changedBlock?.id === block.id && owner === lifecycle && priorBlock?.taskId === task.id && !areSerializableValuesEqual(beforeFrame.blocks.find((item) => item.id === priorBlock.id), priorBlock)) planningGap = true;
                nextOwners.set(block.id, owner);
                if (!owner && lifecycle) lifecycle.incomplete = true;
            }
            knownBlockOwners.set(block.id, nextOwners.get(block.id) || null);
        }
        owners = nextOwners;
        const afterFrame: Frame = { task: afterTask, lifecycle, blocks, owners, labels };

        if (baseline && lifecycle && afterTask) {
            const changes = taskHistoryChanges(null, afterTask, beforeLabels, labels, false);
            const initialBlocks = ownedBlocks(afterFrame, lifecycle);
            if (initialBlocks.length) changes.push({ field: 'planning', before: unknownHistoryValue(), after: planningHistoryValue(initialBlocks) });
            addEntry(event, lifecycle, changes, 'task.initial', true);
        } else if (direct && event.kind === 'task.deleted' && beforeLifecycle) {
            const changes = taskHistoryChanges(beforeTask, null, beforeLabels, labels);
            const previousBlocks = ownedBlocks(beforeFrame, beforeLifecycle);
            if (previousBlocks.length) changes.push({ field: 'planning', before: planningHistoryValue(previousBlocks), after: planningHistoryValue([]) });
            addEntry(event, beforeLifecycle, changes);
        } else if (lifecycle && afterTask) {
            const sameLifecycle = beforeLifecycle === lifecycle;
            const creation = direct && event.kind === 'task.created';
            const recoveredLifecycle = event.kind === 'board.restored' && recovered;
            const beforeKnown = creation || sameLifecycle || Boolean(recoveredLifecycle);
            const previousTask = sameLifecycle || (TASK_EDIT_KINDS.has(event.kind) && direct) ? beforeTask : null;
            let changes = taskHistoryChanges(previousTask, afterTask, beforeLabels, labels, beforeKnown);
            // Missing provenance is an identity gap, not proof that unchanged
            // data was edited. Keep demonstrable effects with unknown before
            // values, and never manufacture a restore change for a no-op.
            if (event.kind === 'board.restored' && !recovered && beforeTask) changes = changes.filter((change) => !areSerializableValuesEqual(beforeTask[change.field], afterTask[change.field]));
            let eventIncomplete = !beforeKnown || planningGap || creation && HISTORY_FIELDS.some((field) => !Object.hasOwn(afterTask, field));
            if (TASK_EDIT_KINDS.has(event.kind) && direct) {
                for (const field of HISTORY_FIELDS) {
                    const pair = event.changes?.[field];
                    if (!pair) continue;
                    const previous = taskFieldValue(beforeTask, field, beforeLabels);
                    const inconsistent = previous.known && !areSerializableValuesEqual(beforeTask?.[field], pair.before);
                    if (inconsistent) eventIncomplete = true;
                    if (inconsistent || !previous.known && pair.before !== undefined) {
                        // Explicit field pairs can recover values that the
                        // adjacent replay cannot: retain that evidence and flag
                        // a missing transition rather than inventing its before.
                        changes = changes.filter((change) => change.field !== field);
                        if (!areSerializableValuesEqual(pair.before, pair.after)) changes.push({
                            field, before: recordedFieldValue(field, pair.before, beforeLabels), after: recordedFieldValue(field, pair.after, labels)
                        });
                    }
                }
                if (!event.changes) lifecycle.incomplete = true;
            } else if (direct && !creation && !event.kind.startsWith('planner.block.')) {
                lifecycle.incomplete = true;
            }
            if (event.kind === 'roadmap.updated' && !event.snapshot) lifecycle.incomplete = true;
            if (event.kind === 'roadmap.bulk-assigned' && Array.isArray(event.meta?.taskIds) && event.meta.taskIds.some((id) => Number(id) === task.id) && !event.meta.sprint?.id) lifecycle.incomplete = true;
            const previousBlocks = ownedBlocks(beforeFrame, lifecycle);
            const nextBlocks = ownedBlocks(afterFrame, lifecycle);
            if (!areSerializableValuesEqual(previousBlocks, nextBlocks)) {
                changes.push({ field: 'planning', before: beforeKnown && !planningGap ? planningHistoryValue(previousBlocks) : unknownHistoryValue(), after: planningHistoryValue(nextBlocks) });
            }
            if (eventIncomplete) lifecycle.incomplete = true;
            addEntry(event, lifecycle, changes, event.kind, eventIncomplete);
        }

        if (frames.has(event.id)) duplicateIds.add(event.id);
        frames.set(event.id, afterFrame);
    }

    const finalTask = historyTask(state, task.id);
    if (!lifecycle || !finalTask || !matchesHistoryTask(finalTask, { ...task })) return { ...empty(), asOf };
    return {
        entries: entries.filter((item) => item.lifecycle === lifecycle).map((item) => item.entry).reverse(),
        earlierHistoryUnavailable: lifecycle.earlierUnavailable,
        incomplete: lifecycle.incomplete,
        asOf
    };
}
