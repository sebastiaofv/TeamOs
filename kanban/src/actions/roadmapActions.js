// Roadmap editing, sprint assignment, and row expansion.

import { touchTask } from '../domain/task.js';
import {
    createEmptyRoadmapExtension,
    formatRoadmapDateRange,
    getRoadmapEntityConfig,
    getRoadmapExtension,
    getRoadmapExtensionObject,
    normalizeRoadmapDate,
    normalizeRoadmapRef,
    slugifyRoadmapEntityId,
} from '../domain/roadmap.js';

import { cloneSerializable, createBoardStateSnapshot } from '../domain/serialize.js';
import { appendTimelineEvent } from '../domain/timeline.js';

import { nowIso } from '../domain/util.js';

export function createRoadmapActions({ getState, commitState, getBoardRecord, canUsePortfolioTaskMutations,
    notifyPortfolioMutationUnavailable, runPortfolioBoardMutation, alert, confirm, closeDialogFn, openDialogFn },
    { getSelectedPortfolioBulkTaskIds, clearPortfolioBulkSelection }) {
    function buildRoadmapSprintOptions(items) {
        return (Array.isArray(items) ? items : []).map((item) => {
            const range = formatRoadmapDateRange(item);
            return { value: item.id, label: range ? `${item.title} • ${range}` : item.title };
        });
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
        openDialogFn('roadmapEntity', {
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

    function closeRoadmapEntity() {
        commitState({ roadmapEntityContext: null });
        closeDialogFn('roadmapEntity');
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
                return { focusField: 'existingSprintId' };
            }
            const changed = await assignSelectionToExistingSprint(context.boardId, draft.existingSprintId);
            if (!changed) return;
            closeRoadmapEntity();
            clearPortfolioBulkSelection(context.boardId);
            return;
        }
        if (!draft.title) {
            return { focusField: 'title' };
        }
        if (config.dateMode === 'single' && !draft.dueDate) {
            await alert(`${config.label} requires a valid due date.`);
            return { focusField: 'dueDate' };
        }
        if (config.dateMode === 'range' && (!draft.startDate || !draft.endDate)) {
            await alert(`${config.label} requires valid start and end dates.`);
            return { focusField: 'startDate' };
        }
        if (context.mode === 'create-sprint-from-selection') {
            const changed = await createSprintFromSelection(context.boardId, draft);
            if (!changed) return;
            closeRoadmapEntity();
            clearPortfolioBulkSelection(context.boardId);
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
        const confirmed = await confirm(`Delete "${item.title}"? Linked task references will be cleared.`, {
            title: `Delete ${config.label.toLowerCase()}`,
            confirmLabel: 'Delete',
            danger: true
        });
        if (!confirmed) return;

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
    return {
        openRoadmapEntityModal,
        closeRoadmapEntity,
        togglePortfolioRoadmapRowExpanded,
        saveRoadmapEntity,
        deleteRoadmapEntity,
    };
}
