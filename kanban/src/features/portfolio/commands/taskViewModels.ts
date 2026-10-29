import { workitemType, WORKITEM_FIELDS, effectivePlanning } from '@/domain/workitems';
import type {
    BoardRecord,
    PortfolioRow,
    SelectOption,
    TaskDetailViewModel,
    TaskDraft,
    TaskEditorFields,
    TaskEditorViewModel
} from '@/features/portfolio/types';
import type { BoardData, RoadmapItem, Task } from '@/domain/types';
import { ATTACHMENT_HARD_MAX_BYTES, ATTACHMENT_MAX_COUNT, TASK_TITLE_MAX_LENGTH } from '@/domain/constants';
import {
    formatAssignees,
    normalizeAssignees,
    normalizeBlockerReason,
    normalizeChecklist,
    normalizeEffort,
    normalizePriority,
    normalizeTags,
    normalizeTask
} from '@/domain/task';
import {
    createEmptyRoadmapExtension,
    getRoadmapExtension,
    getRoadmapItemTitle,
    normalizeRoadmapRef
} from '@/domain/roadmap';
import {
    calculateBoardAttachmentBytes,
    getTaskAttachments,
    normalizeAttachmentList
} from '@/domain/attachments';
import { createBoardStateSnapshot } from '@/domain/serialize';
import { formatDateTime, formatDueDateForUi, normalizeDueDate } from '@/domain/calendar';
import { formatFileSize } from '@/domain/util';
import { getCurrentLanguage, translateCurrent } from '@/shared/i18n';
import { parsePullRequestLinks, PullRequestLinkError } from '@/domain/pullRequests';
import { getWorkflow } from '@/domain/workflow';
import { projectTaskHistory } from '@/domain/taskHistory';
import { isTaskBlocked } from '@/domain/taskRelations';
import { buildTaskRelationView } from '@/features/portfolio/queries/taskRelationViews';
import { getProjectData } from '@/domain/projectData';

export type TaskFocusField = 'title' | 'blockerReason' | 'dueDate';

export type TaskDetailSource = {
    boardRecord: BoardRecord;
    boardData: BoardData;
    task: Task;
    taskIndex: number;
};

export type TaskDraftValidation =
    | { ok: true }
    | { ok: false; silent: true }
    | { ok: false; silent?: false; message: string; focusField?: TaskFocusField };

export function findPortfolioTaskDetailSource(
    getBoardRecord: (boardId: string) => BoardRecord | null,
    boardId: string,
    taskId: unknown,
    options: { boardData?: unknown } = {}
): TaskDetailSource | null {
    const boardRecord = getBoardRecord(boardId);
    if (!boardRecord) return null;
    const sourceBoardData = options.boardData
        ? createBoardStateSnapshot(options.boardData)
        : boardRecord.data;
    const tasks = sourceBoardData?.board?.tasks;
    if (!Array.isArray(tasks)) return null;
    const normalizedTaskId = Number(taskId);
    const taskIndex = tasks.findIndex((task) => Number(task?.id) === normalizedTaskId);
    if (taskIndex < 0) return null;
    return {
        boardRecord,
        boardData: sourceBoardData,
        task: tasks[taskIndex],
        taskIndex
    };
}

function buildRoadmapEntityOptions(items: RoadmapItem[] | null | undefined): SelectOption[] {
    return (Array.isArray(items) ? items : []).map((item) => ({
        value: item.id,
        label: item.title
    }));
}

