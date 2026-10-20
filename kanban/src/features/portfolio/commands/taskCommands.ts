// Task editing, details, validation, and undo.

import type { Effort, Priority, Task } from '@/domain/types';
import type { TaskDraft } from '@/features/portfolio/types';
import type { BoardMutationContext } from './mutationContext';
import type { BoardInteractions } from './boardCommands';
import { defaultColumns } from '@/domain/constants';
import {
    buildTaskFieldsFromDraft,
    nextTaskIdForBoard,
    normalizeTask,
    normalizeTaskStatus,
    resolveCreateTaskStatus
} from '@/domain/task';
import {
    removeLegacyTaskAttachmentsFromExtensions,
    setTaskAttachments,
} from '@/domain/attachments';
import { captureTaskTimelineSnapshot, recordTaskTimelineEvent } from '@/domain/timeline';
import { nowIso } from '@/domain/util';
import { translateCurrent } from '@/shared/i18n';
import { getRoadmapExtension, isValidRoadmapAssignment } from '@/domain/roadmap';
import { removeTaskParticipant, setTaskResponsible } from '@/domain/taskAssignments';

import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import {
    buildTaskEditorViewModel,
    buildTaskDetailViewModel,
    findPortfolioTaskDetailSource,
    validateTaskDraft,
    type TaskFocusField
} from './taskViewModels';

export type { TaskFocusField } from './taskViewModels';

