import type {
    BoardData,
    ChecklistItem,
    Effort,
    LooseBoardData,
    Priority,
    Task,
    TaskDraft,
    TaskInput,
    TaskStatus
} from './types';
import type { Workflow } from './types';
import type { BlockedFilter } from '@/features/portfolio/types';
import { defaultColumns, isEffort } from './constants';
import { nowIso, normalizeTimestamp, todayLocalIsoDate } from './util';
import { normalizeDueDate } from './calendar';
import { clearInvalidRoadmapTaskRefs, normalizeRoadmapRef } from './roadmap';
import { normalizeTaskAttachments } from './attachments';
import { normalizeAssignee, normalizeAssignees, setTaskResponsible } from './taskAssignments';
import { statusCategory } from './workflow';
export { normalizeAssignee, normalizeAssignees } from './taskAssignments';
export { findTaskInBoardData } from './boardData';

type BoardRecordLike = { data?: BoardData } | null | undefined;

export function parseAssigneesInput(value: unknown): string[] {
    if (Array.isArray(value)) return normalizeAssignees(value);
    if (value === null || value === undefined) return [];
    return normalizeAssignees(String(value).split(/[,\n]+/));
}

export function formatAssignees(value: unknown): string {
    return normalizeAssignees(value).join(', ');
}

export function taskAssignees(task: { assignees?: unknown; assignee?: unknown } | null | undefined): string[] {
    if (Array.isArray(task?.assignees)) return normalizeAssignees(task.assignees);
    return normalizeAssignees(task?.assignee);
}

export function taskHasAssignee(task: { assignees?: unknown; assignee?: unknown } | null | undefined, assigneeName: unknown): boolean {
    const normalized = normalizeAssignee(assigneeName).toLowerCase();
    if (!normalized) return false;
    return taskAssignees(task).some((name) => name.toLowerCase() === normalized);
}

export function normalizeTags(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of input) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim().toLowerCase();
        if (!trimmed) continue;
        if (trimmed.length > 30) continue;
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        result.push(trimmed);
        if (result.length >= 10) break;
    }
    return result;
}

export function buildTaskFieldsFromDraft(draft: TaskDraft) {
    return {
        title: draft.title,
        description: draft.description,
        assignees: draft.assignees,
        responsible: normalizeAssignee(draft.responsible),
        tags: normalizeTags(draft.tags),
        blocked: draft.blocked,
        blockerReason: draft.blocked ? draft.blockerReason : '',
        checklist: draft.checklist,
        dueDate: draft.dueDate,
        priority: draft.priority,
        effort: draft.effort,
        phaseId: draft.phaseId,
        milestoneId: draft.milestoneId
    };
}

export function normalizeBlockerReason(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

export function normalizeChecklist(checklist: unknown): ChecklistItem[] {
    if (!Array.isArray(checklist)) return [];

    return checklist
        .map((item): ChecklistItem | null => {
            if (!item || typeof item.text !== 'string') return null;
            const text = item.text.trim();
            if (!text) return null;
            return { text, done: Boolean(item.done) };
        })
        .filter((item): item is ChecklistItem => item !== null);
}

export function normalizeEffort(value: unknown): Effort | null {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().toUpperCase();
    if (!normalized) return null;
    return isEffort(normalized) ? normalized : null;
}

export function normalizePortfolioBlockedFilter(value: unknown): BlockedFilter {
    return value === 'all' || value === 'blocked' || value === 'unblocked' ? value : 'all';
}

export function normalizePriority(value: unknown): Priority | null {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().toLowerCase();
    return normalized === 'high' || normalized === 'medium' || normalized === 'low' ? normalized : null;
}

export function normalizeTaskBlocked(value: unknown): boolean {
    return value === true;
}

export function parseChecklistInput(value: string): ChecklistItem[] {
    return value
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const checked = /^\[\s*x\s*\]\s*/i.test(line);
            const hasPrefix = /^\[\s*(x)?\s*\]\s*/i.test(line);
            const text = line.replace(/^\[\s*(x)?\s*\]\s*/i, '').trim();
            return { text: hasPrefix ? text : line, done: checked };
        })
        .filter(item => item.text);
}

export function resolveKnownTaskStatus(status: unknown): TaskStatus | null {
    const raw = String(status || '').trim().toLowerCase();
    if (!raw) return null;
    if (raw === 'backlog') return 'backlog';
    if (raw === 'to-do' || raw === 'todo' || raw === 'nextup') return 'to-do';
    if (raw === 'doing' || raw === 'inprogress' || raw === 'in-progress') return 'doing';
    if (raw === 'done' || raw === 'concluid') return 'done';
    return String(status).trim();
}