export function buildTaskEditorViewModel(
    boardRecord: BoardRecord,
    task: Task | null,
    _portfolioTasks: readonly PortfolioRow[] | null | undefined,
    openId: number,
    options: { taskId?: unknown; preferredDueDate?: string } = {}
): TaskEditorViewModel {
    const roadmap = getRoadmapExtension(boardRecord.data) || createEmptyRoadmapExtension();
    const phaseOptions = buildRoadmapEntityOptions(roadmap.phases.filter((phase) => !roadmap.phases.some((child) => child.parentId === phase.id)));
    const milestoneOptions = buildRoadmapEntityOptions(roadmap.milestones);
    const knownRef = (optionList: SelectOption[], value: unknown) => {
        const ref = normalizeRoadmapRef(value);
        return optionList.some((option) => option.value === ref) ? ref : '';
    };
    const normalized = task ? normalizeTask(task, { workflow: getWorkflow(boardRecord.data, task) }) : null;
    const initial: TaskEditorFields = normalized
        ? {
            title: normalized.title || '',
            pullRequests: parsePullRequestLinks(normalized.pullRequests),
            description: normalized.description || '',
            blocked: Boolean(normalized.blocked),
            blockerReason: normalized.blocked ? normalizeBlockerReason(normalized.blockerReason) : '',
            assignees: normalizeAssignees(normalized.assignees),
            responsible: normalized.responsible,
            tags: normalizeTags(normalized.tags),
            checklist: normalizeChecklist(normalized.checklist),
            attachments: normalizeAttachmentList(getTaskAttachments(boardRecord.data, options.taskId)),
            dueDate: normalizeDueDate(normalized.dueDate) || '',
            priority: normalizePriority(normalized.priority) || '',
            effort: normalizeEffort(normalized.effort) || '',
            phaseId: knownRef(phaseOptions, normalized.phaseId),
            milestoneId: knownRef(milestoneOptions, normalized.milestoneId)
        }
        : {
            title: '',
            pullRequests: [],
            description: '',
            blocked: false,
            blockerReason: '',
            assignees: [],
            responsible: '',
            tags: [],
            checklist: [],
            attachments: [],
            dueDate: normalizeDueDate(options.preferredDueDate || '') || '',
            priority: '',
            effort: '',
            phaseId: '',
            milestoneId: ''
        };
    Object.assign(initial, { type: normalized ? workitemType(normalized) : 'task', parentId: normalized?.parentId ?? null, phaseMode: normalized?.phaseMode || (normalized?.phaseId ? 'explicit' : 'none'), milestoneMode: normalized?.milestoneMode || (normalized?.milestoneId ? 'explicit' : 'none') }, Object.fromEntries(WORKITEM_FIELDS.map((field) => [field, normalized?.[field] || ''])));
    return {
        editing: Boolean(normalized),
        parentCandidates: boardRecord.data.board.tasks.filter((item) => ['epic', 'story'].includes(workitemType(item)) && item.id !== task?.id).map((item) => ({ displayId: item.displayId, id: item.id, title: item.title, type: workitemType(item) })),
        openId,
        heading: normalized ? translateCurrent('task.edit') : translateCurrent('task.new'),
        initial,
        phaseOptions,
        milestoneOptions,
        assigneePool: getProjectData(boardRecord.data).members.map((member) => member.name),
        tagSuggestions: getProjectData(boardRecord.data).tags,
        otherAttachmentBytes: calculateBoardAttachmentBytes(boardRecord.data, {
            excludeTaskId: normalized ? options.taskId : null
        })
    };
}

