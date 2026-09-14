// Store-backed portfolio mutations. Persisted changes, transient state, and
// dialog transitions all live behind this module's interface.

import {
    ATTACHMENT_HARD_MAX_BYTES,
    ATTACHMENT_MAX_COUNT,
    TASK_TITLE_MAX_LENGTH,
    TIMELINE_EXTENSION_KEY,
    defaultColumns
} from '../domain/constants.js';
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
    parseAssigneesInput,
    parseChecklistInput,
    normalizeTaskStatus,
    resolveCreateTaskStatus,
    taskAssignees,
    touchTask
} from '../domain/task.js';
import {
    createEmptyRoadmapExtension,
    formatRoadmapDateRange,
    getRoadmapEntityConfig,
    getRoadmapExtension,
    getRoadmapExtensionObject,
    getRoadmapItemTitle,
    normalizeRoadmapDate,
    normalizeRoadmapRef,
    slugifyRoadmapEntityId
} from '../domain/roadmap.js';
import { calculateBoardAttachmentBytes, getTaskAttachments, normalizeAttachmentRecord, removeLegacyTaskAttachmentsFromExtensions, setTaskAttachments } from '../domain/attachments.js';
import { cloneSerializable, createBoardStateSnapshot, getBoardExtensionsObject } from '../domain/serialize.js';
import {
    appendTimelineEvent,
    captureTaskTimelineSnapshot,
    ensureBoardTimelineBaseline,
    getBoardTimelineData,
    recordBoardRestoreTimelineEvent,
    recordTaskTimelineEvent
} from '../domain/timeline.js';
import { formatDateTime, formatDueDateForUi, normalizeDueDate } from '../domain/calendar.js';
import { assigneesToInput, checklistToInput, formatFileSize, nowIso } from '../domain/util.js';
import { enqueueProjectSave, getProjectSaveState, markProjectDirty } from '../persistence/projectFiles.js';
import { closeDialog, openDialog } from './dialogs.js';
import { notifyAppStateChanged, useAppStore } from '../state/store.js';
import {
    getPortfolioBulkTaskIds,
    getSelectedPortfolioTimelineView,
    isBoardInHistoricalPreview
} from '../selectors/portfolioViews.js';
import { refreshPortfolioState } from '../state/portfolioViewState.js';

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
 * validation, timeline bookkeeping, mutation guards, and dialog transitions.
 */
