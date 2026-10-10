import type { TimelineEvent } from './types';
import { applyTimelineEventToState } from './timeline';
import { normalizeTimelineEvent } from './timelineSchema';
import { normalizeTask } from './task';
import { normalizeRoadmapExtension } from './roadmap';
import { getLegacyTaskAttachmentsFromExtensions } from './attachments';
import { cloneSerializable } from './serializable';
import { isRecord } from './util';
import { HISTORY_FIELDS, historyTask, matchesHistoryTask } from './taskHistoryValues';
import type { HistoryState, HistoryTask } from './taskHistoryValues';

export type TaskLifecycle = { earlierUnavailable: boolean; incomplete: boolean };
export type TaskContinuityFrame = {
    index: number;
    event: TimelineEvent | null;
    state: HistoryState;
    task: HistoryTask | null;
    lifecycle: TaskLifecycle | null;
    recoveredSourceIndex: number | null;
};
export const TASK_EDIT_KINDS = new Set(['task.updated', 'task.status.changed', 'task.archived', 'task.restored']);
type RestoreSource = Pick<TaskContinuityFrame, 'index' | 'task' | 'lifecycle'> & { normalizedTask: HistoryTask | null };

function restoredTaskMatches(source: RestoreSource, restored: HistoryTask | null): boolean {
    if (!source.task || !restored) return !source.task && !restored;
    if (matchesHistoryTask(source.task, restored) && matchesHistoryTask(restored, source.task)) return true;
    // Reconstruction normalizes legacy snapshots. Validate added values against
    // that same normalizer, rather than accepting arbitrary extra task fields.
    if (!source.normalizedTask) return false;
    const normalized = { ...source.normalizedTask };
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
                absenceKnown = false;
            }
        } else {
            const direct = event.entityType === 'task' && Number(event.entityId) === taskId;
            const beforeTask = historyTask(state, taskId);
            if (event.kind === 'board.baseline' && event.snapshot?.board && Array.isArray(event.snapshot.board.tasks)) {
                state = cloneSerializable(event.snapshot) as HistoryState;
                lifecycle = historyTask(state, taskId) ? { earlierUnavailable: true, incomplete: true } : null;
                absenceKnown = true;
            } else {
                if (direct && TASK_EDIT_KINDS.has(event.kind) && !beforeTask && !absenceKnown && event.changes) {
                    const evidence: HistoryTask = { id: taskId };
                    for (const field of HISTORY_FIELDS) {
                        if (event.changes[field]) evidence[field] = cloneSerializable(event.changes[field].before);
                    }
                    state = { ...state, board: { ...state.board, tasks: [...(state.board?.tasks || []), evidence] } };
                    lifecycle = { earlierUnavailable: true, incomplete: true };
                }
                state = applyTimelineEventToState(state, event) || {};
                const afterTask = historyTask(state, taskId);
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
                        if (source.task && afterTask) {
                            // Defaults validate normalization, but do not make
                            // omitted historical fields known or edited.
                            for (const field of HISTORY_FIELDS) {
                                if (!Object.hasOwn(source.task, field)) delete afterTask[field];
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
        const frame: TaskContinuityFrame = { index, event, state, task: historyTask(state, taskId), lifecycle, recoveredSourceIndex };
        if (event) {
            if (frames.has(event.id)) duplicateIds.add(event.id);
            // Retain only task-local proof, not a full project state per event.
            const normalizedTask = frame.task ? { ...normalizeTask(frame.task, {
                fallbackAttachments: getLegacyTaskAttachmentsFromExtensions(state, taskId),
                includeStatusChangedAt: false,
                roadmap: normalizeRoadmapExtension(state.extensions?.roadmap)
            }) } : null;
            frames.set(event.id, { index, task: frame.task, lifecycle, normalizedTask });
        }
        yield frame;
    }
}
