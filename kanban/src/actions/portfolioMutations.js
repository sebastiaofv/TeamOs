// Store-backed portfolio mutations. The legacy runtime supplies only the
// callbacks needed to rebuild its derived view state; all persisted changes
// and transient mutation state live behind this module's interface.

import {
    ATTACHMENT_HARD_MAX_BYTES,
    ATTACHMENT_MAX_COUNT,
    TASK_TITLE_MAX_LENGTH,
    TIMELINE_EXTENSION_KEY,
    defaultColumns
} from '../domain/constants.js';
import {
    buildTaskFieldsFromDraft,
    nextTaskIdForBoard,
    normalizeBlockerReason,
    normalizeTaskStatus,
    resolveCreateTaskStatus,
    touchTask
} from '../domain/task.js';
import {
    createEmptyRoadmapExtension,
    getRoadmapEntityConfig,
    getRoadmapExtension,
    getRoadmapExtensionObject,
    normalizeRoadmapDate,
    normalizeRoadmapRef,
    slugifyRoadmapEntityId
} from '../domain/roadmap.js';
import { removeLegacyTaskAttachmentsFromExtensions, setTaskAttachments } from '../domain/attachments.js';
import { cloneSerializable, createBoardStateSnapshot, getBoardExtensionsObject, serializeBoardDataFromObject } from '../domain/serialize.js';
import {
    appendTimelineEvent,
    captureTaskTimelineSnapshot,
    ensureBoardTimelineBaseline,
    getBoardTimelineData,
    recordBoardRestoreTimelineEvent,
    recordTaskTimelineEvent,
    reconstructBoardStateFromTimeline
} from '../domain/timeline.js';
import { formatFileSize, nowIso } from '../domain/util.js';
import { enqueueProjectSave, getProjectSaveState, markProjectDirty } from '../persistence/projectFiles.js';
import { closeDialog } from './dialogs.js';
import { notifyAppStateChanged, useAppStore } from '../state/store.js';

const noop = () => {};

function defaultAlert(message) {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(message);
    }
}

function defaultConfirm(message) {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        return window.confirm(message);
    }
    return false;
}

function defaultFocusField(fieldId) {
    if (typeof document === 'undefined' || !fieldId) return;
    document.getElementById(fieldId)?.focus();
}

/**
 * Create the portfolio mutation module.
 *
 * The interface is intentionally small: the module owns state, persistence,
 * validation, timeline bookkeeping, and mutation guards. The runtime only
 * provides callbacks for rebuilding derived rows, repainting legacy containers,
 * and reopening a task detail view that is already visible.
 */