export function getBoardTagSuggestions(boardData: LooseBoardData | null | undefined): string[] {
    const tasks = (boardData?.board?.tasks || []) as TaskInput[];
    const all = new Set<string>();
    tasks.forEach((task) => {
        ((task.tags || []) as unknown[]).forEach((tag) => {
            if (typeof tag === 'string' && tag.trim()) all.add(tag.trim().toLowerCase());
        });
    });
    return Array.from(all).sort();
}

export function isAcceptedLegacyAssigneeValue(value: unknown): boolean {
    return typeof value === 'string'
        || (Array.isArray(value) && value.every((name) => typeof name === 'string'));
}

export function nextTaskIdForBoard(boardRecord: BoardRecordLike): number {
    const existingIds = (boardRecord?.data?.board?.tasks || [])
        .map(task => Number(task?.id))
        .filter(Number.isFinite);
    return existingIds.length > 0 ? Math.max(...existingIds) + 1 : Date.now();
}

export function touchTask(task: { updatedAt: string }): void {
    task.updatedAt = nowIso();
}

export function getTaskStatusAgeBaseTimestamp(task: TaskInput | null | undefined): string {
    if (!task || typeof task !== 'object') return '';
    return normalizeTimestamp(task.statusChangedAt)
        || normalizeTimestamp(task.updatedAt)
        || normalizeTimestamp(task.createdAt)
        || '';
}

export function isTaskOverdue(task: Pick<Task, 'dueDate' | 'status' | 'archived'>, data?: LooseBoardData): boolean {
    const due = normalizeDueDate(task.dueDate);
    if (!due || ['completed', 'cancelled'].includes(statusCategory(task.status, data)) || task.archived) return false;
    const today = todayLocalIsoDate();
    return due < today;
}

export function normalizeTaskStatus(status: unknown): TaskStatus {
    const normalized = resolveKnownTaskStatus(status);
    if (normalized) return normalized;
    return defaultColumns[0].status;
}

export function formatTaskStatusAge(task: TaskInput | null | undefined): string {
    const base = getTaskStatusAgeBaseTimestamp(task);
    if (!base) return '';
    const diffMs = Math.max(0, Date.now() - new Date(base).getTime());
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;
    if (diffMs < hourMs) return 'Age <1h';
    if (diffMs < dayMs) return `Age ${Math.floor(diffMs / hourMs)}h`;
    return `Age ${Math.floor(diffMs / dayMs)}d`;
}

export function resolveCreateTaskStatus(boardRecord: BoardRecordLike, preferredStatus: unknown): TaskStatus {
    void boardRecord; void preferredStatus;
    return 'backlog';
}

export type NormalizeTaskOptions = {
    workflow?: Workflow;
    fallbackAttachments?: unknown;
    includeStatusChangedAt?: boolean;
    roadmap?: unknown;
};

export function normalizeTask(task: TaskInput, options: NormalizeTaskOptions = {}): Task {
    const fallbackAttachments = Array.isArray(options.fallbackAttachments) ? options.fallbackAttachments : [];
    const includeStatusChangedAt = options.includeStatusChangedAt !== false;
    const normalizedTask: Task = {
        id: task.id as number,
        title: task.title as string,
        description: (task.description || '') as string,
        assignees: taskAssignees(task),
        responsible: normalizeAssignee(task.responsible),
        tags: normalizeTags(task.tags),
        blocked: normalizeTaskBlocked(task.blocked),
        blockerReason: normalizeTaskBlocked(task.blocked) ? normalizeBlockerReason(task.blockerReason) : '',
        checklist: normalizeChecklist(task.checklist),
        attachments: normalizeTaskAttachments(
            Array.isArray(task?.attachments) ? task.attachments : fallbackAttachments
        ),
        archived: Boolean(task.archived),
        createdAt: normalizeTimestamp(task.createdAt) || nowIso(),
        updatedAt: normalizeTimestamp(task.updatedAt) || nowIso(),
        dueDate: normalizeDueDate(task.dueDate),
        priority: normalizePriority(task.priority),
        effort: normalizeEffort(task.effort),
        phaseId: normalizeRoadmapRef(task.phaseId),
        milestoneId: normalizeRoadmapRef(task.milestoneId),
        sprintId: normalizeRoadmapRef(task.sprintId),
        status: options.workflow?.states.some((s) => s.id === task.status) ? String(task.status) : normalizeTaskStatus(task.status)
    };
    if (includeStatusChangedAt) {
        const statusChangedAt = normalizeTimestamp(task.statusChangedAt);
        if (statusChangedAt) {
            normalizedTask.statusChangedAt = statusChangedAt;
        }
    }
    return clearInvalidRoadmapTaskRefs(setTaskResponsible(normalizedTask, task.responsible), options.roadmap);
}
