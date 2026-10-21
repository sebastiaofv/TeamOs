// Editing rules for the task editor draft (Phase 2.1b). Pure: no DOM, no app
// state. The editor components call these and pass the result of buildTaskDraft
// to the store-backed save action. Messages and limits preserve the established
// editor behavior.

import type { Attachment, ChecklistItem, DraftMessage, TaskDraft, TaskEditorFields } from './types';
import {
    ATTACHMENT_MAX_COUNT,
    ATTACHMENT_HARD_MAX_BYTES,
    ATTACHMENT_SOFT_WARN_BYTES,
    ATTACHMENT_TASK_SOFT_TOTAL_BYTES,
    ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES
} from './constants';
import { formatFileSize, nowIso } from './util';
import {
    attachmentDuplicateKey,
    classifyAttachmentKind,
    createAttachmentId,
    estimateAttachmentDataUrlSizeBytes,
    normalizeAttachmentList
} from './attachments';
import {
    normalizeAssignee,
    normalizeBlockerReason,
    normalizeEffort,
    normalizePriority,
    normalizeAssignees,
    normalizeChecklist
} from './task';
import { normalizeDueDate } from './calendar';
import { normalizeRoadmapRef } from './roadmap';
import { translateCurrent } from '@/shared/i18n';
import { setTaskResponsible } from './taskAssignments';
import { parsePullRequestLinks } from './pullRequests';

const TAG_MAX_LENGTH = 30;
const TAG_MAX_COUNT = 10;

// A file chosen in the attachment picker.
export type PickedFile = { name: string; size: number; type: string };

export type AddTagResult = { items: string[]; error?: undefined } | { error: string; items?: undefined };

export function addAssignee(items: string[], name: unknown): string[] {
    const trimmed = normalizeAssignee(name);

    if (!trimmed) return items;
    const key = trimmed.toLowerCase();
    if (items.some((item) => normalizeAssignee(item).toLowerCase() === key)) return items;
    return [...items, trimmed];
}

export function availableAssigneeSuggestions(pool: string[], items: string[]): string[] {
    const taken = new Set(items.map((item) => normalizeAssignee(item).toLowerCase()).filter(Boolean));
    return pool.filter((name) => !taken.has(name.toLowerCase()));
}

export function addTag(items: string[], raw: unknown): AddTagResult {
    const tag = String(raw ?? '').trim().toLowerCase();
    if (!tag) return { items };
    if (tag.length > TAG_MAX_LENGTH) return { error: translateCurrent('messages.tagLength') };
    if (items.includes(tag)) return { error: translateCurrent('messages.tagDuplicate') };
    if (items.length >= TAG_MAX_COUNT) return { error: translateCurrent('messages.tagLimit') };
    return { items: [...items, tag] };
}

export function addChecklistItem(items: ChecklistItem[], text: unknown): ChecklistItem[] {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return items;
    return [...items, { text: trimmed, done: false }];
}

export function moveChecklistItem<T>(items: T[], from: number, to: number, placement: 'before' | 'after' = 'before'): T[] {
    if (!items[from] || !items[to] || from === to) return items;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    let insertIndex = to;
    if (placement === 'after') insertIndex += 1;
    if (from < to) insertIndex -= 1;
    insertIndex = Math.max(0, Math.min(next.length, insertIndex));
    next.splice(insertIndex, 0, moved);
    return next;
}