export function createPortfolioMutationActions({
    store = useAppStore,
    notify = store === useAppStore ? notifyAppStateChanged : noop,
    buildPortfolioTasks = noop,
    renderPortfolio = noop,
    openPortfolioTaskDetails = noop,
    enqueueSave = enqueueProjectSave,
    markDirty = markProjectDirty,
    getSaveState = getProjectSaveState,
    closeDialogFn = closeDialog,
    alert = defaultAlert,
    confirm = defaultConfirm,
    focusField = defaultFocusField
} = {}) {
    const getState = () => store.getState();

    function notifyStateChanged() {
        notify();
    }

    function commitState(partial) {
        store.setState(partial);
        notifyStateChanged();
    }

    function getBoardRecord(boardId) {
        return getState().portfolioBoards.find((board) => board?.id === boardId) || null;
    }

    function getPortfolioBulkSelection(boardId) {
        const selection = getState().portfolioBulkSelectionByBoardId?.[boardId];
        return Array.isArray(selection) ? selection : [];
    }

    function clearPortfolioBulkSelection(boardId = '') {
        const state = getState();
        if (boardId) {
            delete state.portfolioBulkSelectionByBoardId[boardId];
        } else {
            state.portfolioBulkSelectionByBoardId = {};
        }
        notifyStateChanged();
    }

    function syncPortfolioBulkSelection(boardId, boardData) {
        const normalizedBoardId = String(boardId || '');
        if (!normalizedBoardId) return;
        const taskIds = new Set(
            Array.isArray(boardData?.board?.tasks)
                ? boardData.board.tasks.map((task) => Number(task.id))
                : []
        );
        const nextIds = getPortfolioBulkSelection(normalizedBoardId)
            .filter((taskId) => taskIds.has(Number(taskId)));
        if (nextIds.length > 0) {
            getState().portfolioBulkSelectionByBoardId[normalizedBoardId] = nextIds;
        } else {
            delete getState().portfolioBulkSelectionByBoardId[normalizedBoardId];
        }
        notifyStateChanged();
    }

    function togglePortfolioTaskBulkSelection(boardId, taskId, checked) {
        const normalizedBoardId = String(boardId || '');
        if (!normalizedBoardId) return;
        const ids = new Set(getPortfolioBulkSelection(normalizedBoardId).map((value) => Number(value)));
        if (checked) {
            ids.add(Number(taskId));
        } else {
            ids.delete(Number(taskId));
        }
        const nextIds = [...ids];
        if (nextIds.length > 0) {
            getState().portfolioBulkSelectionByBoardId[normalizedBoardId] = nextIds;
        } else {
            delete getState().portfolioBulkSelectionByBoardId[normalizedBoardId];
        }
        notifyStateChanged();
    }

    function getSelectedPortfolioBulkTaskIds(boardId) {
        const boardRecord = getBoardRecord(boardId);
        if (!boardRecord) return [];
        syncPortfolioBulkSelection(boardId, boardRecord.data);
        return getPortfolioBulkSelection(boardId);
    }

    function setSelectedPortfolioBoardId(boardId, options = {}) {
        const state = getState();
        const nextBoardId = boardId || '';
        if (nextBoardId !== state.selectedPortfolioBoardId) {
            clearPortfolioBulkSelection();
        }
        commitState({
            selectedPortfolioBoardId: nextBoardId,
            ...(options.resetViewModeWhenEmpty !== false && !nextBoardId
                ? { selectedPortfolioViewMode: 'board' }
                : {})
        });
    }

    function findPortfolioTaskSource(boardId, taskId) {
        const boardRecord = getBoardRecord(boardId);
        const tasks = boardRecord?.data?.board?.tasks;
        if (!boardRecord || !Array.isArray(tasks)) return null;
        const normalizedTaskId = Number(taskId);
        const taskIndex = tasks.findIndex((task) => Number(task?.id) === normalizedTaskId);
        if (taskIndex < 0) return null;
        return {
            boardRecord,
            task: tasks[taskIndex],
            taskIndex
        };
    }

    function isPortfolioBoardMutable(boardId) {
        return Boolean(getBoardRecord(boardId)?.handle);
    }

    function getTimelineSelectionIndex(boardId, timeline) {
        if (!boardId || !timeline?.events?.length) return null;
        const maxIndex = timeline.events.length - 1;
        const selection = getState().portfolioTimelineSelection || {};
        if (selection.boardId !== boardId || !Number.isInteger(selection.eventIndex)) {
            return maxIndex;
        }
        return Math.max(0, Math.min(maxIndex, selection.eventIndex));
    }

    function isHistoricalPreviewActiveForBoard(boardId) {
        if (!boardId) return false;
        const boardRecord = getBoardRecord(boardId);
        const timeline = getBoardTimelineData(boardRecord?.data);
        if (!timeline || timeline.events.length === 0) return false;
        const selectedIndex = getTimelineSelectionIndex(boardId, timeline);
        return Number.isInteger(selectedIndex) && selectedIndex < timeline.events.length - 1;
    }

    function canUsePortfolioTaskMutations(boardId) {
        return isPortfolioBoardMutable(boardId) && !isHistoricalPreviewActiveForBoard(boardId);
    }

    function notifyPortfolioReadOnly() {
        alert('This project is read-only because it was loaded without a file handle.');
    }

    function notifyTimelinePreviewReadOnly() {
        alert('Historical preview is read-only. Click Latest to resume editing.');
    }

    function notifyPortfolioMutationUnavailable(boardId) {
        if (isHistoricalPreviewActiveForBoard(boardId)) {
            notifyTimelinePreviewReadOnly();
            return;
        }
        notifyPortfolioReadOnly();
    }

    function closeTaskEditor() {
        commitState({
            pendingNewTaskStatus: null,
            portfolioEditContext: null,
            portfolioCreateContext: null
        });
        closeDialogFn('taskEditor');
    }

    function closeTaskDetail() {
        commitState({ portfolioDetailContext: null });
        closeDialogFn('taskDetail');
    }

    function closeRoadmapEntity() {
        commitState({ roadmapEntityContext: null });
        closeDialogFn('roadmapEntity');
    }

    function closePortfolioContextsForProject(boardId) {
        if (!boardId) return;
        const state = getState();
        if (state.portfolioDetailContext?.boardId === boardId) {
            closeTaskDetail();
        }
        if (
            state.portfolioEditContext?.boardId === boardId
            || state.portfolioCreateContext?.boardId === boardId
        ) {
            closeTaskEditor();
        }
    }

    function clearPortfolioTimelineSelection(options = {}) {
        commitState({ portfolioTimelineSelection: { boardId: '', eventIndex: null } });
        if (options.keepModals !== true) {
            closeTaskDetail();
            closeTaskEditor();
        }
    }

    function setPortfolioTimelineSelection(boardId, eventIndex, options = {}) {
        const boardRecord = getBoardRecord(boardId);
        const timeline = getBoardTimelineData(boardRecord?.data);
        if (!boardRecord || !timeline || timeline.events.length === 0) {
            clearPortfolioTimelineSelection();
            renderPortfolio();
            return;
        }

        const maxIndex = timeline.events.length - 1;
        const nextIndex = Math.max(0, Math.min(maxIndex, Number(eventIndex)));
        commitState({ portfolioTimelineSelection: { boardId, eventIndex: nextIndex } });
        closeTaskDetail();
        closeTaskEditor();
        renderPortfolio(options);
    }

    function movePortfolioTimelineToLatest(boardId = getState().selectedPortfolioBoardId) {
        if (!boardId) {
            clearPortfolioTimelineSelection();
            renderPortfolio();
            return;
        }
        const boardRecord = getBoardRecord(boardId);
        const timeline = getBoardTimelineData(boardRecord?.data);
        if (!timeline || timeline.events.length === 0) {
            clearPortfolioTimelineSelection();
            renderPortfolio();
            return;
        }

        commitState({ portfolioTimelineSelection: { boardId, eventIndex: timeline.events.length - 1 } });
        closeTaskDetail();
        closeTaskEditor();
        renderPortfolio();
    }

    function syncPortfolioTimelineSelectionToLatest(boardId, boardData = null) {
        if (!boardId) return;
        const state = getState();
        if (state.selectedPortfolioBoardId !== boardId && state.portfolioTimelineSelection.boardId !== boardId) {
            return;
        }

        const resolvedBoardData = boardData || getBoardRecord(boardId)?.data;
        const timeline = resolvedBoardData ? getBoardTimelineData(resolvedBoardData) : null;
        if (!timeline || timeline.events.length === 0) {
            if (state.portfolioTimelineSelection.boardId === boardId) {
                commitState({ portfolioTimelineSelection: { boardId: '', eventIndex: null } });
            }
            return;
        }

        commitState({ portfolioTimelineSelection: { boardId, eventIndex: timeline.events.length - 1 } });
    }

    function setPortfolioTimelineExpanded(boardId, expanded) {
        if (!boardId) return;
        getState().portfolioTimelineExpandedByBoardId[boardId] = Boolean(expanded);
        notifyStateChanged();
        renderPortfolio();
    }

    function togglePortfolioTimelineExpanded(boardId = getState().selectedPortfolioBoardId) {
        if (!boardId) return;
        setPortfolioTimelineExpanded(
            boardId,
            getState().portfolioTimelineExpandedByBoardId[boardId] !== true
        );
    }

    function getSelectedBoardTimelineViewState() {
        const state = getState();
        const boardId = state.selectedPortfolioBoardId;
        if (!boardId) return null;
        const boardRecord = getBoardRecord(boardId);
        if (!boardRecord) return null;
        const timeline = getBoardTimelineData(boardRecord.data);
        if (!timeline || timeline.events.length === 0) {
            return {
                boardRecord,
                timeline: null,
                selectedIndex: null,
                selectedEvent: null,
                isPreview: false,
                projectedBoard: null
            };
        }

        const selectedIndex = getTimelineSelectionIndex(boardId, timeline);
        return {
            boardRecord,
            timeline,
            selectedIndex,
            selectedEvent: timeline.events[selectedIndex] || null,
            isPreview: selectedIndex < timeline.events.length - 1,
            projectedBoard: reconstructBoardStateFromTimeline(boardRecord.data, selectedIndex)
        };
    }

    async function restorePortfolioTimelineSelection() {
        const viewState = getSelectedBoardTimelineViewState();
        if (!viewState?.boardRecord || !viewState.projectedBoard) return false;
        if (!viewState.boardRecord.handle) {
            notifyPortfolioMutationUnavailable(viewState.boardRecord.id);
            return false;
        }

        const currentTimeline = getBoardTimelineData(viewState.boardRecord.data);
        if (!currentTimeline) return false;

        closeTaskDetail();
        closeTaskEditor();

        const restoredData = createBoardStateSnapshot(viewState.projectedBoard);
        const nextTimeline = cloneSerializable(currentTimeline);
        const extensions = getBoardExtensionsObject(restoredData, { create: true });
        extensions[TIMELINE_EXTENSION_KEY] = nextTimeline;
        viewState.boardRecord.data = restoredData;
        recordBoardRestoreTimelineEvent(viewState.boardRecord.data, viewState.selectedEvent);
        viewState.boardRecord.title = viewState.boardRecord.data.board.settings.title;

        const refreshedTimeline = getBoardTimelineData(viewState.boardRecord.data);
        commitState({
            portfolioTimelineSelection: {
                boardId: viewState.boardRecord.id,
                eventIndex: Math.max(0, (refreshedTimeline?.events?.length || 1) - 1)
            }
        });

        markDirty(viewState.boardRecord.id);
        buildPortfolioTasks();
        renderPortfolio();
        await enqueueSave(viewState.boardRecord);
        return true;
    }

    function applySnapshotToBoardRecord(boardRecord, parsed, options = {}) {
        if (!boardRecord || !parsed) return false;
        const boardId = boardRecord.id;
        closePortfolioContextsForProject(boardId);
        const payload = serializeBoardDataFromObject(parsed);
        boardRecord.data = payload;
        boardRecord.title = payload.board.settings.title;
        if (options.discardLocalChanges) {
            const saveState = getSaveState(boardId, { create: false });
            if (saveState) {
                saveState.revision = saveState.savedRevision;
                saveState.status = 'idle';
                saveState.lastErrorMessage = '';
                saveState.queued = false;
            }
        }
        buildPortfolioTasks();
        renderPortfolio();
        return true;
    }

    async function runPortfolioTaskMutation(boardId, taskId, mutator) {
        const source = findPortfolioTaskSource(boardId, taskId);
        if (!source) return false;
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return false;
        }

        ensureBoardTimelineBaseline(source.boardRecord.data);
        const beforeTask = captureTaskTimelineSnapshot(source.boardRecord.data, taskId);
        let changed = false;
        try {
            changed = mutator(source.task, source.boardRecord) !== false;
        } catch (error) {
            alert(`Portfolio task update failed: ${error.message}`);
            return false;
        }

        if (!changed) return false;
        touchTask(source.task);
        recordTaskTimelineEvent(
            source.boardRecord.data,
            beforeTask,
            captureTaskTimelineSnapshot(source.boardRecord.data, taskId)
        );
        syncPortfolioTimelineSelectionToLatest(boardId, source.boardRecord.data);
        markDirty(boardId);
        buildPortfolioTasks();
        renderPortfolio();

        const detailContext = getState().portfolioDetailContext;
        if (
            detailContext?.boardId === boardId
            && Number(detailContext.taskId) === Number(taskId)
        ) {
            openPortfolioTaskDetails(boardId, taskId);
        }

        await enqueueSave(source.boardRecord);
        return true;
    }

    async function runPortfolioBoardMutation(boardId, mutator) {
        const boardRecord = getBoardRecord(boardId);
        if (!boardRecord) return false;
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return false;
        }

        ensureBoardTimelineBaseline(boardRecord.data);
        let changed = false;
        try {
            changed = mutator(boardRecord.data, boardRecord) !== false;
        } catch (error) {
            alert(`Portfolio update failed: ${error.message}`);
            return false;
        }
        if (!changed) return false;

        syncPortfolioTimelineSelectionToLatest(boardId, boardRecord.data);
        markDirty(boardId);
        buildPortfolioTasks();
        renderPortfolio();

        const detailContext = getState().portfolioDetailContext;
        if (detailContext?.boardId === boardId) {
            openPortfolioTaskDetails(boardId, detailContext.taskId);
        }

        await enqueueSave(boardRecord);
        return true;
    }

    async function togglePortfolioArchiveTask(boardId, taskId) {
        const source = findPortfolioTaskSource(boardId, taskId);
        if (!source) return;
        const wasArchived = Boolean(source.task.archived);
        if (!wasArchived) {
            const title = String(source.task.title || '').trim() || 'this task';
            if (!confirm(`Archive "${title}"?`)) return;
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

    async function deletePortfolioTask(boardId, taskId) {
        const source = findPortfolioTaskSource(boardId, taskId);
        if (!source) return;
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return;
        }

        const title = String(source.task.title || '').trim() || 'this task';
        if (!confirm(`Delete "${title}" permanently? This cannot be undone.`)) return;

        const beforeTask = captureTaskTimelineSnapshot(source.boardRecord.data, taskId);
        ensureBoardTimelineBaseline(source.boardRecord.data);
        source.boardRecord.data.board.tasks.splice(source.taskIndex, 1);
        removeLegacyTaskAttachmentsFromExtensions(source.boardRecord.data, taskId);
        recordTaskTimelineEvent(source.boardRecord.data, beforeTask, null);
        syncPortfolioTimelineSelectionToLatest(boardId, source.boardRecord.data);
        markDirty(boardId);

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

        buildPortfolioTasks();
        renderPortfolio();
        await enqueueSave(source.boardRecord);
    }

    function validateTaskDraft(draft) {
        const attachments = Array.isArray(draft?.attachments) ? draft.attachments : [];
        if (!draft?.title) {
            return { ok: false, silent: true };
        }
        if (draft.title.length > TASK_TITLE_MAX_LENGTH) {
            return {
                ok: false,
                message: `Task title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer.`,
                focusFieldId: 'taskName'
            };
        }
        if (draft.blocked && !draft.blockerReason) {
            return {
                ok: false,
                message: 'Blocked tasks require a blocker reason.',
                focusFieldId: 'taskBlockerReason'
            };
        }
        if (draft.rawDueDate && !draft.dueDate) {
            return {
                ok: false,
                message: 'Due date must be a valid date.',
                focusFieldId: 'taskDueDate'
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

    async function saveTask(draft) {
        const validation = validateTaskDraft(draft);
        if (!validation.ok) {
            if (validation.silent) return;
            alert(validation.message);
            focusField(validation.focusFieldId);
            return;
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
            ensureBoardTimelineBaseline(boardRecord.data);
            boardRecord.data.board.tasks.push({
                id: nextId,
                ...commonFields,
                archived: false,
                createdAt: now,
                updatedAt: now,
                status
            });
            setTaskAttachments(boardRecord.data, nextId, draft.attachments);
            recordTaskTimelineEvent(boardRecord.data, null, captureTaskTimelineSnapshot(boardRecord.data, nextId));
            syncPortfolioTimelineSelectionToLatest(boardId, boardRecord.data);
            markDirty(boardId);

            setSelectedPortfolioBoardId(boardId, { resetViewModeWhenEmpty: false });
            buildPortfolioTasks();
            renderPortfolio();
            closeTaskEditor();
            await enqueueSave(boardRecord);
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

    function toggleTaskDetailChecklistItem(itemIndex, checked) {
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

    function createSprintFromSelection(boardId, draft) {
        const boardRecord = getBoardRecord(boardId);
        if (!boardRecord) return false;
        const selectedTaskIds = getSelectedPortfolioBulkTaskIds(boardId);
        if (selectedTaskIds.length === 0) return false;
        const sprintConfig = getRoadmapEntityConfig('sprints');
        if (!sprintConfig) return false;

        return runPortfolioBoardMutation(boardId, (boardData) => {
            const roadmap = getRoadmapExtensionObject(boardData, { create: true });
            const items = roadmap[sprintConfig.itemsKey];
            const nextSprint = {
                id: slugifyRoadmapEntityId(draft.title, items),
                title: draft.title,
                startDate: draft.startDate,
                endDate: draft.endDate
            };
            const taskIdSet = new Set(selectedTaskIds.map((taskId) => Number(taskId)));
            let assignedCount = 0;
            const timestamp = nowIso();

            boardData.board.tasks.forEach((task) => {
                if (!taskIdSet.has(Number(task?.id))) return;
                assignedCount += 1;
                task.sprintId = nextSprint.id;
                task.updatedAt = timestamp;
            });
            if (assignedCount === 0) return false;

            items.push(nextSprint);
            appendTimelineEvent(boardData, {
                kind: 'roadmap.bulk-assigned',
                entityType: 'board',
                entityId: 'board',
                summary: `Sprint created from ${assignedCount} selected ${assignedCount === 1 ? 'task' : 'tasks'}: ${nextSprint.title}`,
                meta: {
                    roadmapKind: 'sprints',
                    roadmapItemId: nextSprint.id,
                    action: 'create-from-selection',
                    sprint: cloneSerializable(nextSprint),
                    taskIds: [...taskIdSet]
                }
            });
            return true;
        });
    }

    function assignSelectionToExistingSprint(boardId, sprintId) {
        const boardRecord = getBoardRecord(boardId);
        if (!boardRecord) return false;
        const normalizedSprintId = normalizeRoadmapRef(sprintId);
        const selectedTaskIds = getSelectedPortfolioBulkTaskIds(boardId);
        if (!normalizedSprintId || selectedTaskIds.length === 0) return false;

        return runPortfolioBoardMutation(boardId, (boardData) => {
            const roadmap = getRoadmapExtension(boardData) || createEmptyRoadmapExtension();
            const sprint = Array.isArray(roadmap.sprints)
                ? roadmap.sprints.find((entry) => entry.id === normalizedSprintId)
                : null;
            if (!sprint) return false;

            const taskIdSet = new Set(selectedTaskIds.map((taskId) => Number(taskId)));
            let assignedCount = 0;
            const timestamp = nowIso();
            boardData.board.tasks.forEach((task) => {
                if (!taskIdSet.has(Number(task?.id))) return;
                assignedCount += 1;
                task.sprintId = sprint.id;
                task.updatedAt = timestamp;
            });
            if (assignedCount === 0) return false;

            appendTimelineEvent(boardData, {
                kind: 'roadmap.bulk-assigned',
                entityType: 'board',
                entityId: 'board',
                summary: `Added ${assignedCount} selected ${assignedCount === 1 ? 'task' : 'tasks'} to sprint: ${sprint.title}`,
                meta: {
                    roadmapKind: 'sprints',
                    roadmapItemId: sprint.id,
                    action: 'assign-existing',
                    sprint: cloneSerializable(sprint),
                    taskIds: [...taskIdSet]
                }
            });
            return true;
        });
    }

    async function saveRoadmapEntity(input = {}) {
        const draft = {
            kind: input.kind,
            itemId: normalizeRoadmapRef(input.itemId),
            title: String(input.title || '').trim(),
            existingSprintId: normalizeRoadmapRef(input.existingSprintId),
            dueDate: normalizeRoadmapDate(input.dueDate),
            startDate: normalizeRoadmapDate(input.startDate),
            endDate: normalizeRoadmapDate(input.endDate)
        };
        const context = getState().roadmapEntityContext;
        if (!context?.boardId) return;
        const config = getRoadmapEntityConfig(draft.kind);
        if (!config) return;

        if (context.mode === 'assign-sprint-from-selection') {
            if (!draft.existingSprintId) {
                focusField('roadmapEntityExistingSprint');
                return;
            }
            const changed = await assignSelectionToExistingSprint(context.boardId, draft.existingSprintId);
            if (!changed) return;
            closeRoadmapEntity();
            clearPortfolioBulkSelection(context.boardId);
            renderPortfolio();
            return;
        }
        if (!draft.title) {
            focusField('roadmapEntityTitle');
            return;
        }
        if (config.dateMode === 'single' && !draft.dueDate) {
            alert(`${config.label} requires a valid due date.`);
            focusField('roadmapEntityDate');
            return;
        }
        if (config.dateMode === 'range' && (!draft.startDate || !draft.endDate)) {
            alert(`${config.label} requires valid start and end dates.`);
            focusField('roadmapEntityStartDate');
            return;
        }
        if (context.mode === 'create-sprint-from-selection') {
            const changed = await createSprintFromSelection(context.boardId, draft);
            if (!changed) return;
            closeRoadmapEntity();
            clearPortfolioBulkSelection(context.boardId);
            renderPortfolio();
            return;
        }

        const changed = await runPortfolioBoardMutation(context.boardId, (boardData) => {
            const roadmap = getRoadmapExtensionObject(boardData, { create: true });
            const items = roadmap[config.itemsKey];
            const index = draft.itemId ? items.findIndex((item) => item.id === draft.itemId) : -1;
            const nextId = draft.itemId || slugifyRoadmapEntityId(draft.title, items);
            const previousItem = index >= 0 ? items[index] : null;
            const nextItem = config.dateMode === 'single'
                ? { id: nextId, title: draft.title, dueDate: draft.dueDate }
                : { id: nextId, title: draft.title, startDate: draft.startDate, endDate: draft.endDate };
            if (previousItem && JSON.stringify(previousItem) === JSON.stringify(nextItem)) return false;

            if (index >= 0) {
                items[index] = nextItem;
            } else {
                items.push(nextItem);
            }

            appendTimelineEvent(boardData, {
                kind: 'roadmap.updated',
                entityType: 'board',
                entityId: 'board',
                summary: `${config.label} ${index >= 0 ? 'updated' : 'created'}: ${nextItem.title}`,
                snapshot: createBoardStateSnapshot(boardData),
                meta: {
                    roadmapKind: draft.kind,
                    roadmapItemId: nextItem.id,
                    action: index >= 0 ? 'update' : 'create'
                }
            });
            return true;
        });
        if (changed) closeRoadmapEntity();
    }

    async function deleteRoadmapEntity(kind, itemId) {
        const boardId = getState().selectedPortfolioBoardId;
        const boardRecord = boardId ? getBoardRecord(boardId) : null;
        const config = getRoadmapEntityConfig(kind);
        if (!boardRecord || !config) return;
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return;
        }

        const roadmap = getRoadmapExtension(boardRecord.data) || createEmptyRoadmapExtension();
        const item = roadmap[config.itemsKey].find((entry) => entry.id === itemId);
        if (!item) return;
        if (!confirm(`Delete "${item.title}"? Linked task references will be cleared.`)) return;

        await runPortfolioBoardMutation(boardId, (boardData) => {
            const mutableRoadmap = getRoadmapExtensionObject(boardData, { create: true });
            const items = mutableRoadmap[config.itemsKey];
            const index = items.findIndex((entry) => entry.id === itemId);
            if (index === -1) return false;
            const [removed] = items.splice(index, 1);
            const tasks = Array.isArray(boardData.board?.tasks) ? boardData.board.tasks : [];
            tasks.forEach((task) => {
                if (normalizeRoadmapRef(task[config.taskField]) !== removed.id) return;
                task[config.taskField] = '';
                touchTask(task);
            });
            appendTimelineEvent(boardData, {
                kind: 'roadmap.updated',
                entityType: 'board',
                entityId: 'board',
                summary: `${config.label} deleted: ${removed.title}`,
                snapshot: createBoardStateSnapshot(boardData),
                meta: {
                    roadmapKind: kind,
                    roadmapItemId: removed.id,
                    action: 'delete'
                }
            });
            return true;
        });
    }

    async function movePortfolioTaskToStatus(boardId, taskId, targetStatus) {
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

    function setPortfolioDragContext(context) {
        commitState({ portfolioDragContext: context || null });
    }

    function clearPortfolioColumnDragHighlights() {
        if (typeof document === 'undefined') return;
        const root = document.getElementById('portfolioBoard');
        root?.querySelectorAll('.portfolio-column-body.drag-over').forEach((node) => {
            node.classList.remove('drag-over');
        });
    }

    function readPortfolioDragContextFromEvent(event) {
        const current = getState().portfolioDragContext;
        if (current?.boardId && current?.taskId) return current;
        const raw = event?.dataTransfer?.getData?.('application/x-kanban-task')
            || event?.dataTransfer?.getData?.('text/plain');
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            return parsed?.boardId && parsed?.taskId ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function canDragPortfolioContext(context) {
        return Boolean(context?.boardId && context?.taskId) && isPortfolioBoardMutable(context.boardId);
    }

    function onPortfolioTaskDragStart(event, context) {
        if (!canDragPortfolioContext(context)) {
            event?.preventDefault?.();
            return;
        }
        setPortfolioDragContext({
            boardId: context.boardId,
            taskId: Number(context.taskId),
            fromStatus: normalizeTaskStatus(context.status)
        });
        const payload = JSON.stringify(getState().portfolioDragContext);
        if (event?.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            try {
                event.dataTransfer.setData('application/x-kanban-task', payload);
            } catch (_) { }
            try {
                event.dataTransfer.setData('text/plain', payload);
            } catch (_) { }
        }
        event?.currentTarget?.classList?.add('dragging');
    }

    function onPortfolioTaskDragEnd(event) {
        setPortfolioDragContext(null);
        commitState({ suppressPortfolioCardClickUntil: Date.now() + 120 });
        event?.currentTarget?.classList?.remove('dragging');
        clearPortfolioColumnDragHighlights();
    }

    function onPortfolioColumnDragOver(event, targetStatus) {
        const context = readPortfolioDragContextFromEvent(event);
        if (!canDragPortfolioContext(context)) return;
        const nextStatus = normalizeTaskStatus(targetStatus);
        if (normalizeTaskStatus(context.fromStatus) === nextStatus) return;
        event?.preventDefault?.();
        if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
        event?.currentTarget?.classList?.add('drag-over');
    }

    function onPortfolioColumnDragLeave(event) {
        const current = event?.currentTarget;
        if (!current?.classList) return;
        const related = event.relatedTarget;
        if (related && current.contains(related)) return;
        current.classList.remove('drag-over');
    }

    async function onPortfolioColumnDrop(event, targetStatus) {
        event?.preventDefault?.();
        event?.currentTarget?.classList?.remove('drag-over');
        const context = readPortfolioDragContextFromEvent(event);
        if (!canDragPortfolioContext(context)) {
            clearPortfolioColumnDragHighlights();
            return;
        }
        try {
            await movePortfolioTaskToStatus(context.boardId, Number(context.taskId), targetStatus);
        } finally {
            setPortfolioDragContext(null);
            clearPortfolioColumnDragHighlights();
        }
    }

    function beginPortfolioTimelineSliderDrag(boardId) {
        commitState({ portfolioTimelineDragState: { active: true, boardId: boardId || '' } });
    }

    function handleTimelineSliderPointerCommit() {
        if (!getState().portfolioTimelineDragState.active) return;
        commitState({ portfolioTimelineDragState: { active: false, boardId: '' } });
        renderPortfolio();
    }

    function showUndo(message, undoFn) {
        const previousTimer = getState().undoTimer;
        if (previousTimer) clearTimeout(previousTimer);
        commitState({ undoAction: undoFn, undoToast: { message }, undoTimer: null });
        const timer = setTimeout(() => hideUndo(), 5000);
        commitState({ undoTimer: timer });
    }

    function hideUndo() {
        const timer = getState().undoTimer;
        if (timer) clearTimeout(timer);
        commitState({ undoTimer: null, undoAction: null, undoToast: null });
    }

    function performUndo() {
        const undoAction = getState().undoAction;
        if (!undoAction) return;
        hideUndo();
        return undoAction();
    }

    return {
        applySnapshotToBoardRecord,
        assignSelectionToExistingSprint,
        beginPortfolioTimelineSliderDrag,
        canUsePortfolioTaskMutations,
        clearPortfolioBulkSelection,
        clearPortfolioTimelineSelection,
        closePortfolioContextsForProject,
        closeRoadmapEntity,
        closeTaskDetail,
        closeTaskEditor,
        createSprintFromSelection,
        deletePortfolioTask,
        deleteRoadmapEntity,
        getSelectedPortfolioBulkTaskIds,
        handleTimelineSliderPointerCommit,
        movePortfolioTaskToStatus,
        movePortfolioTimelineToLatest,
        notifyPortfolioMutationUnavailable,
        onPortfolioColumnDragLeave,
        onPortfolioColumnDragOver,
        onPortfolioColumnDrop,
        onPortfolioTaskDragEnd,
        onPortfolioTaskDragStart,
        performUndo,
        restorePortfolioTimelineSelection,
        saveRoadmapEntity,
        saveTask,
        setPortfolioTimelineExpanded,
        setPortfolioTimelineSelection,
        showUndo,
        syncPortfolioTimelineSelectionToLatest,
        togglePortfolioArchiveTask,
        togglePortfolioTaskBulkSelection,
        togglePortfolioTimelineExpanded,
        toggleTaskDetailChecklistItem
    };
}

let activeActions = createPortfolioMutationActions();

export function configurePortfolioMutationActions(options = {}) {
    activeActions = createPortfolioMutationActions(options);
    return activeActions;
}

export const applySnapshotToBoardRecord = (...args) => activeActions.applySnapshotToBoardRecord(...args);
export const assignSelectionToExistingSprint = (...args) => activeActions.assignSelectionToExistingSprint(...args);
export const beginPortfolioTimelineSliderDrag = (...args) => activeActions.beginPortfolioTimelineSliderDrag(...args);
export const canUsePortfolioTaskMutations = (...args) => activeActions.canUsePortfolioTaskMutations(...args);
export const clearPortfolioBulkSelection = (...args) => activeActions.clearPortfolioBulkSelection(...args);
export const clearPortfolioTimelineSelection = (...args) => activeActions.clearPortfolioTimelineSelection(...args);
export const closePortfolioContextsForProject = (...args) => activeActions.closePortfolioContextsForProject(...args);
export const closeRoadmapEntity = (...args) => activeActions.closeRoadmapEntity(...args);
export const closeTaskDetail = (...args) => activeActions.closeTaskDetail(...args);
export const closeTaskEditor = (...args) => activeActions.closeTaskEditor(...args);
export const createSprintFromSelection = (...args) => activeActions.createSprintFromSelection(...args);
export const deletePortfolioTask = (...args) => activeActions.deletePortfolioTask(...args);
export const deleteRoadmapEntity = (...args) => activeActions.deleteRoadmapEntity(...args);
export const getSelectedPortfolioBulkTaskIds = (...args) => activeActions.getSelectedPortfolioBulkTaskIds(...args);
export const handleTimelineSliderPointerCommit = (...args) => activeActions.handleTimelineSliderPointerCommit(...args);
export const movePortfolioTaskToStatus = (...args) => activeActions.movePortfolioTaskToStatus(...args);
export const movePortfolioTimelineToLatest = (...args) => activeActions.movePortfolioTimelineToLatest(...args);
export const notifyPortfolioMutationUnavailable = (...args) => activeActions.notifyPortfolioMutationUnavailable(...args);
export const onPortfolioColumnDragLeave = (...args) => activeActions.onPortfolioColumnDragLeave(...args);
export const onPortfolioColumnDragOver = (...args) => activeActions.onPortfolioColumnDragOver(...args);
export const onPortfolioColumnDrop = (...args) => activeActions.onPortfolioColumnDrop(...args);
export const onPortfolioTaskDragEnd = (...args) => activeActions.onPortfolioTaskDragEnd(...args);
export const onPortfolioTaskDragStart = (...args) => activeActions.onPortfolioTaskDragStart(...args);
export const performUndo = (...args) => activeActions.performUndo(...args);
export const restorePortfolioTimelineSelection = (...args) => activeActions.restorePortfolioTimelineSelection(...args);
export const saveRoadmapEntity = (...args) => activeActions.saveRoadmapEntity(...args);
export const saveTask = (...args) => activeActions.saveTask(...args);
export const setPortfolioTimelineExpanded = (...args) => activeActions.setPortfolioTimelineExpanded(...args);
export const setPortfolioTimelineSelection = (...args) => activeActions.setPortfolioTimelineSelection(...args);
export const showUndo = (...args) => activeActions.showUndo(...args);
export const syncPortfolioTimelineSelectionToLatest = (...args) => activeActions.syncPortfolioTimelineSelectionToLatest(...args);
export const togglePortfolioArchiveTask = (...args) => activeActions.togglePortfolioArchiveTask(...args);
export const togglePortfolioTaskBulkSelection = (...args) => activeActions.togglePortfolioTaskBulkSelection(...args);
export const togglePortfolioTimelineExpanded = (...args) => activeActions.togglePortfolioTimelineExpanded(...args);
export const toggleTaskDetailChecklistItem = (...args) => activeActions.toggleTaskDetailChecklistItem(...args);
