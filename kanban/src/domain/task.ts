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
import type { BlockedFilter } from '@/features/portfolio/types';
import { defaultColumns, isEffort } from './constants';
import { nowIso, normalizeTimestamp, todayLocalIsoDate, isRecord } from './util';
import { normalizeDueDate } from './calendar';
import { clearInvalidRoadmapTaskRefs, normalizeRoadmapRef } from './roadmap';
import { normalizeTaskAttachments } from './attachments';
import { getWorkflow, getTaskWorkflow } from './workflow';
export { findTaskInBoardData } from './boardData';

type BoardRecordLike = { data?: BoardData } | null | undefined;

export function normalizeAssignee(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

export function normalizeAssignees(value: unknown): string[] {
    const source = Array.isArray(value) ? value : [value];
    const seen = new Set<string>();
    const names: string[] = [];
    source.forEach((entry) => {
        const name = normalizeAssignee(entry);
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        names.push(name);
    });
    return names;
}

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

export function taskHasAssignee(task: { assignees?: unknown; assignee?: unknown; assigneeId?: string } | null | undefined, assigneeName: unknown): boolean {
    if (task?.assigneeId && task.assigneeId === assigneeName) return true;
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
        ...(draft.assigneeId !== undefined ? { assigneeId: draft.assigneeId } : {}),
        workitemType: draft.workitemType || 'task', parentId: draft.parentId || null,
        acceptanceCriteria: draft.acceptanceCriteria || '', reproductionSteps: draft.reproductionSteps || '', expectedResult: draft.expectedResult || '',
        title: draft.title,
        description: draft.description,
        assignees: draft.assignees,
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
    return null;
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
    const data = boardRecord?.data;
    let highest = 0;
    const reserve = (value: unknown) => {
        const id = Number(value);
        if (Number.isSafeInteger(id) && id > highest) highest = id;
    };
    for (const task of data?.board?.tasks || []) reserve(task.id);
    // Deleted/restored-away workitems still own audit, comment and PR records.
    // Never give their numeric identity to an unrelated new workitem.
    for (const event of data?.extensions?.timeline?.events || []) {
        if (event.entityType === 'task') reserve(event.entityId);
        for (const id of event.meta?.taskIds || []) reserve(id);
        reserve(event.snapshot?.id);
        for (const task of event.snapshot?.board?.tasks || []) reserve(task.id);
    }
    for (const key of ['conversation', 'pullRequests']) {
        const extension = data?.extensions?.[key];
        if (isRecord(extension) && isRecord(extension.byTaskId)) for (const id of Object.keys(extension.byTaskId)) reserve(id);
    }
    if (highest >= Number.MAX_SAFE_INTEGER) throw new Error('Workitem ID range exhausted.');
    return highest ? highest + 1 : Date.now();
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

export function isTaskOverdue(task: Pick<Task, 'dueDate' | 'status' | 'archived' | 'workContext'>, data?: BoardData): boolean {
    const due = normalizeDueDate(task.dueDate);
    const category = data ? getTaskWorkflow(data, task).states.find((state) => state.id === task.status)?.category : task.status === 'done' ? 'completed' : 'not-started';
    if (!due || category === 'completed' || category === 'cancelled' || task.archived) return false;
    const today = todayLocalIsoDate();
    return due < today;
}

export function normalizeTaskStatus(status: unknown, knownStatuses?: ReadonlySet<string>): TaskStatus {
    if (typeof status === 'string' && knownStatuses?.has(status)) return status;
    if (typeof status === 'string' && /^wf_[a-z0-9_-]+$/i.test(status)) return status;
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
    const validStatuses = new Set((boardRecord?.data?.board?.columns || []).map(col => col.status));
    const fallbackStatus = boardRecord?.data ? getWorkflow(boardRecord.data).initialStateId : defaultColumns[0].status;
    const normalizedPreferred = normalizeTaskStatus(preferredStatus, validStatuses);
    return validStatuses.has(normalizedPreferred) ? normalizedPreferred : fallbackStatus;
}

export type NormalizeTaskOptions = {
    knownStatuses?: ReadonlySet<string>;
    fallbackAttachments?: unknown;
    includeStatusChangedAt?: boolean;
    roadmap?: unknown;
};

export function normalizeTask(task: TaskInput, options: NormalizeTaskOptions = {}): Task {
    const fallbackAttachments = Array.isArray(options.fallbackAttachments) ? options.fallbackAttachments : [];
    const includeStatusChangedAt = options.includeStatusChangedAt !== false;
    const normalizedTask: Task = {
        ...(task.workContext === 'maintenance' || task.workContext === 'project' ? { workContext: task.workContext } : {}),
        ...(typeof task.applicationId === 'string' ? { applicationId: task.applicationId } : {}),
        ...(task.maintenanceOrigin && typeof task.maintenanceOrigin === 'object' ? { maintenanceOrigin: task.maintenanceOrigin as Task['maintenanceOrigin'] } : {}),
        ...(typeof task.assigneeId === 'string' ? { assigneeId: task.assigneeId } : {}),
        ...(Array.isArray(task.legacyAssignees) ? { legacyAssignees: task.legacyAssignees.filter((v): v is string => typeof v === 'string') } : {}),
        workitemType: (task.workitemType || 'task') as Task['workitemType'],
        parentId: typeof task.parentId === 'number' ? task.parentId : null,
        acceptanceCriteria: typeof task.acceptanceCriteria === 'string' ? task.acceptanceCriteria : '',
        reproductionSteps: typeof task.reproductionSteps === 'string' ? task.reproductionSteps : '',
        expectedResult: typeof task.expectedResult === 'string' ? task.expectedResult : '',
        id: task.id as number,
        title: task.title as string,
        description: (task.description || '') as string,
        assignees: taskAssignees(task),
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
        status: normalizeTaskStatus(task.status, options.knownStatuses)
    };
    if (includeStatusChangedAt) {
        const statusChangedAt = normalizeTimestamp(task.statusChangedAt);
        if (statusChangedAt) {
            normalizedTask.statusChangedAt = statusChangedAt;
        }
    }
    return clearInvalidRoadmapTaskRefs(normalizedTask, options.roadmap);
}
