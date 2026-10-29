import { workitemLabel, workitemLabelFor } from '@/domain/taskIdentity';
import { childrenOf } from '@/domain/workitems';
import type { WorkitemType } from '@/domain/types';
// Task editing, details, validation, and undo.

import type { Effort, Priority, TaskRelationKind } from '@/domain/types';
import type { TaskDraft } from '@/features/portfolio/types';
import type { BoardMutationContext } from './mutationContext';
import type { BoardInteractions } from './boardCommands';
import {
    buildTaskFieldsFromDraft,
    nextTaskIdForBoard,
    normalizeTask,
    resolveCreateTaskStatus
} from '@/domain/task';
import {
    removeLegacyTaskAttachmentsFromExtensions,
    setTaskAttachments,
} from '@/domain/attachments';
import { recordTaskRelationsTimelineEvent } from '@/domain/timeline';
import { getRelations, getTaskRelations, removeTaskRelation, setTaskRelation, TaskRelationError } from '@/domain/taskRelations';
import { cloneSerializable } from '@/domain/serializable';
import { nowIso } from '@/domain/util';
import { translateCurrent } from '@/shared/i18n';
import { getRoadmapExtension, isValidRoadmapAssignment } from '@/domain/roadmap';
import { canTransition, getWorkflow } from '@/domain/workflow';
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

    function openPortfolioTaskDetails(boardId: string, taskId: number, options: { boardData?: unknown; readOnly?: boolean; historyEventIndex?: number } = {}) {
        const view = getState().selectedPortfolioBoardId === boardId ? getSelectedPortfolioTimelineView(getState()) : null;
        const historyEventIndex = options.historyEventIndex ?? (view?.isPreview ? view.selectedIndex ?? undefined : undefined);
        const effective = view?.isPreview ? { ...options, boardData: options.boardData || view.projectedBoard, readOnly: true } : options;
        const source = findPortfolioTaskDetailSource(getBoardRecord, boardId, taskId, effective);
        if (!source) return;
        setSelectedPortfolioCard(boardId, taskId);
        const readOnly = effective.readOnly === true || !canUsePortfolioTaskMutations(boardId);
        commitState({ portfolioDetailContext: { boardId, taskId, readOnly, ...(historyEventIndex !== undefined ? { historyEventIndex } : {}) } });
        openDialogFn('taskDetail', buildTaskDetailViewModel(source, taskId, readOnly, historyEventIndex));
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

    function openPortfolioCreateTaskModal(boardId: string, preferredStatus: unknown, options: { preferredDueDate?: string; preferredType?: WorkitemType } = {}) {
        const boardRecord = getBoardRecord(boardId);
        if (!boardRecord) return;
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return;
        }
        closeTaskDetail();
        const workflow = getWorkflow(boardRecord.data, { type: options.preferredType });
        const preferred = String(preferredStatus || '').trim();
        const status = workflow.states.some((state) => state.id === preferred) ? preferred : 'backlog';
        commitState({
            portfolioCreateContext: { boardId, status },
            portfolioEditContext: null
        });
        const model = buildTaskEditorViewModel(
            boardRecord,
            null,
            getState().portfolioTasks,
            ++taskEditorOpenCount,
            { preferredDueDate: options.preferredDueDate }
        );
        model.initial.type = options.preferredType || 'task';
        openDialogFn('taskEditor', model);
    }

    function openPortfolioCreateChildTask(boardId: string, parentId: number, type: WorkitemType) {
        openPortfolioCreateTaskModal(boardId, 'backlog');
        const vm = getState().dialogProps as import('@/features/portfolio/types').TaskEditorViewModel;
        if (getState().activeDialog !== 'taskEditor' || !vm?.initial) return;
        commitState({ dialogProps: { ...vm, initial: { ...vm.initial, type, parentId, phaseMode: 'inherit', milestoneMode: 'inherit' } } });
    }

    function closeTaskEditor() {
        commitState({
            portfolioEditContext: null,
            portfolioCreateContext: null
        });
        closeDialogFn('taskEditor');
    }

    function openPortfolioCreateRelatedTask(boardId: string, taskId: number, kind: TaskRelationKind) {
        const source = findPortfolioTaskSource(boardId, taskId);
        if (!source || !['related', 'blocks', 'blockedBy'].includes(kind)) return;
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return;
        }
        closeTaskDetail();
        commitState({ portfolioCreateContext: { boardId, status: 'backlog', relatedTo: { taskId, kind } }, portfolioEditContext: null });
        const vm = buildTaskEditorViewModel(source.boardRecord, null, getState().portfolioTasks, ++taskEditorOpenCount);
        vm.initial.phaseId = source.task.phaseId;
        vm.initial.milestoneId = source.task.milestoneId;
        vm.relationNotice = translateCurrent(`relations.sentence.${kind}`, { a: workitemLabelFor(source.boardRecord.data, taskId), b: translateCurrent('relations.newItem') });
        openDialogFn('taskEditor', vm);
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
        if (childrenOf(source.boardRecord.data, taskId).length) { await alert(translateCurrent('workitems.error.children')); return; }
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return;
        }

        const title = String(source.task.title || '').trim() || translateCurrent('messages.thisTask');
        const related = getTaskRelations(source.boardRecord.data, taskId);
        const affected = [...related.blockedBy, ...related.blocks, ...related.related];
        const impact = affected.length ? '\n\n' + translateCurrent('relations.deleteImpact', {
            items: affected.map((task) => `${workitemLabel(task)} ${task.title}`).join(', ')
        }) : '';
        const confirmed = await confirm(translateCurrent('messages.deleteQuestion', { title }) + impact, {
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
            const beforeRelations = cloneSerializable(getRelations(data));
            removeTaskRelation(data, taskId);
            recordTaskRelationsTimelineEvent(data, taskId, beforeRelations);
            data.board.tasks.splice(index, 1);
            removeLegacyTaskAttachmentsFromExtensions(data, taskId);
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
            const { boardId, relatedTo } = state.portfolioCreateContext;
            const boardRecord = getBoardRecord(boardId);
            if (!boardRecord) return;
            if (!canUsePortfolioTaskMutations(boardId)) {
                notifyPortfolioMutationUnavailable(boardId);
                return;
            }

            const now = nowIso();
            const status = relatedTo ? 'backlog' : resolveCreateTaskStatus(boardRecord, state.portfolioCreateContext.status);
            setSelectedPortfolioBoardId(boardId, { resetViewModeWhenEmpty: false });
            await runPortfolioBoardMutation(boardId, (data) => {
                const nextId = nextTaskIdForBoard({ data });
                data.board.tasks.push(normalizeTask({
                    id: nextId, ...commonFields, archived: false,
                    createdAt: now, updatedAt: now, status
                }, { roadmap: data.extensions.roadmap, includeStatusChangedAt: false }));
                setTaskAttachments(data, nextId, draft.attachments);
                if (relatedTo) {
                    const beforeRelations = cloneSerializable(getRelations(data));
                    try {
                        setTaskRelation(data, relatedTo.taskId, nextId, relatedTo.kind);
                    } catch (error) {
                        if (error instanceof TaskRelationError) throw new Error(translateCurrent(`relations.error.${error.code}`));
                        throw error;
                    }
                    recordTaskRelationsTimelineEvent(data, relatedTo.taskId, beforeRelations);
                }
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
        const normalizedTargetStatus = String(targetStatus || '').trim();
        const validStatuses = new Set(getWorkflow(source.boardRecord.data, source.task).states.map((state) => state.id));
        if (!validStatuses.has(normalizedTargetStatus)) return false;
        if (source.task.status === normalizedTargetStatus) return false;
        if (!canTransition(source.boardRecord.data, source.task.status, normalizedTargetStatus, source.task)) {
            await alert(translateCurrent('workflow.transitionDenied'));
            return false;
        }
        return Boolean(await runPortfolioTaskMutation(boardId, taskId, (task) => {
            if (!canTransition(source.boardRecord.data, task.status, normalizedTargetStatus, task)) return false;
            if (task.status === normalizedTargetStatus) return false;
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

    // All quick-created tasks start in the reserved Backlog state.
    // fields. Returns the new task id, or null when nothing was created.
    async function createPortfolioTaskFromFields(boardId: string, fields: {
        type?: WorkitemType; title: string; assignees: string[]; priority: Priority | null; tags: string[]; effort: Effort | null; dueDate: string;
    }): Promise<number | null> {
        const boardRecord = getBoardRecord(boardId);
        const title = fields.title.trim();
        if (!boardRecord || !title) return null;
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return null;
        }
        let id = 0;
        const now = nowIso();
        const created = await runPortfolioBoardMutation(boardId, (data) => {
            id = nextTaskIdForBoard({ data });
            data.board.tasks.push(normalizeTask({
                id, title, type: fields.type || 'task', description: '', assignees: fields.assignees, tags: fields.tags,
                priority: fields.priority, effort: fields.effort, dueDate: fields.dueDate,
                status: resolveCreateTaskStatus(boardRecord, 'to-do'), archived: false,
                createdAt: now, updatedAt: now
            }, { includeStatusChangedAt: false }));
            return true;
        });
        if (!created) return null;
        showUndo(translateCurrent('palette.taskCreated', { title }), () => runPortfolioBoardMutation(boardId, (data) => {
            const index = data.board.tasks.findIndex((task) => Number(task.id) === id);
            if (index < 0) return false;
            const beforeRelations = cloneSerializable(getRelations(data));
            removeTaskRelation(data, id);
            recordTaskRelationsTimelineEvent(data, id, beforeRelations);
            data.board.tasks.splice(index, 1);
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
        openPortfolioCreateTaskModal, openPortfolioCreateChildTask,
        openPortfolioCreateRelatedTask,
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