export function createTaskActions({ getState, commitState, getBoardRecord, findPortfolioTaskSource, canUsePortfolioTaskMutations,
    notifyPortfolioMutationUnavailable, isPortfolioBoardMutable, runPortfolioBoardMutation, runPortfolioTaskMutation,
    alert, confirm, closeDialogFn, openDialogFn }: BoardMutationContext,
{ setSelectedPortfolioCard, setSelectedPortfolioBoardId }: Pick<BoardInteractions, 'setSelectedPortfolioCard' | 'setSelectedPortfolioBoardId'>) {
    let taskEditorOpenCount = 0;
    let undoTimer: ReturnType<typeof setTimeout> | null = null;

    function openPortfolioTaskDetails(boardId: string, taskId: number, options: { boardData?: unknown; readOnly?: boolean } = {}) {
        const source = findPortfolioTaskDetailSource(getBoardRecord, boardId, taskId, options);
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
        openDialogFn('taskEditor', buildTaskEditorViewModel(
            source.boardRecord,
            source.task,
            getState().portfolioTasks,
            ++taskEditorOpenCount,
            { taskId }
        ));
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
        openDialogFn('taskEditor', buildTaskEditorViewModel(
            boardRecord,
            null,
            getState().portfolioTasks,
            ++taskEditorOpenCount,
            { preferredDueDate: options.preferredDueDate }
        ));
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
            const title = String(source.task.title || '').trim() || translateCurrent('messages.thisTask');
            if (!(await confirm(translateCurrent('messages.archiveQuestion', { title }), {
                title: translateCurrent('messages.archiveTask'),
                confirmLabel: translateCurrent('messages.archive')
            }))) return;
        }

        const changed = await runPortfolioTaskMutation(boardId, taskId, (task) => {
            task.archived = !task.archived;
            return true;
        });
        if (!changed || wasArchived) return;

        showUndo(translateCurrent('task.archiveSuccess'), async () => {
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

        const title = String(source.task.title || '').trim() || translateCurrent('messages.thisTask');
        const confirmed = await confirm(translateCurrent('messages.deleteQuestion', { title }), {
            title: translateCurrent('messages.deleteTask'),
            confirmLabel: translateCurrent('messages.delete'),
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

    async function saveTask(draft: TaskDraft): Promise<{ focusField?: TaskFocusField } | undefined> {
        const validation = validateTaskDraft(draft);
        if (!validation.ok) {
            if (validation.silent) return;
            await alert(validation.message);
            return { focusField: validation.focusField };
        }
        const commonFields = setTaskResponsible(buildTaskFieldsFromDraft(draft), draft.responsible);
        const state = getState();
        const editingBoardId = state.portfolioCreateContext?.boardId || state.portfolioEditContext?.boardId;
        const roadmap = getRoadmapExtension(editingBoardId ? getBoardRecord(editingBoardId)?.data : null);
        if (!isValidRoadmapAssignment(roadmap, 'phaseId', draft.phaseId) || !isValidRoadmapAssignment(roadmap, 'milestoneId', draft.milestoneId)) {
            await alert(translateCurrent('roadmap.invalidAssignment'));
            return;
        }

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
            }, { onMutated: closeTaskEditor });
            return;
        }

        if (state.portfolioEditContext?.boardId
            && state.portfolioEditContext.taskId !== null
            && state.portfolioEditContext.taskId !== undefined) {
            const { boardId, taskId } = state.portfolioEditContext;
            await runPortfolioTaskMutation(boardId, taskId, (task, boardRecord) => {
                Object.assign(task, commonFields);
                if (boardRecord?.data) {
                    setTaskAttachments(boardRecord.data, taskId, draft.attachments);
                }
                return true;
            }, { onMutated: closeTaskEditor });
            return;
        }

        closeTaskEditor();
    }

    function toggleTaskDetailChecklistItem(itemIndex: number, checked: boolean) {
        const context = getState().portfolioDetailContext;
        if (!context?.boardId || context.taskId === null || context.taskId === undefined) return;
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
        if (!boardId || taskId === null || taskId === undefined || !isPortfolioBoardMutable(boardId)) return false;
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

    // Adds `name` to the task's assignees, or removes it when already there.
    async function confirmResponsibleParticipantRemoval(name: string): Promise<boolean> {
        return Boolean(await confirm(translateCurrent('task.removeResponsibleQuestion', { name }), {
            title: translateCurrent('editor.removeAssignee'), confirmLabel: translateCurrent('common.remove'), danger: true
        }));
    }

    async function togglePortfolioTaskAssignee(boardId: string, taskId: number, name: string): Promise<boolean> {
        const source = findPortfolioTaskSource(boardId, taskId);
        const trimmed = name.trim();
        if (!source || !trimmed) return false;
        if (!canUsePortfolioTaskMutations(boardId)) { notifyPortfolioMutationUnavailable(boardId); return false; }
        const before = { assignees: [...source.task.assignees], responsible: source.task.responsible || '' };
        const index = before.assignees.findIndex((entry) => entry.toLowerCase() === trimmed.toLowerCase());
        const assigned = index >= 0;
        if (assigned && removeTaskParticipant(before, index).needsConfirmation
            && !(await confirmResponsibleParticipantRemoval(trimmed))) return false;
        const changed = await runPortfolioTaskMutation(boardId, taskId, (task) => {
            const currentIndex = task.assignees.findIndex((entry) => entry.toLowerCase() === trimmed.toLowerCase());
            if (assigned && currentIndex < 0) return false;
            Object.assign(task, assigned ? removeTaskParticipant(task, currentIndex, true).task
                : { assignees: [...task.assignees, trimmed] });
            return true;
        });
        if (!changed) return false;
        showUndo(translateCurrent(assigned ? 'palette.unassigned' : 'palette.assigned', { name: trimmed, title: source.task.title }), () => (
            runPortfolioTaskMutation(boardId, taskId, (task) => {
                Object.assign(task, before);
                return true;
            })
        ));
        return true;
    }

    async function setPortfolioTaskResponsible(boardId: string, taskId: number, name: string): Promise<boolean> {
        const source = findPortfolioTaskSource(boardId, taskId);
        if (!source) return false;
        const before = { assignees: [...source.task.assignees], responsible: source.task.responsible || '' };
        const next = setTaskResponsible(before, name);
        if (next.responsible === before.responsible) return false;
        const changed = await runPortfolioTaskMutation(boardId, taskId, (task) => {
            Object.assign(task, setTaskResponsible(task, name));
            return true;
        });
        if (!changed) return false;
        showUndo(translateCurrent('palette.responsibleSet', { title: source.task.title }), () => runPortfolioTaskMutation(boardId, taskId, (task) => {
            Object.assign(task, before);
            return true;
        }));
        return true;
    }

    async function setPortfolioTaskPriority(boardId: string, taskId: number, priority: Priority | null): Promise<boolean> {
        const source = findPortfolioTaskSource(boardId, taskId);
        if (!source || source.task.priority === priority) return false;
        const before = source.task.priority;
        const changed = await runPortfolioTaskMutation(boardId, taskId, (task) => {
            task.priority = priority;
            return true;
        });
        if (!changed) return false;
        showUndo(translateCurrent('palette.prioritySet', { title: source.task.title }), () => (
            runPortfolioTaskMutation(boardId, taskId, (task) => {
                task.priority = before;
                return true;
            })
        ));
        return true;
    }

    // Creates a task in To Do (or the board's first column) from quick-create
    // fields. Returns the new task id, or null when nothing was created.
    async function createPortfolioTaskFromFields(boardId: string, fields: {
        title: string; assignees: string[]; priority: Priority | null; tags: string[]; effort: Effort | null; dueDate: string;
    }): Promise<number | null> {
        const boardRecord = getBoardRecord(boardId);
        const title = fields.title.trim();
        if (!boardRecord || !title) return null;
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return null;
        }
        const id = nextTaskIdForBoard(boardRecord);
        const now = nowIso();
        const created = await runPortfolioBoardMutation(boardId, (data) => {
            data.board.tasks.push(normalizeTask({
                id, title, description: '', assignees: fields.assignees, tags: fields.tags,
                priority: fields.priority, effort: fields.effort, dueDate: fields.dueDate,
                status: resolveCreateTaskStatus(boardRecord, 'to-do'), archived: false,
                createdAt: now, updatedAt: now
            }, { includeStatusChangedAt: false }));
            recordTaskTimelineEvent(data, null, captureTaskTimelineSnapshot(data, id));
            return true;
        });
        if (!created) return null;
        showUndo(translateCurrent('palette.taskCreated', { title }), () => runPortfolioBoardMutation(boardId, (data) => {
            const before = captureTaskTimelineSnapshot(data, id);
            const index = data.board.tasks.findIndex((task) => Number(task.id) === id);
            if (index < 0) return false;
            data.board.tasks.splice(index, 1);
            recordTaskTimelineEvent(data, before, null);
            return true;
        }));
        return id;
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
        showUndo,
        togglePortfolioTaskAssignee,
        confirmResponsibleParticipantRemoval,
        setPortfolioTaskResponsible,
        setPortfolioTaskPriority,
        createPortfolioTaskFromFields,
        refreshTaskDetail,
    };
}

export type TaskActions = ReturnType<typeof createTaskActions>;
