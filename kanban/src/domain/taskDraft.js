// Editing rules for the task editor draft (Phase 2.1b). Pure: no DOM, no app
// state. The editor components call these; legacy saveTask receives the result
// of buildTaskDraft. Messages and limits reproduce the legacy editor exactly.

import {
    ATTACHMENT_MAX_COUNT,
    ATTACHMENT_HARD_MAX_BYTES,
    ATTACHMENT_SOFT_WARN_BYTES,
    ATTACHMENT_TASK_SOFT_TOTAL_BYTES,
    ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES
} from './constants.js';
import { assigneesToInput, checklistToInput, formatFileSize, nowIso, readFileAsDataUrl } from './util.js';
import {
    attachmentDuplicateKey,
    classifyAttachmentKind,
    createAttachmentId,
    estimateAttachmentDataUrlSizeBytes,
    normalizeAttachmentRecord
} from './attachments.js';
import {
    normalizeAssignee,
    normalizeBlockerReason,
    normalizeEffort,
    normalizePriority,
    parseAssigneesInput,
    parseChecklistInput
} from './task.js';
import { normalizeDueDate } from './calendar.js';
import { normalizeRoadmapRef } from './roadmap.js';

const TAG_MAX_LENGTH = 30;
const TAG_MAX_COUNT = 10;

export function addAssignee(items, name) {
    const trimmed = normalizeAssignee(name);

    if (!trimmed) return items;
    const key = trimmed.toLowerCase();
    if (items.some((item) => normalizeAssignee(item).toLowerCase() === key)) return items;
    return [...items, trimmed];
}

export function availableAssigneeSuggestions(pool, items) {
    const taken = new Set(items.map((item) => normalizeAssignee(item).toLowerCase()).filter(Boolean));
    return pool.filter((name) => !taken.has(name.toLowerCase()));
}

export function addTag(items, raw) {
    const tag = String(raw ?? '').trim().toLowerCase();
    if (!tag) return { items };
    if (tag.length > TAG_MAX_LENGTH) return { error: 'Tags must be 30 characters or fewer.' };
    if (items.includes(tag)) return { error: 'This tag is already added.' };
    if (items.length >= TAG_MAX_COUNT) return { error: 'A task can have at most 10 tags.' };
    return { items: [...items, tag] };
}

export function addChecklistItem(items, text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return items;
    return [...items, { text: trimmed, done: false }];
}

export function moveChecklistItem(items, from, to, placement = 'before') {
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

export async function mergePickedAttachments(existing, files, {
    readFile = readFileAsDataUrl,
    now = nowIso,
    createId = createAttachmentId
} = {}) {
    const next = existing.map(normalizeAttachmentRecord).filter(Boolean);
    const messages = [];
    const seenKeys = new Set(next.map((item) => attachmentDuplicateKey(item)).filter(Boolean));

    for (const file of files) {
        if (next.length >= ATTACHMENT_MAX_COUNT) {
            messages.push({ type: 'error', text: `Attachment limit reached (${ATTACHMENT_MAX_COUNT} per task).` });
            break;
        }

        const fileSize = Number(file.size) || 0;
        if (fileSize > ATTACHMENT_HARD_MAX_BYTES) {
            messages.push({ type: 'error', text: `${file.name} exceeds the ${formatFileSize(ATTACHMENT_HARD_MAX_BYTES)} limit.` });
            continue;
        }

        const duplicateKey = attachmentDuplicateKey({
            name: file.name || 'Attachment',
            mime: file.type || '',
            sizeBytes: fileSize
        });
        if (duplicateKey && seenKeys.has(duplicateKey)) {
            messages.push({ type: 'warning', text: `${file.name} is already attached and was skipped.` });
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
            messages.push({ type: 'error', text: `${file.name}: ${error.message || 'Failed to read file.'}` });
        }
    }

    return { attachments: next, messages };
}

export function buildAttachmentWarnings(attachments, otherAttachmentBytes) {
    const items = attachments.map(normalizeAttachmentRecord).filter(Boolean);
    const messages = [];
    const totalBytes = items.reduce((sum, item) => sum + Math.max(0, Number(item.sizeBytes) || 0), 0);

    items.forEach((item) => {
        if ((Number(item.sizeBytes) || 0) > ATTACHMENT_SOFT_WARN_BYTES) {
            messages.push({
                type: 'warning',
                text: `${item.name} is large (${formatFileSize(item.sizeBytes)}). Embedded files can slow saves.`
            });
        }
    });

    if (totalBytes > ATTACHMENT_TASK_SOFT_TOTAL_BYTES) {
        messages.push({
            type: 'warning',
            text: `This task has ${formatFileSize(totalBytes)} of attachments. Saving may feel slower.`
        });
    }

    if (Number.isFinite(otherAttachmentBytes)) {
        const projectEstimate = otherAttachmentBytes + totalBytes;
        if (projectEstimate > ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES) {
            messages.push({
                type: 'warning',
                text: `This project is estimated at ${formatFileSize(projectEstimate)} of embedded attachments.`
            });
        }
    }

    return messages;
}

// Same shape and normalisation as legacy readTaskDraftFromForm, including its
// round-trip of assignees and checklist items through their text encodings.
export function buildTaskDraft(form) {
    return {
        title: String(form.title ?? '').trim(),
        description: String(form.description ?? '').trim(),
        assignees: parseAssigneesInput(assigneesToInput(form.assignees)),
        tags: form.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean),
        blocked: Boolean(form.blocked),
        blockerReason: normalizeBlockerReason(form.blockerReason),
        checklist: parseChecklistInput(checklistToInput(form.checklist)),
        attachments: form.attachments.map(normalizeAttachmentRecord).filter(Boolean),
        rawDueDate: String(form.dueDate ?? '').trim(),
        dueDate: normalizeDueDate(form.dueDate),
        priority: normalizePriority(form.priority),
        effort: normalizeEffort(form.effort),
        phaseId: normalizeRoadmapRef(form.phaseId),
        milestoneId: normalizeRoadmapRef(form.milestoneId)
    };
}