export function buildTaskDetailViewModel(source: TaskDetailSource, taskId: unknown, readOnly: boolean, historyEventIndex?: number): TaskDetailViewModel {
    const task = normalizeTask(source.task, { workflow: getWorkflow(source.boardData, source.task) });
    const statusMap: Record<string, string> = Object.fromEntries(getWorkflow(source.boardData, task).states.map((state) => [state.id, state.name]));
    const roadmap = getRoadmapExtension(source.boardData);
    return {
        readOnly,
        conversationContext: { boardId: source.boardRecord.id, task: source.task, readOnly, eventIndex: historyEventIndex },
        pullRequestContext: { boardId: source.boardRecord.id, taskId: Number(taskId), links: parsePullRequestLinks(task.pullRequests) },
        history: projectTaskHistory(source.boardRecord.data, source.task, historyEventIndex),
        historyKey: `${source.boardRecord.id}:${taskId}:${historyEventIndex ?? 'current'}`,
        boardId: source.boardRecord.id,
        taskId: task.id,
        sourceBoardData: source.boardData,
        ...buildTaskRelationView(source.boardData, task.id),
        fields: {
            title: task.title || '-',
            description: task.description || '-',
            assignees: formatAssignees(task.assignees) || translateCurrent('task.noParticipants'),
            responsible: task.responsible || translateCurrent('task.noResponsible'),
            tags: normalizeTags(task.tags).join(', ') || '-',
            blocked: isTaskBlocked(source.boardData, task.id) ? translateCurrent('common.yes') : translateCurrent('common.no'),
            blockerReason: task.blocked ? (normalizeBlockerReason(task.blockerReason) || '-') : '-',
            priority: task.priority
                ? ({ high: translateCurrent('toolbar.high'), medium: translateCurrent('toolbar.medium'), low: translateCurrent('toolbar.low') }[task.priority] || task.priority)
                : '-',
            effort: task.effort || '-',
            status: (statusMap[task.status] || task.status) || '-',
            createdAt: formatDateTime(task.createdAt, getCurrentLanguage() === 'pt' ? 'pt-PT' : undefined),
            updatedAt: formatDateTime(task.updatedAt, getCurrentLanguage() === 'pt' ? 'pt-PT' : undefined),
            dueDate: formatDueDateForUi(task.dueDate) || '-',
            phase: getRoadmapItemTitle(roadmap, 'phases', effectivePlanning(source.boardData, task, 'phaseId')) || '-',
            milestone: getRoadmapItemTitle(roadmap, 'milestones', effectivePlanning(source.boardData, task, 'milestoneId')) || '-',
            sprint: getRoadmapItemTitle(roadmap, 'sprints', task.sprintId) || '-'
        },
        checklist: normalizeChecklist(task.checklist)
            .map((item) => ({ text: item.text, done: Boolean(item.done) })),
        attachments: normalizeAttachmentList(getTaskAttachments(source.boardData, taskId))
            .map((item) => ({
                id: item.id,
                name: item.name,
                isImage: item.kind === 'image',
                dataUrl: item.dataUrl,
                subLabel: `${formatFileSize(item.sizeBytes)}${item.mime ? ` • ${item.mime}` : ''}`
            }))
    };
}

export function validateTaskDraft(draft: TaskDraft | null | undefined): TaskDraftValidation {
    try { parsePullRequestLinks(draft?.pullRequests); }
    catch (error) { return { ok: false, message: translateCurrent(`pullRequests.error.${error instanceof PullRequestLinkError ? error.code : 'invalid'}`) }; }
    const attachments = Array.isArray(draft?.attachments) ? draft.attachments : [];
    if (!draft?.title) {
        return { ok: false, silent: true };
    }
    if (draft.title.length > TASK_TITLE_MAX_LENGTH) {
        return {
            ok: false,
            message: translateCurrent('validation.titleLength', { count: TASK_TITLE_MAX_LENGTH }),
            focusField: 'title'
        };
    }
    if (draft.blocked && !draft.blockerReason) {
        return {
            ok: false,
            message: translateCurrent('validation.blockerReason'),
            focusField: 'blockerReason'
        };
    }
    if (draft.rawDueDate && !draft.dueDate) {
        return {
            ok: false,
            message: translateCurrent('validation.dueDate'),
            focusField: 'dueDate'
        };
    }
    if (attachments.length > ATTACHMENT_MAX_COUNT) {
        return {
            ok: false,
            message: translateCurrent('validation.attachmentCount', { count: ATTACHMENT_MAX_COUNT })
        };
    }
    if (attachments.some((item) => (Number(item.sizeBytes) || 0) > ATTACHMENT_HARD_MAX_BYTES)) {
        return {
            ok: false,
            message: translateCurrent('validation.attachmentSize', { size: formatFileSize(ATTACHMENT_HARD_MAX_BYTES) })
        };
    }
    return { ok: true };
}
