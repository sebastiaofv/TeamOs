import type { TaskHistoryChange, TaskHistoryEntry, TaskHistoryValue } from '@/domain/taskHistoryTypes';
import type { Language } from '@/shared/types/ui';
import { formatPlannerDateLabel, translate, type TranslationKey } from '@/shared/i18n';
import { formatFileSize } from '@/domain/util';

const FIELD_KEYS: Record<string, TranslationKey> = {
    title: 'task.title', description: 'task.description', assignees: 'task.assignees',
    tags: 'task.tags', blocked: 'task.blocked', blockerReason: 'task.blocker',
    priority: 'task.priority', effort: 'task.effort', status: 'task.status',
    dueDate: 'task.due', phaseId: 'task.phase', milestoneId: 'task.milestone',
    sprintId: 'task.sprint', checklist: 'task.todoList', attachments: 'task.attachments',
    archived: 'taskHistory.archivedField', planning: 'taskHistory.planning', block: 'taskHistory.planning'
};
const KIND_KEYS: Record<string, TranslationKey> = {
    'task.initial': 'taskHistory.initial', 'task.created': 'taskHistory.created',
    'task.deleted': 'taskHistory.deleted', 'task.updated': 'taskHistory.updated',
    'task.status.changed': 'taskHistory.updated', 'task.archived': 'taskHistory.archived',
    'task.restored': 'taskHistory.restored', 'board.restored': 'taskHistory.projectRestored',
    'roadmap.updated': 'taskHistory.roadmap', 'roadmap.bulk-assigned': 'taskHistory.bulkAssigned',
    'planner.block.added': 'taskHistory.planAdded', 'planner.block.moved': 'taskHistory.planMoved',
    'planner.block.resized': 'taskHistory.planResized', 'planner.block.removed': 'taskHistory.planRemoved'
};
const STATUS_KEYS: Record<string, TranslationKey> = {
    backlog: 'board.backlog', 'to-do': 'board.toDo', doing: 'board.doing', done: 'board.done'
};

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : null;
}
function items(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? value.map(record).filter((item) => item !== null) : [];
}
function text(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function taskHistoryFieldLabel(field: string, language: Language): string {
    return FIELD_KEYS[field] ? translate(language, FIELD_KEYS[field]) : translate(language, 'taskHistory.otherChange');
}

export function taskHistoryDate(at: string, language: Language): string {
    const date = new Date(at);
    return Number.isNaN(date.getTime()) ? translate(language, 'taskHistory.unavailable')
        : new Intl.DateTimeFormat(language === 'pt' ? 'pt-PT' : 'en-GB', {
            dateStyle: 'medium', timeStyle: 'short'
        }).format(date);
}

// Summaries use the domain operation and changed fields, never persisted English
// event wording. A multi-field status change remains one grouped action.
export function taskHistoryEntrySummary(entry: TaskHistoryEntry, language: Language): string {
    const operation = translate(language, KIND_KEYS[entry.kind] || 'taskHistory.updated');
    if (entry.kind === 'task.initial') return operation;
    const fields = [...new Set(entry.changes.flatMap((change) => {
        const descriptions = taskHistoryItemChanges(change, language);
        return descriptions.length ? descriptions : [taskHistoryFieldLabel(change.field, language)];
    }))];
    return fields.length ? `${operation}: ${fields.join(', ')}` : operation;
}

export function taskHistoryItemChanges(change: TaskHistoryChange, language: Language): string[] {
    if (!change.before.known || !change.after.known) return [];
    if (change.field !== 'checklist' && change.field !== 'attachments') return [];
    const before = items(change.before.value);
    const after = items(change.after.value);
    const remaining = [...after];
    const messages: string[] = [];
    const attachment = change.field === 'attachments';
    for (const old of before) {
        const index = remaining.findIndex((next) => attachment ? next.id === old.id : next.text === old.text);
        if (index < 0) {
            messages.push(translate(language, attachment ? 'taskHistory.attachmentRemoved' : 'taskHistory.itemRemoved', {
                name: text(attachment ? old.name : old.text)
            }));
            continue;
        }
        const [next] = remaining.splice(index, 1);
        if (!attachment && Boolean(old.done) !== Boolean(next.done)) {
            messages.push(translate(language, next.done ? 'taskHistory.itemCompleted' : 'taskHistory.itemReopened', { name: text(next.text) }));
        } else if (attachment && ['name', 'mime', 'sizeBytes', 'kind', 'createdAt', 'dataUrl'].some((key) => old[key] !== next[key])) {
            messages.push(translate(language, 'taskHistory.attachmentChanged', { name: text(next.name) }));
        }
    }
    for (const next of remaining) {
        messages.push(translate(language, attachment ? 'taskHistory.attachmentAdded' : 'taskHistory.itemAdded', {
            name: text(attachment ? next.name : next.text)
        }));
    }
    return messages;
}

function planningLines(value: unknown, language: Language): string[] {
    const blocks = Array.isArray(value) ? items(value) : [record(value)].filter((item) => item !== null);
    return blocks.map((block) => {
        const start = text(block.start);
        const end = text(block.end);
        const minutes = (time: string) => {
            const [hour, minute] = time.split(':').map(Number);
            return hour * 60 + minute;
        };
        const duration = minutes(end) - minutes(start);
        return `${formatPlannerDateLabel(language, text(block.date))} • ${start}–${end}${Number.isFinite(duration) && duration >= 0
            ? ` • ${translate(language, 'taskHistory.duration', { minutes: duration })}` : ''}`;
    });
}

// Only whitelisted attachment metadata is exposed. Binary content and data URLs
// cannot reach the history's text renderer, including fallback object values.
export function taskHistoryValueLines(field: string, value: TaskHistoryValue, language: Language): string[] {
    if (!value.known) return [translate(language, 'taskHistory.unavailable')];
    if (field === 'status') {
        const status = text(value.value);
        const key = STATUS_KEYS[status];
        const canonical = [status, status === 'doing' ? 'in progress' : '', status === 'to-do' ? 'to do' : ''];
        if (key) canonical.push(translate('en', key).toLowerCase(), translate('pt', key).toLowerCase());
        return [key && (!value.label || canonical.includes(value.label.toLowerCase()))
            ? translate(language, key) : value.label || status || translate(language, 'common.none')];
    }
    if (value.label && ['phaseId', 'milestoneId', 'sprintId'].includes(field)) return [value.label];
    if (field === 'checklist') {
        const lines = items(value.value).map((item) => `${text(item.text)} — ${translate(language, item.done ? 'taskHistory.completed' : 'taskHistory.notCompleted')}`);
        return lines.length ? lines : [translate(language, 'common.none')];
    }
    if (field === 'attachments') {
        const lines = items(value.value).map((item) => [
            text(item.name) || translate(language, 'task.attachments'),
            typeof item.sizeBytes === 'number' ? formatFileSize(item.sizeBytes) : '', text(item.mime)
        ].filter(Boolean).join(' • '));
        return lines.length ? lines : [translate(language, 'common.none')];
    }
    if (field === 'planning' || field === 'block') {
        const lines = planningLines(value.value, language);
        return lines.length ? lines : [translate(language, 'common.none')];
    }
    if (field === 'priority' && ['high', 'medium', 'low'].includes(text(value.value))) {
        const priorities: Record<string, TranslationKey> = { high: 'toolbar.high', medium: 'toolbar.medium', low: 'toolbar.low' };
        return [translate(language, priorities[text(value.value)])];
    }
    if (typeof value.value === 'boolean') return [translate(language, value.value ? 'common.yes' : 'common.no')];
    if (field === 'dueDate' && text(value.value)) return [formatPlannerDateLabel(language, text(value.value))];
    if (Array.isArray(value.value)) {
        const lines = value.value.map(text).filter(Boolean);
        return lines.length ? lines : [translate(language, 'common.none')];
    }
    if (value.value === null || value.value === undefined || value.value === '') return [translate(language, 'common.none')];
    return [text(value.value) || translate(language, 'taskHistory.unavailable')];
}
