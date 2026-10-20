// Roadmap editing, sprint assignment, and row expansion.

import type { RoadmapItem, RoadmapKind } from '@/domain/types';
import type { RoadmapEntityMode, SelectOption } from '@/features/portfolio/types';
import type { BoardMutationContext } from './mutationContext';
import type { BoardInteractions } from './boardCommands';
import { touchTask } from '@/domain/task';
import {
    createEmptyRoadmapExtension,
    formatRoadmapDateRange,
    getRoadmapEntityConfig,
    getRoadmapExtension,
    getRoadmapExtensionObject,
    getSprintCalendarStatus,
    normalizeRoadmapDate,
    normalizeRoadmapRef,
    parseRoadmapIsoDate,
    slugifyRoadmapEntityId,
} from '@/domain/roadmap';

import { cloneSerializable, createBoardStateSnapshot } from '@/domain/serialize';
import { appendTimelineEvent } from '@/domain/timeline';

import { nowIso, todayLocalIsoDate } from '@/domain/util';
import { getSprintCatalog, registerSprintCreation } from '@/domain/sprintCatalog';
import { getCurrentLanguage, translateCurrent, translateTimeline } from '@/shared/i18n';
import { buildAssignableSprintOptions } from '@/features/portfolio/queries/sprintPlanning';
import { deletePlanningGroup, isLeafPhase, phaseDescendants, updatePhase } from '@/domain/phaseTree';

export type RoadmapFocusField = 'existingSprintId' | 'title' | 'dueDate' | 'startDate' | 'endDate';

export type RoadmapEntityInput = Partial<Record<'kind' | 'itemId' | 'title' | 'existingSprintId' | 'dueDate' | 'startDate' | 'endDate' | 'parentId', unknown>>;

type RoadmapEntityDraft = {
    kind: unknown;
    itemId: string;
    title: string;
    existingSprintId: string;
    dueDate: string;
    startDate: string;
    endDate: string;
    parentId: string;
};

