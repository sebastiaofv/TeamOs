// Task editing, details, validation, and undo.

import type {
    BoardData,
    BoardRecord,
    RoadmapItem,
    SelectOption,
    Task,
    TaskDetailViewModel,
    TaskDraft,
    TaskEditorFields,
    TaskEditorViewModel
} from '../types';
import type { BoardMutationContext } from './boardMutationContext';
import type { BoardInteractions } from './boardInteractions';
import { ATTACHMENT_HARD_MAX_BYTES, ATTACHMENT_MAX_COUNT, TASK_TITLE_MAX_LENGTH, defaultColumns } from '../domain/constants';
import {
    buildTaskFieldsFromDraft,
    formatAssignees,
    nextTaskIdForBoard,
    normalizeAssignee,
    normalizeAssignees,
    normalizeBlockerReason,
    normalizeChecklist,
    normalizeEffort,
    normalizePriority,
    normalizeTags,
    getBoardTagSuggestions,
    normalizeTask,
    normalizeTaskStatus,
    resolveCreateTaskStatus,
    taskAssignees,
} from '../domain/task';
import {
    createEmptyRoadmapExtension,
    getRoadmapExtension,
    getRoadmapItemTitle,
    normalizeRoadmapRef,
} from '../domain/roadmap';
import {
    calculateBoardAttachmentBytes,
    getTaskAttachments,
    normalizeAttachmentList,
    removeLegacyTaskAttachmentsFromExtensions,
    setTaskAttachments,
} from '../domain/attachments';
import { createBoardStateSnapshot } from '../domain/serialize';
import { captureTaskTimelineSnapshot, recordTaskTimelineEvent } from '../domain/timeline';
import { formatDateTime, formatDueDateForUi, normalizeDueDate } from '../domain/calendar';
import { formatFileSize, nowIso } from '../domain/util';

import { getSelectedPortfolioTimelineView } from '../selectors/portfolioViews';

export type TaskFocusField = 'title' | 'blockerReason' | 'dueDate';

type TaskDetailSource = { boardRecord: BoardRecord; boardData: BoardData; task: Task; taskIndex: number };

type TaskDraftValidation =
    | { ok: true }
    | { ok: false; silent: true }
    | { ok: false; silent?: false; message: string; focusField?: TaskFocusField };