export function createPortfolioMutationActions({
    store = useAppStore,
    notify = store === useAppStore ? notifyAppStateChanged : noop,
    refresh = (options) => refreshPortfolioState({ store, notify, ...options }),
    enqueueSave = enqueueProjectSave,
    markDirty = markProjectDirty,
    getSaveState = getProjectSaveState,
    closeDialogFn = closeDialog,
    alert = defaultAlert,
    confirm = defaultConfirm,
    focusField = defaultFocusField
} = {}) {
    const getState = () => store.getState();

    function refreshViews(options = {}) {
        refresh({ store, ...options });
    }

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

    function setBulkSelection(boardId, taskIds) {
        const next = { ...(getState().portfolioBulkSelectionByBoardId || {}) };
        if (taskIds.length > 0) {
            next[boardId] = taskIds;
        } else {
            delete next[boardId];
        }
        commitState({ portfolioBulkSelectionByBoardId: next });
    }

    function clearPortfolioBulkSelection(boardId = '') {
        if (boardId) {
            setBulkSelection(boardId, []);
        } else {
            commitState({ portfolioBulkSelectionByBoardId: {} });
        }
    }

    function togglePortfolioTaskBulkSelection(boardId, taskId, checked) {
        const normalizedBoardId = String(boardId || '');
        if (!normalizedBoardId) return;
        const selection = getState().portfolioBulkSelectionByBoardId?.[normalizedBoardId] || [];
        const ids = new Set(selection.map((value) => Number(value)));
        if (checked) {
            ids.add(Number(taskId));
        } else {
            ids.delete(Number(taskId));
        }
        setBulkSelection(normalizedBoardId, [...ids]);
    }

    function getSelectedPortfolioBulkTaskIds(boardId) {
        return getPortfolioBulkTaskIds(getState(), boardId);
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

    function findPortfolioTaskDetailSource(boardId, taskId, options = {}) {
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

    function setSelectedPortfolioCard(boardId, taskId) {
        commitState({
            selectedPortfolioCardRef: boardId && taskId !== null && taskId !== undefined
                ? { boardId, taskId: Number(taskId) }
                : null
        });
    }

    function setHoveredPortfolioCard(boardId, taskId) {
        commitState({
            hoveredPortfolioCardRef: boardId && taskId !== null && taskId !== undefined
                ? { boardId, taskId: Number(taskId) }
                : null
        });
    }

    function buildRoadmapEntityOptions(items) {
        return (Array.isArray(items) ? items : []).map((item) => ({
            value: item.id,
            label: item.title
        }));
    }

    function buildRoadmapSprintOptions(items) {
        return (Array.isArray(items) ? items : []).map((item) => {
            const range = formatRoadmapDateRange(item);
            return { value: item.id, label: range ? `${item.title} • ${range}` : item.title };
        });
    }

    function getTaskAssigneeSuggestions(excludeNames = []) {
        const seen = new Set();
        const excluded = new Set(normalizeAssignees(excludeNames).map((name) => name.toLowerCase()));
        const values = [];
        const addName = (value) => {
            const name = normalizeAssignee(value);
            if (!name || excluded.has(name.toLowerCase()) || seen.has(name.toLowerCase())) return;
            seen.add(name.toLowerCase());
            values.push(name);
        };
        (getState().portfolioTasks || []).forEach((item) => taskAssignees(item?.task).forEach(addName));
        return values.sort((a, b) => a.localeCompare(b));
    }

    let taskEditorOpenCount = 0;

    function buildTaskEditorViewModel(boardRecord, task, options = {}) {
        taskEditorOpenCount += 1;
        const roadmap = getRoadmapExtension(boardRecord.data) || createEmptyRoadmapExtension();
        const phaseOptions = buildRoadmapEntityOptions(roadmap.phases);
        const milestoneOptions = buildRoadmapEntityOptions(roadmap.milestones);
        const knownRef = (optionList, value) => {
            const ref = normalizeRoadmapRef(value);
            return optionList.some((option) => option.value === ref) ? ref : '';
        };
        const normalized = task ? normalizeTask(task) : null;
        const initial = normalized
            ? {
                title: normalized.title || '',
                description: normalized.description || '',
                blocked: Boolean(normalized.blocked),
                blockerReason: normalized.blocked ? normalizeBlockerReason(normalized.blockerReason) : '',
                assignees: parseAssigneesInput(assigneesToInput(normalized.assignees)),
                tags: normalizeTags(normalized.tags),
                checklist: parseChecklistInput(checklistToInput(normalized.checklist || [])),
                attachments: getTaskAttachments(boardRecord.data, options.taskId)
                    .map(normalizeAttachmentRecord)
                    .filter(Boolean),
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

    function buildTaskDetailViewModel(source, taskId, readOnly) {
        const task = normalizeTask(source.task);
        const statusMap = Object.fromEntries((source.boardData.board.columns || []).map((column) => [column.status, column.title]));
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
            attachments: getTaskAttachments(source.boardData, taskId)
                .map(normalizeAttachmentRecord)
                .filter(Boolean)
                .map((item) => ({
                    id: item.id,
                    name: item.name,
                    isImage: item.kind === 'image',
                    dataUrl: item.dataUrl,
                    subLabel: `${formatFileSize(item.sizeBytes)}${item.mime ? ` • ${item.mime}` : ''}`
                }))
        };
    }

    function openPortfolioTaskDetails(boardId, taskId, options = {}) {
        const source = findPortfolioTaskDetailSource(boardId, taskId, options);
        if (!source) return;
        setSelectedPortfolioCard(boardId, taskId);
        const readOnly = options.readOnly === true || !canUsePortfolioTaskMutations(boardId);
        commitState({ portfolioDetailContext: { boardId, taskId, readOnly } });
        openDialog('taskDetail', buildTaskDetailViewModel(source, taskId, readOnly));
    }

    function reopenTaskDetails(boardId, taskId, options = {}) {
        openPortfolioTaskDetails(boardId, taskId, options);
    }

    function editPortfolioTask(boardId, taskId) {
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
        openDialog('taskEditor', buildTaskEditorViewModel(source.boardRecord, source.task, { taskId }));
    }

    function openPortfolioCreateTaskModal(boardId, preferredStatus, options = {}) {
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
        openDialog('taskEditor', buildTaskEditorViewModel(boardRecord, null, {
            preferredDueDate: options.preferredDueDate
        }));
    }

    function openRoadmapEntityModal(kind, itemId = '', options = {}) {
        const boardId = options.boardId || getState().selectedPortfolioBoardId;
        const boardRecord = boardId ? getBoardRecord(boardId) : null;
        if (!boardRecord) return;
        if (!canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return;
        }
        const config = getRoadmapEntityConfig(kind);
        if (!config) return;
        const roadmap = getRoadmapExtension(boardRecord.data) || createEmptyRoadmapExtension();
        const items = Array.isArray(roadmap[config.itemsKey]) ? roadmap[config.itemsKey] : [];
        const item = itemId ? items.find((entry) => entry.id === itemId) : null;
        const mode = options.mode || 'default';
        const assignExistingMode = mode === 'assign-sprint-from-selection';
        commitState({
            roadmapEntityContext: { boardId, kind, itemId: item?.id || '', mode }
        });
        openDialog('roadmapEntity', {
            kind,
            itemId: item?.id || '',
            mode,
            heading: mode === 'create-sprint-from-selection'
                ? 'Create Sprint'
                : assignExistingMode
                    ? 'Add to Existing Sprint'
                    : `${item ? 'Edit' : 'New'} ${config.label}`,
            saveLabel: assignExistingMode ? 'Add to Sprint' : 'Save Item',
            dateMode: config.dateMode,
            dateLabel: config.dateLabel || 'Date',
            showExistingSprint: assignExistingMode,
            initial: {
                title: item?.title || '',
                dueDate: item?.dueDate || '',
                startDate: item?.startDate || '',
                endDate: item?.endDate || ''
            },
            sprintOptions: buildRoadmapSprintOptions(roadmap.sprints || []),
            initialFocus: assignExistingMode ? 'existingSprint' : 'title'
        });
    }

    function isPortfolioBoardMutable(boardId) {
        return Boolean(getBoardRecord(boardId)?.handle);
    }

    function canUsePortfolioTaskMutations(boardId) {
        return isPortfolioBoardMutable(boardId) && !isBoardInHistoricalPreview(getState(), boardId);
    }

    function notifyPortfolioReadOnly() {
        alert('This project is read-only because it was loaded without a file handle.');
    }

    function notifyTimelinePreviewReadOnly() {
        alert('Historical preview is read-only. Click Latest to resume editing.');
    }

    function notifyPortfolioMutationUnavailable(boardId) {
        if (isBoardInHistoricalPreview(getState(), boardId)) {
            notifyTimelinePreviewReadOnly();
            return;
        }
        notifyPortfolioReadOnly();
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

    function closeRoadmapEntity() {
        commitState({ roadmapEntityContext: null });
        closeDialogFn('roadmapEntity');
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
            refreshViews();
            return;
        }

        const maxIndex = timeline.events.length - 1;
        const nextIndex = Math.max(0, Math.min(maxIndex, Number(eventIndex)));
        commitState({ portfolioTimelineSelection: { boardId, eventIndex: nextIndex } });
        closeTaskDetail();
        closeTaskEditor();
        refreshViews(options);
    }

    function movePortfolioTimelineToLatest(boardId = getState().selectedPortfolioBoardId) {
        if (!boardId) {
            clearPortfolioTimelineSelection();
            refreshViews();
            return;
        }
        const boardRecord = getBoardRecord(boardId);
        const timeline = getBoardTimelineData(boardRecord?.data);
        if (!timeline || timeline.events.length === 0) {
            clearPortfolioTimelineSelection();
            refreshViews();
            return;
        }

        commitState({ portfolioTimelineSelection: { boardId, eventIndex: timeline.events.length - 1 } });
        closeTaskDetail();
        closeTaskEditor();
        refreshViews();
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
        refreshViews();
    }

    function togglePortfolioTimelineExpanded(boardId = getState().selectedPortfolioBoardId) {
        if (!boardId) return;
        setPortfolioTimelineExpanded(
            boardId,
            getState().portfolioTimelineExpandedByBoardId[boardId] !== true
        );
    }

    function togglePortfolioRoadmapRowExpanded(boardId, key) {
        if (!boardId || !key) return;
        const expandedRows = getState().portfolioRoadmapExpandedRowsByBoardId?.[boardId] || {};
        const nextRows = { ...expandedRows, [key]: !expandedRows[key] };
        commitState({
            portfolioRoadmapExpandedRowsByBoardId: {
                ...(getState().portfolioRoadmapExpandedRowsByBoardId || {}),
                [boardId]: nextRows
            }
        });
        refreshViews();
    }

    function openPortfolioTaskDetailsForCalendar(boardId, taskId) {
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

    async function restorePortfolioTimelineSelection() {
        const viewState = getSelectedPortfolioTimelineView(getState());
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
        refreshViews();
        await enqueueSave(viewState.boardRecord);
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
        refreshViews();

        const detailContext = getState().portfolioDetailContext;
        if (
            detailContext?.boardId === boardId
            && Number(detailContext.taskId) === Number(taskId)
        ) {
            reopenTaskDetails(boardId, taskId);
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
        refreshViews();

        const detailContext = getState().portfolioDetailContext;
        if (detailContext?.boardId === boardId) {
            reopenTaskDetails(boardId, detailContext.taskId);
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

        refreshViews();
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
            refreshViews();
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
            refreshViews();
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
            refreshViews();
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
        refreshViews();
    }

    // The timer never affects rendering, so it lives here rather than in the store.
    let undoTimer = null;

    function showUndo(message, undoFn) {
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

    return {
        assignSelectionToExistingSprint,
        beginPortfolioTimelineSliderDrag,
        canUsePortfolioTaskMutations,
        clearPortfolioTimelineSelection,
        closeRoadmapEntity,
        closeTaskDetail,
        closeTaskEditor,
        createSprintFromSelection,
        deletePortfolioTask,
        deleteRoadmapEntity,
        editPortfolioTask,
        handleTimelineSliderPointerCommit,
        movePortfolioTaskToStatus,
        movePortfolioTimelineToLatest,
        notifyPortfolioMutationUnavailable,
        openPortfolioCreateTaskModal,
        openPortfolioTaskDetails,
        openPortfolioTaskDetailsForCalendar,
        openRoadmapEntityModal,
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
        togglePortfolioRoadmapRowExpanded,
        togglePortfolioTaskBulkSelection,
        togglePortfolioTimelineExpanded,
        toggleTaskDetailChecklistItem,
        setHoveredPortfolioCard,
        setSelectedPortfolioCard
    };
}

const activeActions = createPortfolioMutationActions();

export const assignSelectionToExistingSprint = (...args) => activeActions.assignSelectionToExistingSprint(...args);
export const beginPortfolioTimelineSliderDrag = (...args) => activeActions.beginPortfolioTimelineSliderDrag(...args);
export const canUsePortfolioTaskMutations = (...args) => activeActions.canUsePortfolioTaskMutations(...args);
export const clearPortfolioTimelineSelection = (...args) => activeActions.clearPortfolioTimelineSelection(...args);
export const closeRoadmapEntity = (...args) => activeActions.closeRoadmapEntity(...args);
export const closeTaskDetail = (...args) => activeActions.closeTaskDetail(...args);
export const closeTaskEditor = (...args) => activeActions.closeTaskEditor(...args);
export const createSprintFromSelection = (...args) => activeActions.createSprintFromSelection(...args);
export const deletePortfolioTask = (...args) => activeActions.deletePortfolioTask(...args);
export const deleteRoadmapEntity = (...args) => activeActions.deleteRoadmapEntity(...args);
export const editPortfolioTask = (...args) => activeActions.editPortfolioTask(...args);
export const handleTimelineSliderPointerCommit = (...args) => activeActions.handleTimelineSliderPointerCommit(...args);
export const movePortfolioTaskToStatus = (...args) => activeActions.movePortfolioTaskToStatus(...args);
export const movePortfolioTimelineToLatest = (...args) => activeActions.movePortfolioTimelineToLatest(...args);
export const notifyPortfolioMutationUnavailable = (...args) => activeActions.notifyPortfolioMutationUnavailable(...args);
export const openPortfolioCreateTaskModal = (...args) => activeActions.openPortfolioCreateTaskModal(...args);
export const openPortfolioTaskDetails = (...args) => activeActions.openPortfolioTaskDetails(...args);
export const openPortfolioTaskDetailsForCalendar = (...args) => activeActions.openPortfolioTaskDetailsForCalendar(...args);
export const openRoadmapEntityModal = (...args) => activeActions.openRoadmapEntityModal(...args);
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
export const togglePortfolioRoadmapRowExpanded = (...args) => activeActions.togglePortfolioRoadmapRowExpanded(...args);
export const togglePortfolioTaskBulkSelection = (...args) => activeActions.togglePortfolioTaskBulkSelection(...args);
export const togglePortfolioTimelineExpanded = (...args) => activeActions.togglePortfolioTimelineExpanded(...args);
export const toggleTaskDetailChecklistItem = (...args) => activeActions.toggleTaskDetailChecklistItem(...args);
export const setHoveredPortfolioCard = (...args) => activeActions.setHoveredPortfolioCard(...args);
export const setSelectedPortfolioCard = (...args) => activeActions.setSelectedPortfolioCard(...args);
