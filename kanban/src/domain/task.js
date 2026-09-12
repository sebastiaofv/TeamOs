import { EFFORT_BUCKETS, defaultColumns } from './constants.js';
import { nowIso, normalizeTimestamp } from './util.js';
import { normalizeDueDate, todayLocalIsoDate } from './calendar.js';
import { clearInvalidRoadmapTaskRefs, getRoadmapTaskFieldTasks, normalizeRoadmapRef } from './roadmap.js';
import { normalizeTaskAttachments } from './attachments.js';

export function normalizeAssignee(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

export function normalizeAssignees(value) {
    const source = Array.isArray(value) ? value : [value];
    const seen = new Set();
    const names = [];
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

export function parseAssigneesInput(value) {
    if (Array.isArray(value)) return normalizeAssignees(value);
    if (value === null || value === undefined) return [];
    return normalizeAssignees(String(value).split(/[,\n]+/));
}

export function formatAssignees(value) {
    return normalizeAssignees(value).join(', ');
}

export function taskAssignees(task) {
    if (Array.isArray(task?.assignees)) return normalizeAssignees(task.assignees);
    return normalizeAssignees(task?.assignee);
}

export function taskHasAssignee(task, assigneeName) {
    const normalized = normalizeAssignee(assigneeName).toLowerCase();
    if (!normalized) return false;
    return taskAssignees(task).some((name) => name.toLowerCase() === normalized);
}

export function normalizeTags(input) {
    if (!Array.isArray(input)) return [];
    const seen = new Set();
    const result = [];
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

export function buildTaskFieldsFromDraft(draft) {
    return {
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

export function normalizeBlockerReason(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

export function normalizeChecklist(checklist) {
    if (!Array.isArray(checklist)) return [];

    return checklist
        .map(item => {
            if (!item || typeof item.text !== 'string') return null;
            const text = item.text.trim();
            if (!text) return null;
            return { text, done: Boolean(item.done) };
        })
        .filter(Boolean);
}

export function normalizeEffort(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().toUpperCase();
    if (!normalized) return null;
    return EFFORT_BUCKETS.includes(normalized) ? normalized : null;
}

export function normalizePortfolioBlockedFilter(value) {
    return ['all', 'blocked', 'unblocked'].includes(value) ? value : 'all';
}

export function normalizePriority(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().toLowerCase();
    return ['high', 'medium', 'low'].includes(normalized) ? normalized : null;
}

export function normalizeTaskBlocked(value) {
    return value === true;
}

export function parseChecklistInput(value) {
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

export function resolveKnownTaskStatus(status) {
    const raw = String(status || '').trim().toLowerCase();
    if (!raw) return null;
    if (raw === 'backlog') return 'backlog';
    if (raw === 'to-do' || raw === 'todo' || raw === 'nextup') return 'to-do';
    if (raw === 'doing' || raw === 'inprogress' || raw === 'in-progress') return 'doing';
    if (raw === 'done' || raw === 'concluid') return 'done';
    return null;
}

export function findTaskInBoardData(boardData, taskId) {
    if (taskId === null || taskId === undefined || taskId === '') return null;
    const taskIdNum = Number(taskId);
    const taskList = boardData?.board?.tasks;
    if (!Array.isArray(taskList)) return null;
    return taskList.find((task) => task && Number(task.id) === taskIdNum) || null;
}

export function getBoardTagSuggestions(boardData) {
    const tasks = boardData?.board?.tasks || [];
    const all = new Set();
    tasks.forEach((task) => {
        (task.tags || []).forEach((tag) => {
            if (typeof tag === 'string' && tag.trim()) all.add(tag.trim().toLowerCase());
        });
    });
    return Array.from(all).sort();
}

export function getTaskChecklistDropPlacement(row, clientY) {
    const rect = row?.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(rect.top) || !Number.isFinite(rect.height)) return 'after';
    return clientY < (rect.top + (rect.height / 2)) ? 'before' : 'after';
}

export function isAcceptedLegacyAssigneeValue(value) {
    return typeof value === 'string'
        || (Array.isArray(value) && value.every((name) => typeof name === 'string'));
}

export function nextTaskIdForBoard(boardRecord) {
    const existingIds = (boardRecord?.data?.board?.tasks || [])
        .map(task => Number(task?.id))
        .filter(Number.isFinite);
    return existingIds.length > 0 ? Math.max(...existingIds) + 1 : Date.now();
}

export function touchTask(task) {
    task.updatedAt = nowIso();
}

export function getTaskStatusAgeBaseTimestamp(task) {
    if (!task || typeof task !== 'object') return '';
    return normalizeTimestamp(task.statusChangedAt)
        || normalizeTimestamp(task.updatedAt)
        || normalizeTimestamp(task.createdAt)
        || '';
}

export function isTaskOverdue(task) {
    const due = normalizeDueDate(task.dueDate);
    if (!due || task.status === 'done' || task.archived) return false;
    const today = todayLocalIsoDate();
    return due < today;
}

export function normalizeTaskStatus(status) {
    const normalized = resolveKnownTaskStatus(status);
    if (normalized) return normalized;
    return defaultColumns[0].status;
}

export function formatTaskStatusAge(task) {
    const base = getTaskStatusAgeBaseTimestamp(task);
    if (!base) return '';
    const diffMs = Math.max(0, Date.now() - new Date(base).getTime());
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;
    if (diffMs < hourMs) return 'Age <1h';
    if (diffMs < dayMs) return `Age ${Math.floor(diffMs / hourMs)}h`;
    return `Age ${Math.floor(diffMs / dayMs)}d`;
}

export function getTasksForMilestone(boardData, milestoneId) {
    return getRoadmapTaskFieldTasks(boardData, 'milestoneId', milestoneId);
}

export function getTasksForPhase(boardData, phaseId) {
    return getRoadmapTaskFieldTasks(boardData, 'phaseId', phaseId);
}

export function getTasksForSprint(boardData, sprintId) {
    return getRoadmapTaskFieldTasks(boardData, 'sprintId', sprintId);
}

export function resolveCreateTaskStatus(boardRecord, preferredStatus) {
    const validStatuses = new Set((boardRecord?.data?.board?.columns || []).map(col => normalizeTaskStatus(col.status)));
    const fallbackStatus = normalizeTaskStatus((boardRecord?.data?.board?.columns || [defaultColumns[0]])[0]?.status);
    const normalizedPreferred = normalizeTaskStatus(preferredStatus);
    return validStatuses.has(normalizedPreferred) ? normalizedPreferred : fallbackStatus;
}

export function normalizeTask(task, options = {}) {
    const fallbackAttachments = Array.isArray(options.fallbackAttachments) ? options.fallbackAttachments : [];
    const includeStatusChangedAt = options.includeStatusChangedAt !== false;
    const normalizedTask = {
        id: task.id,
        title: task.title,
        description: task.description || '',
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
        status: normalizeTaskStatus(task.status)
    };
    if (includeStatusChangedAt) {
        const statusChangedAt = normalizeTimestamp(task.statusChangedAt);
        if (statusChangedAt) {
            normalizedTask.statusChangedAt = statusChangedAt;
        }
    }
    return clearInvalidRoadmapTaskRefs(normalizedTask, options.roadmap);
}
