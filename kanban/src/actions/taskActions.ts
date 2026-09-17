// Task editing, details, validation, and undo.

import type { Task, TaskDraft } from '../types';
import type { BoardMutationContext } from './boardMutationContext';
import type { BoardInteractions } from './boardInteractions';
import { defaultColumns } from '../domain/constants';
import {
    buildTaskFieldsFromDraft,
    nextTaskIdForBoard,
    normalizeTaskStatus,
    resolveCreateTaskStatus
} from '../domain/task';
import {
    removeLegacyTaskAttachmentsFromExtensions,
    setTaskAttachments,
} from '../domain/attachments';
import { captureTaskTimelineSnapshot, recordTaskTimelineEvent } from '../domain/timeline';
import { nowIso } from '../domain/util';

import { getSelectedPortfolioTimelineView } from '../selectors/portfolioViews';
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
