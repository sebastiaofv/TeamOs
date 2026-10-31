import type { BoardMutationContext } from './mutationContext';
import { controlRecords, parseProjectControl, saveControlRecord, type ControlRecord } from '@/domain/projectControl';
import { appendTimelineEvent } from '@/domain/timeline';
import { createBoardStateSnapshot } from '@/domain/serialize';
import { validateCommentInput, type CommentInput } from '@/domain/comments';
import { validateCommentImagePixels } from '@/infrastructure/browser/commentImages';
import { nowIso } from '@/domain/util';
import { translateCurrent } from '@/shared/i18n';

export function createProjectControlActions({ runPortfolioBoardMutation, alert }: BoardMutationContext) {
    return {
        setWorkitemControlLinks(boardId: string, taskId: number, ids: string[], author: string) {
            return runPortfolioBoardMutation(boardId, (data) => {
                if (!data.board.tasks.some((task) => task.id === taskId) || ids.some((id) => !controlRecords(data).some((record) => record.id === id))) throw new Error(translateCurrent('control.stale'));
                let changed = false;
                for (const record of controlRecords(data)) {
                    const linked = record.related.workitemIds.includes(taskId), wanted = ids.includes(record.id);
                    if (linked === wanted) continue;
                    saveControlRecord(data, { ...record, related: { ...record.related, workitemIds: wanted ? [...record.related.workitemIds, taskId] : record.related.workitemIds.filter((id) => id !== taskId) } }, author);
                    changed = true;
                }
                if (!changed) return false;
                appendTimelineEvent(data, { kind: 'board.control.associations', entityType: 'board', entityId: String(taskId), summary: `Project Control associations: workitem ${taskId}`, snapshot: createBoardStateSnapshot(data), meta: { author } });
                return true;
            });
        },
        async saveProjectControl(boardId: string, input: ControlRecord, author: string, onApplied?: (record: ControlRecord) => void) {
            let savedRecord: ControlRecord | undefined;
            let unchanged = false;
            const applied = await runPortfolioBoardMutation(boardId, (data) => {
                const before = controlRecords(data).find((record) => record.id === input.id);
                // Do not overwrite an edit made while this form was open (including external reloads).
                if (before && before.updatedAt !== input.updatedAt) throw new Error(translateCurrent('control.stale'));
                const saved = saveControlRecord(data, input, author);
                savedRecord = saved;
                if (saved === before) { unchanged = true; return false; }
                appendTimelineEvent(data, { kind: 'board.control.updated', entityType: 'board', entityId: saved.id,
                    summary: `Project Control: ${saved.id} · ${saved.title}`, snapshot: createBoardStateSnapshot(data), meta: { author, controlId: saved.id } });
                return true;
            }, { onMutated: () => { if (savedRecord) onApplied?.(savedRecord); } });
            if (unchanged && savedRecord) onApplied?.(savedRecord);
            return applied || unchanged;
        },
        async publishControlComment(boardId: string, recordId: string, input: CommentInput, onApplied: () => void) {
            try {
                validateCommentInput(input);
                for (const image of input.images) await validateCommentImagePixels(image);
                return await runPortfolioBoardMutation(boardId, (data) => {
                    const record = controlRecords(data).find((item) => item.id === recordId);
                    if (!record) throw new Error(translateCurrent('control.stale'));
                    if (record.comments.some((comment) => comment.id === input.id)) return false;
                    const at = nowIso();
                    record.comments.push({ id: input.id, at, author: { name: input.author.trim(), kind: 'local' }, text: input.text, images: input.images });
                    record.history.push({ id: crypto.randomUUID(), at, author: input.author.trim(), changes: { comments: { before: record.comments.length - 1, after: record.comments.length } } });
                    parseProjectControl(data.extensions.projectControl);
                    appendTimelineEvent(data, { kind: 'board.control.comment', entityType: 'board', entityId: recordId, summary: `Project Control comment: ${recordId} · ${input.author.trim()}`, snapshot: createBoardStateSnapshot(data), meta: { controlId: recordId, author: input.author.trim() } });
                    return true;
                }, { onMutated: onApplied });
            } catch (error) { await alert(error instanceof Error ? error.message : translateCurrent('control.invalid')); return false; }
        }
    };
}