export function createRoadmapActions({ getState, commitState, getBoardRecord, canUsePortfolioTaskMutations,
    notifyPortfolioMutationUnavailable, runPortfolioBoardMutation, runPortfolioTaskMutation, alert, confirm, choose, closeDialogFn, openDialogFn }: BoardMutationContext,
{ getSelectedPortfolioBulkTaskIds, clearPortfolioBulkSelection }: Pick<BoardInteractions, 'getSelectedPortfolioBulkTaskIds' | 'clearPortfolioBulkSelection'>) {
    const getRoadmapLabel = (kind: RoadmapKind, tr: typeof translateCurrent = translateCurrent): string => kind === 'milestones'
        ? tr('roadmap.milestone')
        : kind === 'phases'
            ? tr('roadmap.phase')
            : tr('roadmap.sprint');

    function buildRoadmapSprintOptions(items: RoadmapItem[] | null | undefined): SelectOption[] {
        return (Array.isArray(items) ? items : []).map((item) => {
            const range = formatRoadmapDateRange(item, getCurrentLanguage());
            return { value: item.id, label: range ? `${item.title} • ${range}` : item.title };
        });
    }

    function openRoadmapEntityModal(kind: RoadmapKind, itemId = '', options: { boardId?: string; mode?: RoadmapEntityMode; unplannedTaskIds?: number[] } = {}) {
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
            roadmapEntityContext: { boardId, kind, itemId: item?.id || '', mode,
                ...(options.unplannedTaskIds ? { unplannedTaskIds: [...new Set(options.unplannedTaskIds)] } : {}) }
        });
        openDialogFn('roadmapEntity', {
            kind,
            itemId: item?.id || '',
            mode,
            heading: mode === 'create-sprint-from-selection'
                ? translateCurrent('toolbar.createSprint')
                : assignExistingMode
                    ? translateCurrent('toolbar.addToExistingSprint')
                    : `${item ? translateCurrent('common.edit') : translateCurrent('common.new')} ${getRoadmapLabel(kind)}`,
            saveLabel: assignExistingMode ? translateCurrent('roadmapDialog.addToSprint') : translateCurrent('roadmapDialog.saveItem'),
            dateMode: config.dateMode,
            dateLabel: config.dateMode === 'single' ? translateCurrent('roadmapDialog.dueDate') : (config.dateLabel || ''),
            showExistingSprint: assignExistingMode,
            initial: {
                title: item?.title || '',
                dueDate: item?.dueDate || '',
                startDate: item?.startDate || '',
                endDate: item?.endDate || ''
            },
            parentId: item?.parentId || '',
            phaseOptions: roadmap.phases.filter((phase) => !item || !phaseDescendants(roadmap.phases, item.id).has(phase.id)).map((phase) => ({ value: phase.id, label: phase.title })),
            phases: roadmap.phases,
            datesCalculated: kind === 'phases' && roadmap.phases.some((phase) => phase.parentId === itemId),
            sprintOptions: assignExistingMode
                ? buildAssignableSprintOptions(boardRecord.data, todayLocalIsoDate(), getCurrentLanguage())
                : buildRoadmapSprintOptions(roadmap.sprints || []),
            initialFocus: assignExistingMode ? 'existingSprint' : 'title'
        });
    }

    function closeRoadmapEntity() {
        commitState({ roadmapEntityContext: null });
        closeDialogFn('roadmapEntity');
    }

    function togglePortfolioRoadmapRowExpanded(boardId: string, key: string) {
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

    function createSprintFromSelection(boardId: string, draft: RoadmapEntityDraft): Promise<boolean> | false {
        const boardRecord = getBoardRecord(boardId);
        if (!boardRecord) return false;
        const unplannedTaskIds = getState().roadmapEntityContext?.unplannedTaskIds;
        const selectedTaskIds = unplannedTaskIds || getSelectedPortfolioBulkTaskIds(boardId);
        if (selectedTaskIds.length === 0) return false;
        if (unplannedTaskIds && selectedTaskIds.some((id) => !boardRecord.data.board.tasks.some((task) => task.id === id && task.status !== 'done' && !task.sprintId))) {
            alert(translateCurrent('table.selectionChanged'));
            return false;
        }
        const sprintConfig = getRoadmapEntityConfig('sprints');
        if (!sprintConfig) return false;
        return runPortfolioBoardMutation(boardId, (boardData) => {
            const roadmap = getRoadmapExtensionObject(boardData, { create: true });
            const items = roadmap[sprintConfig.itemsKey];
            const nextSprint: RoadmapItem = {
                id: slugifyRoadmapEntityId(draft.title, getSprintCatalog(boardData).entries.map((entry) => ({ id: entry.sprintId }))),
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

            registerSprintCreation(boardData, nextSprint.id, timestamp);
            items.push(nextSprint);
            appendTimelineEvent(boardData, {
                kind: 'roadmap.bulk-assigned',
                entityType: 'board',
                entityId: 'board',
                summary: translateTimeline('roadmap.sprintCreatedSummary', {
                    count: assignedCount,
                    tasks: assignedCount === 1 ? translateTimeline('common.task') : translateTimeline('common.tasks'),
                    title: nextSprint.title
                }),
                meta: {
                    roadmapKind: 'sprints',
                    roadmapItemId: nextSprint.id,
                    action: 'create-from-selection',
                    sprint: cloneSerializable(nextSprint),
                    sprintCatalog: cloneSerializable(boardData.extensions.sprintCatalog),
                    taskIds: [...taskIdSet]
                }
            });
            return true;
        });
    }

    function assignSelectionToExistingSprint(boardId: string, sprintId: unknown): Promise<boolean> | false {
        const boardRecord = getBoardRecord(boardId);
        if (!boardRecord) return false;
        const normalizedSprintId = normalizeRoadmapRef(sprintId);
        const unplannedTaskIds = getState().roadmapEntityContext?.unplannedTaskIds;
        const selectedTaskIds = unplannedTaskIds || getSelectedPortfolioBulkTaskIds(boardId);
        if (!normalizedSprintId || selectedTaskIds.length === 0) return false;
        return runPortfolioBoardMutation(boardId, (boardData) => {
            const roadmap = getRoadmapExtension(boardData) || createEmptyRoadmapExtension();
            const sprint = Array.isArray(roadmap.sprints)
                ? roadmap.sprints.find((entry) => entry.id === normalizedSprintId)
                : null;
            if (!sprint || getSprintCalendarStatus(sprint, todayLocalIsoDate()) === 'done') {
                alert(translateCurrent('roadmapDialog.sprintUnavailable'));
                return false;
            }
            if (unplannedTaskIds && selectedTaskIds.some((id) => !boardData.board.tasks.some((task) => task.id === id && task.status !== 'done' && !task.sprintId))) {
                alert(translateCurrent('table.selectionChanged'));
                return false;
            }

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
                summary: translateTimeline('roadmap.sprintAssignedSummary', {
                    count: assignedCount,
                    tasks: assignedCount === 1 ? translateTimeline('common.task') : translateTimeline('common.tasks'),
                    title: sprint.title
                }),
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

    async function saveRoadmapEntity(input: RoadmapEntityInput = {}): Promise<{ focusField: RoadmapFocusField } | undefined> {
        const draft: RoadmapEntityDraft = {
            kind: input.kind,
            itemId: normalizeRoadmapRef(input.itemId),
            title: String(input.title || '').trim(),
            existingSprintId: normalizeRoadmapRef(input.existingSprintId),
            dueDate: normalizeRoadmapDate(input.dueDate),
            startDate: normalizeRoadmapDate(input.startDate),
            endDate: normalizeRoadmapDate(input.endDate),
            parentId: normalizeRoadmapRef(input.parentId)
        };
        const context = getState().roadmapEntityContext;
        if (!context?.boardId) return;
        const config = getRoadmapEntityConfig(draft.kind);
        if (!config) return;
        if (draft.kind !== context.kind) return;
        if (context.kind === 'phases') {
            const phases = getRoadmapExtension(getBoardRecord(context.boardId)?.data)?.phases || [];
            if (draft.parentId && (!phases.some((phase) => phase.id === draft.parentId) || (draft.itemId && phaseDescendants(phases, draft.itemId).has(draft.parentId)))) {
                await alert(translateCurrent('roadmap.invalidParent')); return;
            }
        }

        if (context.mode === 'assign-sprint-from-selection') {
            if (!draft.existingSprintId) {
                return { focusField: 'existingSprintId' };
            }
            const changed = await assignSelectionToExistingSprint(context.boardId, draft.existingSprintId);
            if (!changed) return;
            closeRoadmapEntity();
            if (!context.unplannedTaskIds) clearPortfolioBulkSelection(context.boardId);
            return;
        }
        if (!draft.title) {
            return { focusField: 'title' };
        }
        if (config.dateMode === 'single' && !draft.dueDate) {
            await alert(translateCurrent('roadmap.dateRequiredSingle', { label: getRoadmapLabel(context.kind) }));
            return { focusField: 'dueDate' };
        }
        if (config.dateMode === 'range' && (!draft.startDate || !draft.endDate)) {
            await alert(translateCurrent('roadmap.dateRequiredRange', { label: getRoadmapLabel(context.kind) }));
            return { focusField: 'startDate' };
        }
        if (config.dateMode === 'range') {
            const start = parseRoadmapIsoDate(draft.startDate);
            const end = parseRoadmapIsoDate(draft.endDate);
            if (!start || !end || start > end) {
                await alert(translateCurrent('roadmap.dateOrderInvalid'));
                return { focusField: 'endDate' };
            }
        }
        if (context.mode === 'create-sprint-from-selection') {
            const changed = await createSprintFromSelection(context.boardId, draft);
            if (!changed) return;
            closeRoadmapEntity();
            if (!context.unplannedTaskIds) clearPortfolioBulkSelection(context.boardId);
            return;
        }

        let relocation: string | undefined;
        if (context.kind === 'phases' && draft.parentId) {
            const data = getBoardRecord(context.boardId)?.data;
            const roadmap = getRoadmapExtension(data);
            const affected = data?.board.tasks.filter((task) => task.phaseId === draft.parentId) || [];
            if (affected.length && roadmap) {
                const id = draft.itemId || slugifyRoadmapEntityId(draft.title, roadmap.phases);
                const phases = roadmap.phases.filter((phase) => phase.id !== id).concat({ id, title: draft.title, parentId: draft.parentId });
                const branch = phaseDescendants(phases, id);
                const choice = await choose(translateCurrent('roadmap.reassignImpact', { count: affected.length }), [
                    { value: '', label: translateCurrent('roadmap.clearAssignments') },
                    ...phases.filter((phase) => branch.has(phase.id) && isLeafPhase(phases, phase.id)).map((phase) => ({ value: phase.id, label: phase.title }))
                ]);
                if (choice === null) return;
                relocation = choice;
            }
        }
        const changed = await runPortfolioBoardMutation(context.boardId, (boardData) => {
            const roadmap = getRoadmapExtensionObject(boardData, { create: true });
            const items = roadmap[config.itemsKey];
            const index = draft.itemId ? items.findIndex((item) => item.id === draft.itemId) : -1;
            const reservedIds = context.kind === 'sprints' ? getSprintCatalog(boardData).entries.map((entry) => ({ id: entry.sprintId })) : items;
            const nextId = draft.itemId || slugifyRoadmapEntityId(draft.title, reservedIds);
            const previousItem = index >= 0 ? items[index] : null;
            const nextItem: RoadmapItem = config.dateMode === 'single'
                ? { id: nextId, title: draft.title, dueDate: draft.dueDate }
                : { id: nextId, title: draft.title, startDate: draft.startDate, endDate: draft.endDate };
            if (previousItem && JSON.stringify(previousItem) === JSON.stringify(nextItem)) return false;

            if (context.kind === 'phases') {
                if (draft.parentId) nextItem.parentId = draft.parentId;
                updatePhase(boardData, nextItem, relocation);
            } else if (index >= 0) {
                items[index] = nextItem;
            } else {
                if (context.kind === 'sprints') registerSprintCreation(boardData, nextId, nowIso());
                items.push(nextItem);
            }

            appendTimelineEvent(boardData, {
                kind: 'roadmap.updated',
                entityType: 'board',
                entityId: 'board',
                summary: translateTimeline('roadmap.entityUpdatedSummary', {
                    label: getRoadmapLabel(context.kind, translateTimeline),
                    action: index >= 0 ? translateTimeline('roadmap.updated') : translateTimeline('roadmap.created'),
                    title: nextItem.title
                }),
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

    async function deleteRoadmapEntity(kind: RoadmapKind, itemId: string) {
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
        if (kind === 'phases' && roadmap.phases.some((phase) => phase.parentId === itemId)) { await alert(translateCurrent('roadmap.hasChildren')); return; }
        const label = getRoadmapLabel(kind);
        const confirmed = await confirm(translateCurrent(kind === 'sprints' ? 'roadmap.deleteQuestion' : 'roadmap.deletePlanningQuestion', { title: item.title }), {
            title: translateCurrent('roadmap.deleteTitle', { label: label.toLowerCase() }),
            confirmLabel: translateCurrent('common.delete'),
            danger: true
        });
        if (!confirmed) return;
        const affected = boardRecord.data.board.tasks.filter((task) => task[config.taskField] === itemId);
        let relocation: string | undefined;
        if (kind !== 'sprints' && affected.length) {
            const choice = await choose(translateCurrent('roadmap.reassignImpact', { count: affected.length }), [
                { value: '', label: translateCurrent('roadmap.clearAssignments') },
                ...roadmap[kind].filter((target) => target.id !== itemId && (kind !== 'phases' || isLeafPhase(roadmap.phases, target.id))).map((target) => ({ value: target.id, label: target.title }))
            ]);
            if (choice === null) return;
            relocation = choice;
        }

        await runPortfolioBoardMutation(boardId, (boardData) => {
            const mutableRoadmap = getRoadmapExtensionObject(boardData, { create: true });
            const items = mutableRoadmap[config.itemsKey];
            const index = items.findIndex((entry) => entry.id === itemId);
            if (index === -1) return false;
            const removed = items[index];
            if (kind !== 'sprints') deletePlanningGroup(boardData, kind, itemId, relocation);
            else items.splice(index, 1);
            const tasks = Array.isArray(boardData.board?.tasks) ? boardData.board.tasks : [];
            tasks.forEach((task) => {
                if (normalizeRoadmapRef(task[config.taskField]) !== removed.id) return;
                task[config.taskField] = relocation || '';
                touchTask(task);
            });
            appendTimelineEvent(boardData, {
                kind: 'roadmap.updated',
                entityType: 'board',
                entityId: 'board',
                summary: translateTimeline('roadmap.entityUpdatedSummary', {
                    label: getRoadmapLabel(kind, translateTimeline),
                    action: translateTimeline('roadmap.deleted'),
                    title: removed.title
                }),
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
        setPortfolioTaskPlanning(boardId: string, taskId: number, field: 'phaseId' | 'milestoneId', value: string) {
            return runPortfolioTaskMutation(boardId, taskId, (task, draft) => {
                const roadmap = getRoadmapExtension(draft.data);
                if (value && (!roadmap || (field === 'phaseId' ? !isLeafPhase(roadmap.phases, value) : !roadmap.milestones.some((item) => item.id === value)))) throw new Error(translateCurrent('roadmap.invalidAssignment'));
                if (task[field] === value) return false;
                task[field] = value;
                return true;
            });
        },
        openRoadmapEntityModal,
        closeRoadmapEntity,
        togglePortfolioRoadmapRowExpanded,
        saveRoadmapEntity,
        deleteRoadmapEntity,
    };
}
