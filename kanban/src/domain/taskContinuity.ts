import type { TimelineEvent } from './types';
import { applyTimelineEventToState } from './timeline';
import { normalizeTimelineEvent } from './timelineSchema';
import { areSerializableValuesEqual, cloneSerializable } from './serializable';
import { isRecord } from './util';
import { HISTORY_FIELDS, effectiveHistoryTask, historyTask, matchesHistoryTask } from './taskHistoryValues';
import type { HistoryState, HistoryTask } from './taskHistoryValues';

export type TaskLifecycle = { earlierUnavailable: boolean; incomplete: boolean };
export type TaskContinuityFrame = {
    index: number;
    event: TimelineEvent | null;
    state: HistoryState;
    // Actual replay data stays intact, including defaults in restored snapshots.
    task: HistoryTask | null;
    // Normalized comparison/proof values are never displayed as evidence.
    effectiveTask: HistoryTask | null;
    // Own fields identify values the history can honestly present as known.
    evidenceTask: HistoryTask | null;
    lifecycle: TaskLifecycle | null;
    recoveredSourceIndex: number | null;
};
export const TASK_EDIT_KINDS = new Set(['task.updated', 'task.status.changed', 'task.archived', 'task.restored']);
type RestoreSource = Pick<TaskContinuityFrame, 'index' | 'task' | 'effectiveTask' | 'evidenceTask' | 'lifecycle'>;

function restoredTaskMatches(source: RestoreSource, restored: HistoryTask | null): boolean {
    if (!source.task || !restored) return !source.task && !restored;
    if (matchesHistoryTask(source.task, restored) && matchesHistoryTask(restored, source.task)) return true;
    // Reconstruction normalizes legacy snapshots. Validate added values against
    // that same normalizer, rather than accepting arbitrary extra task fields.
    if (!source.effectiveTask) return false;
    const normalized = { ...source.effectiveTask };
    const candidate = { ...restored };
    if (!source.task.createdAt) {
        delete normalized.createdAt;
        delete candidate.createdAt;
    }
    return matchesHistoryTask(normalized, candidate) && matchesHistoryTask(candidate, normalized);
}

/** Project-local identity evidence, shared by history and an already-open detail.
 * Each creation opens a new lifecycle; only a unique, validated prior restore
 * source can recover one. Timestamps never establish identity on their own.
 */
export function* replayTaskContinuity(rawEvents: readonly unknown[], taskId: number, limit = rawEvents.length - 1): Generator<TaskContinuityFrame> {
    let state: HistoryState = {};
    let lifecycle: TaskLifecycle | null = null;
    let evidenceTask: HistoryTask | null = null;
    let absenceKnown = false;
    const frames = new Map<string, RestoreSource>();
    const duplicateIds = new Set<string>();

    for (let index = 0; index <= limit; index += 1) {
        const raw = rawEvents[index];
        const event = normalizeTimelineEvent(raw);
        let recoveredSourceIndex: number | null = null;
        if (!event) {
            if (isRecord(raw) && (raw.kind === 'board.restored' || (Number(raw.entityId) === taskId && ['task.created', 'task.deleted'].includes(String(raw.kind))))) {
                state = { ...state, board: { ...state.board, tasks: state.board?.tasks?.filter((item) => Number(item.id) !== taskId) } };
                lifecycle = null;
                evidenceTask = null;
                absenceKnown = false;
            }
        } else {
            const direct = event.entityType === 'task' && Number(event.entityId) === taskId;
            const beforeTask = historyTask(state, taskId);
            if (event.kind === 'board.baseline' && event.snapshot?.board && Array.isArray(event.snapshot.board.tasks)) {
                state = cloneSerializable(event.snapshot) as HistoryState;
                evidenceTask = historyTask(state, taskId);
                lifecycle = historyTask(state, taskId) ? { earlierUnavailable: true, incomplete: true } : null;
                absenceKnown = true;
            } else {
                if (direct && TASK_EDIT_KINDS.has(event.kind) && !beforeTask && !absenceKnown && event.changes) {
                    const evidence: HistoryTask = { id: taskId };
                    for (const field of HISTORY_FIELDS) {
                        if (event.changes[field]) evidence[field] = cloneSerializable(event.changes[field].before);
                    }
                    state = { ...state, board: { ...state.board, tasks: [...(state.board?.tasks || []), evidence] } };
                    evidenceTask = evidence;
                    lifecycle = { earlierUnavailable: true, incomplete: true };
                }
                state = applyTimelineEventToState(state, event) || {};
                const afterTask = historyTask(state, taskId);
                // Replay keeps actual fields intact. This separate record carries
                // only evidence already observed or changed by this action.
                const previousEvidence = evidenceTask;
                evidenceTask = afterTask ? { ...afterTask } : null;
                if (evidenceTask && !event.snapshot) {
                    for (const field of HISTORY_FIELDS) {
                        const recorded = direct && Boolean(event.changes?.[field]);
                        if (!recorded && areSerializableValuesEqual(beforeTask?.[field], afterTask?.[field])) {
                            if (!Object.hasOwn(previousEvidence || {}, field)) delete evidenceTask[field];
                            else if (!Object.hasOwn(evidenceTask, field)) evidenceTask[field] = previousEvidence?.[field];
                        }
                    }
                }
                if (direct && event.kind === 'task.created') {
                    lifecycle = afterTask && event.snapshot ? { earlierUnavailable: false, incomplete: false } : null;
                    absenceKnown = Boolean(event.snapshot);
                } else if (direct && event.kind === 'task.deleted') {
                    lifecycle = null;
                    absenceKnown = true;
                } else if (event.kind === 'board.restored') {
                    const sourceId = event.meta?.fromEventId || '';
                    const source = duplicateIds.has(sourceId) ? undefined : frames.get(sourceId);
                    const proven = event.snapshot?.board && source && restoredTaskMatches(source, afterTask);
                    lifecycle = proven ? source.lifecycle : afterTask && event.snapshot?.board ? { earlierUnavailable: true, incomplete: true } : null;
                    absenceKnown = Boolean(event.snapshot?.board);
                    if (proven) {
                        recoveredSourceIndex = source.index;
                        if (source.evidenceTask && evidenceTask) {
                            // Defaults validate normalization, but do not make
                            // omitted historical fields known or edited.
                            for (const field of HISTORY_FIELDS) {
                                if (!Object.hasOwn(source.evidenceTask, field)) delete evidenceTask[field];
                            }
                        }
                    }
                } else if (event.kind === 'roadmap.updated' && event.snapshot?.board) {
                    if (!afterTask) lifecycle = null;
                    else if (!beforeTask || (beforeTask.createdAt && afterTask.createdAt && beforeTask.createdAt !== afterTask.createdAt)) lifecycle = { earlierUnavailable: true, incomplete: true };
                    absenceKnown = true;
                }
            }
        }
        const task = historyTask(state, taskId);
        // Normalized values are used for business no-op comparisons and restore
        // proof only. They never supply a displayed value missing from evidence.
        const effectiveTask = effectiveHistoryTask(task, state);
        const frame: TaskContinuityFrame = { index, event, state, task, effectiveTask, evidenceTask, lifecycle, recoveredSourceIndex };
        if (event) {
            if (frames.has(event.id)) duplicateIds.add(event.id);
            // Retain only task-local proof, not a full project state per event.
            frames.set(event.id, { index, task, effectiveTask, evidenceTask, lifecycle });
        }
        yield frame;
    }
}
