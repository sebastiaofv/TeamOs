import type { BoardData, DayPlanBlock, Task, TimelineEvent } from './types';
import type { TaskHistory, TaskHistoryChange, TaskHistoryEntry } from './taskHistoryTypes';
import { normalizeTimelineEvent } from './timelineSchema';
import { TIMELINE_VERSION } from './constants';
import { getDayPlannerBlocks, normalizeDayPlannerBlock } from './dayPlanner';
import { areSerializableValuesEqual } from './serializable';
import { isRecord } from './util';
import {
    HISTORY_FIELDS, effectiveHistoryTask, historyLabelState, matchesHistoryTask, planningHistoryValue, recordedFieldValue,
    taskFieldValue, taskHistoryChanges, unknownHistoryValue
} from './taskHistoryValues';
import type { HistoryState, HistoryTask } from './taskHistoryValues';
import { replayTaskContinuity, TASK_EDIT_KINDS } from './taskContinuity';
import type { TaskLifecycle } from './taskContinuity';

type Lifecycle = TaskLifecycle;
type Frame = {
    task: HistoryTask | null;
    lifecycle: Lifecycle | null;
    blocks: DayPlanBlock[];
    owners: Map<string, Lifecycle | null>;
    labels: HistoryState;
};
type OwnedEntry = { lifecycle: Lifecycle; entry: TaskHistoryEntry };

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
    let finalTask: HistoryTask | null = null;
    let labels: HistoryState = {};
    let lifecycle: Lifecycle | null = null;
    let owners = new Map<string, Lifecycle | null>();
    // Keep tombstones as well as live ownership: a late move of a removed
    // orphan is not proof that it belongs to the replacement task.
    const knownBlockOwners = new Map<string, Lifecycle | null>();
    let previousTask: HistoryTask | null = null;
    let previousEffectiveTask: HistoryTask | null = null;
    let previousBlocks: DayPlanBlock[] = [];
    const frames = new Map<number, Frame>();
    const entries: OwnedEntry[] = [];

    const addEntry = (event: TimelineEvent, owner: Lifecycle, changes: TaskHistoryChange[], kind = event.kind, incomplete = false) => {
        if (!changes.length && kind !== 'task.created' && kind !== 'task.deleted') return;
        const missing = incomplete || changes.some((change) => !change.before.known || !change.after.known);
        if (missing) owner.incomplete = true;
        entries.push({ lifecycle: owner, entry: { id: event.id, at: event.at, kind, changes, incomplete: missing } });
    };

    for (const frame of replayTaskContinuity(rawEvents, task.id, limit)) {
        const { index, event, state } = frame;
        const rawEvent = rawEvents[index];
        if (!event) {
            lifecycle = frame.lifecycle;
            previousTask = frame.evidenceTask;
            previousEffectiveTask = frame.effectiveTask;
            finalTask = frame.evidenceTask;
            if (lifecycle && couldAffectTask(rawEvent, task.id)) lifecycle.incomplete = true;
            continue;
        }
        const beforeLabels = labels;
        const beforeTask = previousTask;
        const beforeEffectiveTask = previousEffectiveTask;
        const beforeLifecycle = lifecycle;
        const beforeFrame: Frame = { task: beforeTask, lifecycle, blocks: previousBlocks, owners, labels };
        const direct = event.entityType === 'task' && Number(event.entityId) === task.id;
        const baseline = event.kind === 'board.baseline' && Boolean(event.snapshot?.board && Array.isArray(event.snapshot.board.tasks));

        lifecycle = frame.lifecycle;
        const afterTask = frame.evidenceTask;
        const blocks = getDayPlannerBlocks(state).filter((block) => block.taskId === task.id);
        const nextOwners = new Map<string, Lifecycle | null>();
        const source = frame.recoveredSourceIndex === null ? undefined : frames.get(frame.recoveredSourceIndex);
        const recovered = source && source.lifecycle === lifecycle && source.task && afterTask;
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
            let changes = taskHistoryChanges(previousTask, afterTask, beforeLabels, labels, beforeKnown,
                { before: previousTask ? beforeEffectiveTask : null, after: frame.effectiveTask });
            // Missing provenance is an identity gap, not proof that unchanged
            // data was edited. Keep demonstrable effects with unknown before
            // values, and never manufacture a restore change for a no-op.
            if (event.kind === 'board.restored' && !recovered && beforeEffectiveTask && frame.effectiveTask) changes = changes.filter((change) => !areSerializableValuesEqual(beforeEffectiveTask[change.field], frame.effectiveTask?.[change.field]));
            let eventIncomplete = !beforeKnown || planningGap || creation && HISTORY_FIELDS.some((field) => !Object.hasOwn(afterTask, field));
            if (TASK_EDIT_KINDS.has(event.kind) && direct) {
                const recordedBefore = { ...frame.task };
                const recordedAfter = { ...frame.task };
                for (const field of HISTORY_FIELDS) {
                    const pair = event.changes?.[field];
                    if (!pair) continue;
                    recordedBefore[field] = pair.before;
                    recordedAfter[field] = pair.after;
                }
                const effectiveBefore = effectiveHistoryTask(recordedBefore, state);
                const effectiveAfter = effectiveHistoryTask(recordedAfter, state);
                for (const field of HISTORY_FIELDS) {
                    const pair = event.changes?.[field];
                    if (!pair) continue;
                    const previous = taskFieldValue(beforeTask, field, beforeLabels, sameLifecycle);
                    const inconsistent = previous.known && !areSerializableValuesEqual(beforeEffectiveTask?.[field], effectiveBefore?.[field]);
                    if (inconsistent) eventIncomplete = true;
                    if (inconsistent || !previous.known || !areSerializableValuesEqual(beforeTask?.[field], pair.before)) {
                        // Explicit field pairs can recover values that the
                        // adjacent replay cannot: retain that evidence and flag
                        // a missing transition rather than inventing its before.
                        changes = changes.filter((change) => change.field !== field);
                        if (!areSerializableValuesEqual(effectiveBefore?.[field], effectiveAfter?.[field])) changes.push({
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

        frames.set(index, afterFrame);
        previousTask = afterTask;
        previousEffectiveTask = frame.effectiveTask;
        previousBlocks = blocks;
        finalTask = afterTask;
    }

    if (!lifecycle || !finalTask || !matchesHistoryTask(finalTask, { ...task }, previousEffectiveTask || finalTask)) return { ...empty(), asOf };
    return {
        entries: entries.filter((item) => item.lifecycle === lifecycle).map((item) => item.entry).reverse(),
        earlierHistoryUnavailable: lifecycle.earlierUnavailable,
        incomplete: lifecycle.incomplete,
        asOf
    };
}