export function createTaskActions({ getState, commitState, getBoardRecord, findPortfolioTaskSource, canUsePortfolioTaskMutations,
    notifyPortfolioMutationUnavailable, isPortfolioBoardMutable, runPortfolioBoardMutation, runPortfolioTaskMutation,
    alert, confirm, closeDialogFn, openDialogFn }: BoardMutationContext,
{ setSelectedPortfolioCard, setSelectedPortfolioBoardId }: Pick<BoardInteractions, 'setSelectedPortfolioCard' | 'setSelectedPortfolioBoardId'>) {
    let taskEditorOpenCount = 0;
    let undoTimer: ReturnType<typeof setTimeout> | null = null;

    function findPortfolioTaskDetailSource(boardId: string, taskId: unknown, options: { boardData?: unknown } = {}): TaskDetailSource | null {
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

    function getTaskAssigneeSuggestions(excludeNames: string[] = []): string[] {
        const seen = new Set<string>();
        const excluded = new Set(normalizeAssignees(excludeNames).map((name) => name.toLowerCase()));
        const values: string[] = [];
        const addName = (value: unknown) => {
            const name = normalizeAssignee(value);
            if (!name || excluded.has(name.toLowerCase()) || seen.has(name.toLowerCase())) return;
            seen.add(name.toLowerCase());
            values.push(name);
        };
        (getState().portfolioTasks || []).forEach((item) => taskAssignees(item?.task).forEach(addName));
        return values.sort((a, b) => a.localeCompare(b));
    }

    function buildTaskEditorViewModel(
        boardRecord: BoardRecord,
        task: Task | null,
        options: { taskId?: unknown; preferredDueDate?: string } = {}
    ): TaskEditorViewModel {
        taskEditorOpenCount += 1;
        const roadmap = getRoadmapExtension(boardRecord.data) || createEmptyRoadmapExtension();
        const phaseOptions = buildRoadmapEntityOptions(roadmap.phases);
        const milestoneOptions = buildRoadmapEntityOptions(roadmap.milestones);
        const knownRef = (optionList: SelectOption[], value: unknown) => {
            const ref = normalizeRoadmapRef(value);
            return optionList.some((option) => option.value === ref) ? ref : '';
        };
        const normalized = task ? normalizeTask(task) : null;
        const initial: TaskEditorFields = normalized
            ? {
                title: normalized.title || '',
                description: normalized.description || '',
                blocked: Boolean(normalized.blocked),
                blockerReason: normalized.blocked ? normalizeBlockerReason(normalized.blockerReason) : '',
                assignees: normalizeAssignees(normalized.assignees),
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
                description: '',
                blocked: false,
                blockerReason: '',
                assignees: [],
                tags: [],
                checklist: [],
                attachments: [],
                dueDate: normalizeDueDate(options.preferredDueDate || '') || '',
                priority: '',
                effort: '',
                phaseId: '',
                milestoneId: ''
            };
        return {
            openId: taskEditorOpenCount,
            heading: normalized ? 'Edit Task' : 'New Task',
            initial,
            phaseOptions,
            milestoneOptions,
            assigneePool: getTaskAssigneeSuggestions([]),
            tagSuggestions: getBoardTagSuggestions(boardRecord.data),
            otherAttachmentBytes: calculateBoardAttachmentBytes(boardRecord.data, {
                excludeTaskId: normalized ? options.taskId : null
            })
        };
    }

    function buildTaskDetailViewModel(source: TaskDetailSource, taskId: unknown, readOnly: boolean): TaskDetailViewModel {
        const task = normalizeTask(source.task);
        const statusMap: Record<string, string> = Object.fromEntries((source.boardData.board.columns || []).map((column) => [column.status, column.title]));
        const roadmap = getRoadmapExtension(source.boardData);
        return {
            readOnly,
            fields: {
                title: task.title || '-',
                description: task.description || '-',
                assignees: formatAssignees(task.assignees) || '-',
                tags: normalizeTags(task.tags).join(', ') || '-',
                blocked: task.blocked ? 'Yes' : 'No',
                blockerReason: task.blocked ? (normalizeBlockerReason(task.blockerReason) || '-') : '-',
                priority: task.priority ? (task.priority.charAt(0).toUpperCase() + task.priority.slice(1)) : '-',
                effort: task.effort || '-',
                status: (statusMap[task.status] || task.status) || '-',
                createdAt: formatDateTime(task.createdAt),
                updatedAt: formatDateTime(task.updatedAt),
                dueDate: formatDueDateForUi(task.dueDate) || '-',
                phase: getRoadmapItemTitle(roadmap, 'phases', task.phaseId) || '-',
                milestone: getRoadmapItemTitle(roadmap, 'milestones', task.milestoneId) || '-',
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

    function openPortfolioTaskDetails(boardId: string, taskId: number, options: { boardData?: unknown; readOnly?: boolean } = {}) {
        const source = findPortfolioTaskDetailSource(boardId, taskId, options);
        if (!source) return;
        setSelectedPortfolioCard(boardId, taskId);
        const readOnly = options.readOnly === true || !canUsePortfolioTaskMutations(boardId);
        commitState({ portfolioDetailContext: { boardId, taskId, readOnly } });
        openDialogFn('taskDetail', buildTaskDetailViewModel(source, taskId, readOnly));
    }

    function editPortfolioTask(boardId: string, taskId: number) {
        const source = findPortfolioTaskSource(boardId, taskId);
        if (!source) return;
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return;
        }
        closeTaskDetail();
        setSelectedPortfolioCard(boardId, taskId);
        commitState({
            portfolioEditContext: { boardId, taskId },
            portfolioCreateContext: null
        });
        openDialogFn('taskEditor', buildTaskEditorViewModel(source.boardRecord, source.task, { taskId }));
    }

    function openPortfolioCreateTaskModal(boardId: string, preferredStatus: unknown, options: { preferredDueDate?: string } = {}) {
        const boardRecord = getBoardRecord(boardId);
        if (!boardRecord) return;
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return;
        }
        closeTaskDetail();
        const allowedStatuses = new Set((boardRecord.data.board.columns || []).map((column) => normalizeTaskStatus(column.status)));
        const fallbackStatus = normalizeTaskStatus((boardRecord.data.board.columns || [defaultColumns[0]])[0]?.status);
        const status = allowedStatuses.has(normalizeTaskStatus(preferredStatus))
            ? normalizeTaskStatus(preferredStatus)
            : fallbackStatus;
        commitState({
            portfolioCreateContext: { boardId, status },
            portfolioEditContext: null
        });
        openDialogFn('taskEditor', buildTaskEditorViewModel(boardRecord, null, {
            preferredDueDate: options.preferredDueDate
        }));
    }

    function closeTaskEditor() {
        commitState({
            portfolioEditContext: null,
            portfolioCreateContext: null
        });
        closeDialogFn('taskEditor');
    }

    function closeTaskDetail() {
        commitState({ portfolioDetailContext: null });
        closeDialogFn('taskDetail');
    }

    function openPortfolioTaskDetailsForCalendar(boardId: string, taskId: number) {
        const timelineView = getState().selectedPortfolioBoardId === boardId
            ? getSelectedPortfolioTimelineView(getState())
            : null;
        if (timelineView?.isPreview) {
            openPortfolioTaskDetails(boardId, taskId, {
                boardData: timelineView.projectedBoard || null,
                readOnly: true
            });
            return;
        }
        openPortfolioTaskDetails(boardId, taskId);
    }

    async function togglePortfolioArchiveTask(boardId: string, taskId: number) {
        const source = findPortfolioTaskSource(boardId, taskId);
        if (!source) return;
        const wasArchived = Boolean(source.task.archived);
        if (!wasArchived) {
            const title = String(source.task.title || '').trim() || 'this task';
            if (!(await confirm(`Archive "${title}"?`, { title: 'Archive task', confirmLabel: 'Archive' }))) return;
        }

        const changed = await runPortfolioTaskMutation(boardId, taskId, (task) => {
            task.archived = !task.archived;
            return true;
        });
        if (!changed || wasArchived) return;

        showUndo('Task archived', async () => {
            await runPortfolioTaskMutation(boardId, taskId, (task) => {
                if (!task.archived) return false;
                task.archived = false;
                return true;
            });
        });
    }

    async function deletePortfolioTask(boardId: string, taskId: number) {
        const source = findPortfolioTaskSource(boardId, taskId);
        if (!source) return;
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return;
        }

        const title = String(source.task.title || '').trim() || 'this task';
        const confirmed = await confirm(`Delete "${title}" permanently? This cannot be undone.`, {
            title: 'Delete task',
            confirmLabel: 'Delete',
            danger: true
        });
        if (!confirmed) return;

        const state = getState();
        if (
            state.portfolioDetailContext?.boardId === boardId
            && Number(state.portfolioDetailContext.taskId) === Number(taskId)
        ) {
            closeTaskDetail();
        }
        if (
            state.selectedPortfolioCardRef?.boardId === boardId
            && Number(state.selectedPortfolioCardRef.taskId) === Number(taskId)
        ) {
            commitState({ selectedPortfolioCardRef: null });
        }
        if (
            state.hoveredPortfolioCardRef?.boardId === boardId
            && Number(state.hoveredPortfolioCardRef.taskId) === Number(taskId)
        ) {
            commitState({ hoveredPortfolioCardRef: null });
        }

        await runPortfolioBoardMutation(boardId, (data) => {
            const index = data.board.tasks.findIndex((task) => Number(task.id) === Number(taskId));
            if (index < 0) return false;
            const before = captureTaskTimelineSnapshot(data, taskId);
            data.board.tasks.splice(index, 1);
            removeLegacyTaskAttachmentsFromExtensions(data, taskId);
            recordTaskTimelineEvent(data, before, null);
            return true;
        });
    }

    function validateTaskDraft(draft: TaskDraft | null | undefined): TaskDraftValidation {
        const attachments = Array.isArray(draft?.attachments) ? draft.attachments : [];
        if (!draft?.title) {
            return { ok: false, silent: true };
        }
        if (draft.title.length > TASK_TITLE_MAX_LENGTH) {
            return {
                ok: false,
                message: `Task title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer.`,
                focusField: 'title'
            };
        }
        if (draft.blocked && !draft.blockerReason) {
            return {
                ok: false,
                message: 'Blocked tasks require a blocker reason.',
                focusField: 'blockerReason'
            };
        }
        if (draft.rawDueDate && !draft.dueDate) {
            return {
                ok: false,
                message: 'Due date must be a valid date.',
                focusField: 'dueDate'
            };
        }
        if (attachments.length > ATTACHMENT_MAX_COUNT) {
            return {
                ok: false,
                message: `Tasks can have up to ${ATTACHMENT_MAX_COUNT} attachments.`
            };
        }
        if (attachments.some((item) => (Number(item.sizeBytes) || 0) > ATTACHMENT_HARD_MAX_BYTES)) {
            return {
                ok: false,
                message: `Attachments must be ${formatFileSize(ATTACHMENT_HARD_MAX_BYTES)} or smaller.`
            };
        }
        return { ok: true };
    }

    async function saveTask(draft: TaskDraft): Promise<{ focusField?: TaskFocusField } | undefined> {
        const validation = validateTaskDraft(draft);
        if (!validation.ok) {
            if (validation.silent) return;
            await alert(validation.message);
            return { focusField: validation.focusField };
        }
        const commonFields = buildTaskFieldsFromDraft(draft);
        const state = getState();

        if (state.portfolioCreateContext?.boardId) {
            const { boardId } = state.portfolioCreateContext;
            const boardRecord = getBoardRecord(boardId);
            if (!boardRecord) return;
            if (!canUsePortfolioTaskMutations(boardId)) {
                notifyPortfolioMutationUnavailable(boardId);
                return;
            }

            const now = nowIso();
            const nextId = nextTaskIdForBoard(boardRecord);
            const status = resolveCreateTaskStatus(boardRecord, state.portfolioCreateContext.status);
            setSelectedPortfolioBoardId(boardId, { resetViewModeWhenEmpty: false });
            await runPortfolioBoardMutation(boardId, (data) => {
                // Attachments are set just below; serialization fills in the
                // remaining defaults.
                data.board.tasks.push({
                    id: nextId, ...commonFields, archived: false,
                    createdAt: now, updatedAt: now, status
                } as Task);
                setTaskAttachments(data, nextId, draft.attachments);
                recordTaskTimelineEvent(data, null, captureTaskTimelineSnapshot(data, nextId));
                return true;
            }, { onCommitted: closeTaskEditor });
            return;
        }

        if (state.portfolioEditContext?.boardId && state.portfolioEditContext?.taskId) {
            const { boardId, taskId } = state.portfolioEditContext;
            const saved = await runPortfolioTaskMutation(boardId, taskId, (task, boardRecord) => {
                Object.assign(task, commonFields);
                if (boardRecord?.data) {
                    setTaskAttachments(boardRecord.data, taskId, draft.attachments);
                }
                return true;
            });
            if (!saved) return;
            closeTaskEditor();
            return;
        }

        closeTaskEditor();
    }

    function toggleTaskDetailChecklistItem(itemIndex: number, checked: boolean) {
        const context = getState().portfolioDetailContext;
        if (!context?.boardId || !context?.taskId) return;
        if (context.readOnly) {
            notifyPortfolioMutationUnavailable(context.boardId);
            return;
        }
        return runPortfolioTaskMutation(context.boardId, context.taskId, (task) => {
            if (!Array.isArray(task.checklist) || !task.checklist[itemIndex]) return false;
            task.checklist[itemIndex].done = checked;
            return true;
        });
    }

    async function movePortfolioTaskToStatus(boardId: string, taskId: number, targetStatus: unknown): Promise<boolean> {
        if (!boardId || !taskId || !isPortfolioBoardMutable(boardId)) return false;
        const source = findPortfolioTaskSource(boardId, taskId);
        if (!source) return false;
        const normalizedTargetStatus = normalizeTaskStatus(targetStatus);
        const validStatuses = new Set(
            (source.boardRecord.data.board.columns || defaultColumns)
                .map((column) => normalizeTaskStatus(column.status))
        );
        if (!validStatuses.has(normalizedTargetStatus)) return false;
        if (normalizeTaskStatus(source.task.status) === normalizedTargetStatus) return false;
        return Boolean(await runPortfolioTaskMutation(boardId, taskId, (task) => {
            if (normalizeTaskStatus(task.status) === normalizedTargetStatus) return false;
            task.status = normalizedTargetStatus;
            return true;
        }));
    }

    function showUndo(message: string, undoFn: () => unknown) {
        if (undoTimer) clearTimeout(undoTimer);
        commitState({ undoAction: undoFn, undoToast: { message } });
        undoTimer = setTimeout(() => hideUndo(), 5000);
    }

    function hideUndo() {
        if (undoTimer) clearTimeout(undoTimer);
        undoTimer = null;
        commitState({ undoAction: null, undoToast: null });
    }

    function performUndo() {
        const undoAction = getState().undoAction;
        if (!undoAction) return;
        hideUndo();
        return undoAction();
    }

    function refreshTaskDetail(boardId: string) {
        const context = getState().portfolioDetailContext;
        if (context?.boardId === boardId) openPortfolioTaskDetails(boardId, context.taskId);
    }
    return {
        openPortfolioTaskDetails,
        editPortfolioTask,
        openPortfolioCreateTaskModal,
        closeTaskEditor,
        closeTaskDetail,
        openPortfolioTaskDetailsForCalendar,
        togglePortfolioArchiveTask,
        deletePortfolioTask,
        saveTask,
        toggleTaskDetailChecklistItem,
        movePortfolioTaskToStatus,
        performUndo,
        refreshTaskDetail,
    };
}

export type TaskActions = ReturnType<typeof createTaskActions>;