export async function mergePickedAttachments(existing: readonly unknown[], files: Iterable<PickedFile>, {
    readFile,
    now = nowIso,
    createId = createAttachmentId
}: {
    readFile: (file: PickedFile) => Promise<string>;
    now?: () => string;
    createId?: () => string;
}): Promise<{ attachments: Attachment[]; messages: DraftMessage[] }> {
    const next = normalizeAttachmentList(existing);
    const messages: DraftMessage[] = [];
    const seenKeys = new Set(next.map((item) => attachmentDuplicateKey(item)).filter(Boolean));

    for (const file of files) {
        if (next.length >= ATTACHMENT_MAX_COUNT) {
            messages.push({ type: 'error', text: translateCurrent('messages.attachmentLimit', { count: ATTACHMENT_MAX_COUNT }) });
            break;
        }

        const fileSize = Number(file.size) || 0;
        if (fileSize > ATTACHMENT_HARD_MAX_BYTES) {
            messages.push({ type: 'error', text: translateCurrent('messages.attachmentTooLarge', { name: file.name, size: formatFileSize(ATTACHMENT_HARD_MAX_BYTES) }) });
            continue;
        }

        const duplicateKey = attachmentDuplicateKey({
            name: file.name || 'Attachment',
            mime: file.type || '',
            sizeBytes: fileSize
        });
        if (duplicateKey && seenKeys.has(duplicateKey)) {
            messages.push({ type: 'warning', text: translateCurrent('messages.attachmentDuplicate', { name: file.name }) });
            continue;
        }

        try {
            const dataUrl = await readFile(file);
            next.push({
                id: createId(),
                name: file.name || 'Attachment',
                mime: file.type || '',
                sizeBytes: fileSize || estimateAttachmentDataUrlSizeBytes(dataUrl),
                kind: classifyAttachmentKind(file.type, file.name),
                dataUrl,
                createdAt: now()
            });
            if (duplicateKey) seenKeys.add(duplicateKey);
        } catch (error) {
            messages.push({ type: 'error', text: translateCurrent('messages.attachmentReadFailed', { name: file.name, error: (error as Error).message || 'Failed to read file.' }) });
        }
    }

    return { attachments: next, messages };
}

export function buildAttachmentWarnings(attachments: readonly unknown[], otherAttachmentBytes: unknown): DraftMessage[] {
    const items = normalizeAttachmentList(attachments);
    const messages: DraftMessage[] = [];
    const totalBytes = items.reduce((sum, item) => sum + Math.max(0, Number(item.sizeBytes) || 0), 0);

    items.forEach((item) => {
        if ((Number(item.sizeBytes) || 0) > ATTACHMENT_SOFT_WARN_BYTES) {
            messages.push({
                type: 'warning',
                text: translateCurrent('messages.attachmentLarge', { name: item.name, size: formatFileSize(item.sizeBytes) })
            });
        }
    });

    if (totalBytes > ATTACHMENT_TASK_SOFT_TOTAL_BYTES) {
        messages.push({
            type: 'warning',
            text: translateCurrent('messages.taskAttachmentTotal', { size: formatFileSize(totalBytes) })
        });
    }

    if (typeof otherAttachmentBytes === 'number' && Number.isFinite(otherAttachmentBytes)) {
        const projectEstimate = otherAttachmentBytes + totalBytes;
        if (projectEstimate > ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES) {
            messages.push({
                type: 'warning',
                text: translateCurrent('messages.projectAttachmentTotal', { size: formatFileSize(projectEstimate) })
            });
        }
    }

    return messages;
}

// Normalize the structured React draft without a lossy text conversion.
export function buildTaskDraft(form: TaskEditorFields): TaskDraft {
    return {
        pullRequests: parsePullRequestLinks(form.pullRequests),
        title: String(form.title ?? '').trim(),
        description: String(form.description ?? '').trim(),
        ...setTaskResponsible({ assignees: normalizeAssignees(form.assignees), responsible: '' }, form.responsible),
        tags: form.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean),
        blocked: Boolean(form.blocked),
        blockerReason: normalizeBlockerReason(form.blockerReason),
        checklist: normalizeChecklist(form.checklist),
        attachments: normalizeAttachmentList(form.attachments),
        rawDueDate: String(form.dueDate ?? '').trim(),
        dueDate: normalizeDueDate(form.dueDate),
        priority: normalizePriority(form.priority),
        effort: normalizeEffort(form.effort),
        phaseId: normalizeRoadmapRef(form.phaseId),
        milestoneId: normalizeRoadmapRef(form.milestoneId)
    };
}
