import { resolveHierarchyAutomations } from './hierarchyAutomationChanges';
import { workitemReviewRow } from './workitemReview';
import { formatDate } from '@/domain/dates';
import { closeSprint, startSprint } from '@/domain/sprintResults';
import { addBusinessDays, businessDaysBetween } from '@/domain/businessDays';
import type { BoardData, SprintStatus } from '@/domain/types';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries/portfolioTimelineViews';
import { controlRecords, saveControlRecord } from '@/domain/projectControl';
import { workitemLabel } from '@/domain/taskIdentity';
import { eligibleSprint, hasPendingWork, isPlanningUnit, WorkitemError } from '@/domain/workitems';
// Roadmap editing, sprint assignment, and row expansion.

import type { RoadmapItem, RoadmapKind, Task } from '@/domain/types';
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
    getSprintStatus,
    normalizeRoadmapDate,
    normalizeRoadmapRef,
    parseRoadmapIsoDate,
    slugifyRoadmapEntityId,
    isValidRoadmapAssignment,
} from '@/domain/roadmap';

import { cloneSerializable, createBoardStateSnapshot } from '@/domain/serialize';
import { appendTimelineEvent, ensureBoardTimelineBaseline } from '@/domain/timeline';

import { nowIso, todayLocalIsoDate } from '@/domain/util';
import { getSprintCatalog, registerSprintCreation } from '@/domain/sprintCatalog';
import { getCurrentLanguage, translateCurrent, translateTimeline } from '@/shared/i18n';
import { buildAssignableSprintOptions } from '@/features/portfolio/queries/sprintPlanning';
import { deletePlanningGroup, isLeafPhase, phaseDescendants, updatePhase } from '@/domain/phaseTree';
import { isMilestoneColor, milestoneColor, nextMilestoneColor } from '@/domain/milestonePresentation';

export type RoadmapFocusField = 'existingSprintId' | 'title' | 'dueDate' | 'startDate' | 'endDate';

export type RoadmapEntityInput = { controlIds?: string[]; controlAuthor?: string } & Partial<Record<'kind' | 'itemId' | 'title' | 'existingSprintId' | 'dueDate' | 'startDate' | 'endDate' | 'parentId' | 'color' | 'objective' | 'status' | 'goal' | 'capacity' | 'review' | 'retrospective', unknown>>;

type RoadmapEntityDraft = {
    kind: unknown;
    itemId: string;
    title: string;
    existingSprintId: string;
    dueDate: string;
    startDate: string;
    endDate: string;
    parentId: string;
    status: SprintStatus;
    goal: string;
    capacity: number | null;
    review: string;
    retrospective: string;
};

export function createRoadmapActions({ getState, commitState, getBoardRecord, canUsePortfolioTaskMutations,
    notifyPortfolioMutationUnavailable, runPortfolioBoardMutation, runPortfolioTaskMutation, alert, confirm, choose, prompt, closeDialogFn, openDialogFn }: BoardMutationContext,
{ getSelectedPortfolioBulkTaskIds, clearPortfolioBulkSelection }: Pick<BoardInteractions, 'getSelectedPortfolioBulkTaskIds' | 'clearPortfolioBulkSelection'>) {
    const impactText = (tasks: Task[]) => tasks.length ? `\n\n${tasks.map((task) => `${workitemLabel(task)} · ${task.title}`).join('\n')}` : '';
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
        if (!itemId && !canUsePortfolioTaskMutations(boardId)) {
            notifyPortfolioMutationUnavailable(boardId);
            return;
        }
        const config = getRoadmapEntityConfig(kind);
        if (!config) return;
        const preview = getSelectedPortfolioTimelineView(getState());
        const boardData = preview?.boardRecord.id === boardId && preview.isPreview ? preview.projectedBoard || boardRecord.data : boardRecord.data;
        const roadmap = getRoadmapExtension(boardData) || createEmptyRoadmapExtension();
        const items = Array.isArray(roadmap[config.itemsKey]) ? roadmap[config.itemsKey] : [];
        const item = itemId ? items.find((entry) => entry.id === itemId) : null;
        const mode = options.mode || 'default';
        const assignExistingMode = mode === 'assign-sprint-from-selection';
        commitState({
            roadmapEntityContext: { boardId, kind, itemId: item?.id || '', mode,
                ...(options.unplannedTaskIds ? { unplannedTaskIds: [...new Set(options.unplannedTaskIds)] } : {}) }
        });
        openDialogFn('roadmapEntity', {
            boardId, boardData, readOnly: !canUsePortfolioTaskMutations(boardId),
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
                ...(kind === 'sprints' ? { status: item ? getSprintStatus(item) : 'planned', goal: item?.goal || '', capacity: item?.capacity ?? null, review: item?.review || '', retrospective: item?.retrospective || '' } : {}),
                objective: item?.objective || '',
                dueDate: item?.dueDate || '',
                startDate: item?.startDate || '',
                endDate: item?.endDate || '',
                ...(kind !== 'sprints' ? { color: item ? milestoneColor(item, items.indexOf(item)) : nextMilestoneColor(items) } : {})
            },
            parentId: item?.parentId || '',
            phaseOptions: roadmap.phases.filter((phase) => kind !== 'phases' || !item || !phaseDescendants(roadmap.phases, item.id).has(phase.id)).map((phase) => ({ value: phase.id, label: phase.title })),
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
        if (unplannedTaskIds && selectedTaskIds.some((id) => !boardRecord.data.board.tasks.some((task) => task.id === id && hasPendingWork(boardRecord.data, task) && !task.sprintId))) {
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
                endDate: draft.endDate,
                status: 'planned', goal: draft.goal, capacity: draft.capacity, review: draft.review, retrospective: draft.retrospective,
                ...(draft.parentId ? { parentId: draft.parentId } : {})
            };
            const taskIdSet = new Set(selectedTaskIds.map((taskId) => Number(taskId)));
            let assignedCount = 0;
            const timestamp = nowIso();

            boardData.board.tasks.forEach((task) => {
                if (!taskIdSet.has(Number(task?.id))) return;
                if (!isPlanningUnit(boardData, task)) throw new WorkitemError('sprint');
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
        }, { confirmSprintAllocation: false, onMutated: () => {
            // The Sprint already exists locally; do not leave its creation form
            // open during file saves or allow a retry to create it a second time.
            closeRoadmapEntity();
            if (!unplannedTaskIds) clearPortfolioBulkSelection(boardId);
        } });
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
            if (!sprint || !eligibleSprint(boardData, sprint.id)) {
                alert(translateCurrent('roadmapDialog.sprintUnavailable'));
                return false;
            }
            if (unplannedTaskIds && selectedTaskIds.some((id) => !boardData.board.tasks.some((task) => task.id === id && hasPendingWork(boardData, task) && !task.sprintId))) {
                alert(translateCurrent('table.selectionChanged'));
                return false;
            }

            const taskIdSet = new Set(selectedTaskIds.map((taskId) => Number(taskId)));
            let assignedCount = 0;
            const timestamp = nowIso();
            boardData.board.tasks.forEach((task) => {
                if (!taskIdSet.has(Number(task?.id))) return;
                if (!isPlanningUnit(boardData, task)) throw new WorkitemError('sprint');
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

    // Asks which end date a Sprint should keep once its start moves to today:
    // the one that preserves the planned duration in business days, the
    // planned one, or a date the user enters. Resolves null when cancelled.
    async function chooseSprintEndDate(plannedStart: string, plannedEnd: string, newStart: string): Promise<string | null> {
        const duration = businessDaysBetween(plannedStart, plannedEnd);
        const recalculated = duration === null ? '' : addBusinessDays(newStart, duration);
        if (recalculated && recalculated === plannedEnd) return plannedEnd;
        const choice = await choose(recalculated
            ? translateCurrent('sprint.endDateAfterStart', { start: formatDate(newStart), days: duration ?? 0, end: formatDate(recalculated), planned: formatDate(plannedEnd) })
            : translateCurrent('sprint.endDateAfterStartNoDuration', { start: formatDate(newStart), planned: formatDate(plannedEnd) }), [
            ...(recalculated ? [{ value: 'recalculate', label: translateCurrent('sprint.useRecalculatedEnd', { end: formatDate(recalculated) }), primary: true }] : []),
            { value: 'keep', label: translateCurrent('sprint.keepPlannedEnd', { end: formatDate(plannedEnd) }) },
            { value: 'custom', label: translateCurrent('sprint.enterEndDate') }
        ]);
        if (choice === null) return null;
        if (choice === 'recalculate') return recalculated;
        if (choice === 'keep') return plannedEnd;
        let value = recalculated || plannedEnd;
        for (;;) {
            const entered = await prompt(translateCurrent('sprint.enterEndDateQuestion', { start: formatDate(newStart) }), value, { inputType: 'date', required: true, title: translateCurrent('roadmapDialog.endDate') });
            if (entered === null) return null;
            const endDate = normalizeRoadmapDate(entered);
            if (endDate && endDate >= newStart) return endDate;
            value = entered;
            await alert(translateCurrent('roadmap.dateOrderInvalid'));
        }
    }

    async function prepareSprintDates(draft: { status: SprintStatus; startDate: string; endDate: string }, previousStatus: SprintStatus): Promise<boolean> {
        if (draft.status === previousStatus || draft.status === 'planned') return true;
        if (draft.status === 'done') {
            const today = todayLocalIsoDate();
            if (draft.endDate !== today) {
                const choice = await choose(translateCurrent('sprint.updateEnd', { today: formatDate(today) }), [
                    { value: 'today', label: translateCurrent('sprint.useToday') },
                    { value: 'keep', label: translateCurrent('sprint.keepDate') }
                ], { title: translateCurrent('roadmapDialog.endDate') });
                if (choice === null) return false;
                if (choice === 'today') draft.endDate = today;
            }
            if (draft.startDate > draft.endDate) { await alert(translateCurrent('roadmap.dateOrderInvalid')); return false; }
            return true;
        }
        const today = todayLocalIsoDate();
        if (draft.startDate !== today) {
            const choice = await choose(translateCurrent('sprint.updateStart', { today }), [
                { value: 'today', label: translateCurrent('sprint.useToday') },
                { value: 'keep', label: translateCurrent('sprint.keepDate') }
            ]);
            if (choice === null) return false;
            if (choice === 'today') {
                const endDate = await chooseSprintEndDate(draft.startDate, draft.endDate, today);
                if (endDate === null) return false;
                draft.endDate = endDate;
                draft.startDate = today;
            }
        }
        if (draft.startDate > draft.endDate) { await alert(translateCurrent('roadmap.dateOrderInvalid')); return false; }
        return true;
    }

    async function prepareSprintClosure(boardId: string, sprintId: string, finalSprint: RoadmapItem): Promise<BoardData | null> {
        const current = getBoardRecord(boardId)?.data;
        if (!current) return null;
        const preview = cloneSerializable(current);
        ensureBoardTimelineBaseline(preview);
        closeSprint(preview, sprintId, finalSprint);
        const review = resolveHierarchyAutomations(preview, current, confirm);
        if (review) await review;
        const returning = preview.board.tasks.filter((task) => current.board.tasks.some((before) => before.id === task.id && before.sprintId === sprintId) && isPlanningUnit(preview, task) && hasPendingWork(preview, task));
        if (returning.length) await confirm(translateCurrent('sprint.backlogInfo'), {
            title: translateCurrent('sprint.finish'), informational: true,
            workitems: { heading: 'Backlog', rows: returning.map((task) => workitemReviewRow(task, 'Sprint', finalSprint.title, 'Backlog')) }
        });
        if (getBoardRecord(boardId)?.data !== current) { await alert(translateCurrent('roadmap.impactChanged')); return null; }
        return preview;
    }

    async function changeSprintStatus(boardId: string, sprintId: string, status: SprintStatus) {
        if (!canUsePortfolioTaskMutations(boardId)) { notifyPortfolioMutationUnavailable(boardId); return; }
        const current = getBoardRecord(boardId)?.data;
        const sprint = getRoadmapExtension(current)?.sprints.find((item) => item.id === sprintId);
        if (!sprint || getSprintStatus(sprint) === status) return;
        const next = { ...sprint, status, startDate: sprint.startDate || '', endDate: sprint.endDate || '' };
        if (!(await prepareSprintDates(next, getSprintStatus(sprint)))) return;
        const closure = status === 'done' ? await prepareSprintClosure(boardId, sprintId, next) : null;
        if (status === 'done' && !closure) return;
        if (getBoardRecord(boardId)?.data !== current) { await alert(translateCurrent('roadmap.impactChanged')); return; }
        return runPortfolioBoardMutation(boardId, (data) => {
            if (closure) Object.assign(data, closure);
            const roadmap = getRoadmapExtensionObject(data, { create: true });
            const index = roadmap.sprints.findIndex((item) => item.id === sprintId);
            if (index < 0) return false;
            if (status === 'active') startSprint(data, sprintId);
            roadmap.sprints[index] = next;
            appendTimelineEvent(data, { kind: 'roadmap.updated', entityType: 'board', entityId: 'board', summary: `${next.title}: ${status}`, snapshot: createBoardStateSnapshot(data), meta: { roadmapKind: 'sprints', roadmapItemId: sprintId, action: status } });
            return true;
        }, { confirmSprintAllocation: status !== 'done' });
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
            parentId: normalizeRoadmapRef(input.parentId),
            status: input.status === 'active' || input.status === 'done' ? input.status : 'planned',
            goal: String(input.goal || ''), capacity: input.capacity === '' || input.capacity == null ? null : Number(input.capacity),
            review: String(input.review || ''), retrospective: String(input.retrospective || '')
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
        let closingSprint = false;
        let closure: BoardData | null = null;
        if (context.kind === 'sprints') {
            if (draft.capacity !== null && (!Number.isFinite(draft.capacity) || draft.capacity < 0)) { await alert(translateCurrent('sprint.invalidCapacity')); return; }
            const data = getBoardRecord(context.boardId)?.data;
            const previous = getRoadmapExtension(data)?.sprints.find((item) => item.id === draft.itemId);
            draft.status = previous ? (input.status === undefined ? getSprintStatus(previous) : draft.status) : 'planned';
            if (previous && draft.status !== getSprintStatus(previous)) {
                if (!(await prepareSprintDates(draft, getSprintStatus(previous)))) return;
                closingSprint = draft.status === 'done';
                if (closingSprint) {
                    closure = await prepareSprintClosure(context.boardId, draft.itemId, { ...previous, title: draft.title, startDate: draft.startDate, endDate: draft.endDate, status: draft.status, goal: draft.goal, capacity: draft.capacity, review: draft.review, retrospective: draft.retrospective });
                    if (!closure) return;
                }
                if (getBoardRecord(context.boardId)?.data !== data) { await alert(translateCurrent('roadmap.impactChanged')); return; }
            }
        }
        if (context.mode === 'create-sprint-from-selection') {
            await createSprintFromSelection(context.boardId, draft);
            return;
        }

        let relocation: string | undefined;
        let expectedParentImpact: number[] | undefined;
        if (context.kind === 'phases' && draft.parentId) {
            const data = getBoardRecord(context.boardId)?.data;
            const roadmap = getRoadmapExtension(data);
            const affected = data?.board.tasks.filter((task) => task.phaseId === draft.parentId) || [];
            if (affected.length && roadmap) {
                expectedParentImpact = affected.map((task) => task.id).sort((a, b) => a - b);
                const id = draft.itemId || slugifyRoadmapEntityId(draft.title, roadmap.phases);
                const phases = roadmap.phases.filter((phase) => phase.id !== id).concat({ id, title: draft.title, parentId: draft.parentId });
                const branch = phaseDescendants(phases, id);
                const choice = await choose(translateCurrent('roadmap.reassignImpact', { count: affected.length }) + impactText(affected), [
                    { value: '', label: translateCurrent('roadmap.clearAssignments') },
                    ...phases.filter((phase) => branch.has(phase.id) && isLeafPhase(phases, phase.id)).map((phase) => ({ value: phase.id, label: phase.title }))
                ]);
                if (choice === null) return;
                relocation = choice;
            }
        }
        const changed = await runPortfolioBoardMutation(context.boardId, (boardData) => {
            if (closure) Object.assign(boardData, closure);
            const roadmap = getRoadmapExtensionObject(boardData, { create: true });
            const items = roadmap[config.itemsKey];
            const index = draft.itemId ? items.findIndex((item) => item.id === draft.itemId) : -1;
            const reservedIds = context.kind === 'sprints' ? getSprintCatalog(boardData).entries.map((entry) => ({ id: entry.sprintId })) : items;
            const nextId = draft.itemId || slugifyRoadmapEntityId(draft.title, reservedIds);
            const previousItem = index >= 0 ? items[index] : null;
            const nextItem: RoadmapItem = config.dateMode === 'single'
                ? { id: nextId, title: draft.title, dueDate: draft.dueDate }
                : { id: nextId, title: draft.title, startDate: draft.startDate, endDate: draft.endDate };
            if (context.kind === 'sprints') Object.assign(nextItem, { status: draft.status, goal: draft.goal, capacity: draft.capacity, review: draft.review, retrospective: draft.retrospective });
            if (context.kind !== 'sprints') nextItem.color = isMilestoneColor(input.color) ? input.color
                : previousItem ? milestoneColor(previousItem, index) : nextMilestoneColor(items);
            if (context.kind === 'phases' && draft.parentId) nextItem.parentId = draft.parentId;
            const objective = String(input.objective ?? previousItem?.objective ?? '');
            if (context.kind !== 'sprints' && (objective || previousItem?.objective !== undefined)) nextItem.objective = objective;
            const relationKey = context.kind === 'phases' ? 'phaseIds' : 'milestoneIds';
            const controlIds = input.controlIds;
            if (controlIds?.some((id) => !controlRecords(boardData).some((record) => record.id === id))) throw new Error(translateCurrent('control.stale'));
            const associationsChanged = context.kind !== 'sprints' && controlIds !== undefined && controlRecords(boardData).some((record) => record.related[relationKey].includes(nextId) !== controlIds.includes(record.id));
            if (previousItem && JSON.stringify(previousItem) === JSON.stringify(nextItem) && !associationsChanged) return false;

            if (context.kind === 'phases') {
                const actual = boardData.board.tasks.filter((task) => task.phaseId === draft.parentId).map((task) => task.id).sort((a, b) => a - b);
                if (expectedParentImpact && JSON.stringify(actual) !== JSON.stringify(expectedParentImpact)) throw new Error(translateCurrent('roadmap.impactChanged'));
                updatePhase(boardData, nextItem, relocation);
            } else if (index >= 0) {
                if (context.kind === 'sprints' && nextItem.status === 'active' && getSprintStatus(previousItem!) !== 'active') startSprint(boardData, nextId);
                items[index] = nextItem;
            } else {
                if (context.kind === 'sprints') registerSprintCreation(boardData, nextId, nowIso());
                items.push(nextItem);
            }

            if (context.kind !== 'sprints' && controlIds) {
                for (const record of controlRecords(boardData)) {
                    const linked = record.related[relationKey].includes(nextId);
                    const wanted = controlIds.includes(record.id);
                    if (linked !== wanted) saveControlRecord(boardData, { ...record, related: { ...record.related, [relationKey]: wanted ? [...record.related[relationKey], nextId] : record.related[relationKey].filter((id) => id !== nextId) } }, input.controlAuthor || 'Anonymous');
                }
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
        }, { confirmSprintAllocation: !closingSprint });
        if (changed) closeRoadmapEntity();
    }

    async function deleteRoadmapEntity(kind: RoadmapKind, itemId: string, options: { onApplied?: () => void; boardId?: string } = {}) {
        const boardId = options.boardId || getState().selectedPortfolioBoardId;
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
        // Only Planned Sprints can be deleted; their workitems return to planning with unchanged statuses.
        if (kind === 'sprints' && getSprintStatus(item) !== 'planned') { await alert(translateCurrent('sprint.deletePlannedOnly')); return; }
        const label = getRoadmapLabel(kind);
        const affected = boardRecord.data.board.tasks.filter((task) => task[config.taskField] === itemId);
        let relocation: string | undefined;
        if (kind !== 'sprints' && affected.length) {
            const choice = await choose(translateCurrent('roadmap.reassignImpact', { count: affected.length }) + impactText(affected), [
                { value: '', label: translateCurrent('roadmap.clearAssignments') },
                ...roadmap[kind].filter((target) => target.id !== itemId && (kind !== 'phases' || isLeafPhase(roadmap.phases, target.id))).map((target) => ({ value: target.id, label: target.title }))
            ], { title: `${translateCurrent('roadmap.deleteTitle', { label: label.toLowerCase() })} · ${item.title}`, selectionLabel: translateCurrent('roadmap.assignmentDestination'), workitems: { rows: affected.map((task) => workitemReviewRow(task, label, item.title, translateCurrent('roadmap.assignmentDestination'))) } });
            if (choice === null) return;
            relocation = choice;
        } else {
            const confirmed = await confirm(translateCurrent(kind === 'sprints' ? (affected.length ? 'sprint.deleteQuestion' : 'roadmap.deleteQuestion') : 'roadmap.deletePlanningQuestion', { title: item.title, count: affected.length }) + impactText(affected), {
                title: translateCurrent('roadmap.deleteTitle', { label: label.toLowerCase() }),
                confirmLabel: translateCurrent('common.delete'), danger: true, workitems: { rows: affected.map((task) => workitemReviewRow(task, label, item.title, '—')) }
            });
            if (!confirmed) return;
        }

        await runPortfolioBoardMutation(boardId, (boardData) => {
            const mutableRoadmap = getRoadmapExtensionObject(boardData, { create: true });
            const items = mutableRoadmap[config.itemsKey];
            const index = items.findIndex((entry) => entry.id === itemId);
            if (index === -1) return false;
            const actual = boardData.board.tasks.filter((task) => task[config.taskField] === itemId).map((task) => task.id).sort((a, b) => a - b);
            if (JSON.stringify(actual) !== JSON.stringify(affected.map((task) => task.id).sort((a, b) => a - b))) throw new Error(translateCurrent('roadmap.impactChanged'));
            const removed = items[index];
            if (kind === 'sprints' && getSprintStatus(removed) !== 'planned') throw new Error(translateCurrent('roadmap.impactChanged'));
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
        }, { onMutated: options.onApplied });
    }
    return {
        setPortfolioTaskPlanning(boardId: string, taskId: number, field: 'phaseId' | 'milestoneId', value: string) {
            return runPortfolioTaskMutation(boardId, taskId, (task, draft) => {
                const roadmap = getRoadmapExtension(draft.data);
                const mode = field === 'phaseId' ? 'phaseMode' : 'milestoneMode';
                if (value === '@inherit') { if (!task.parentId) throw new WorkitemError('parent'); task[mode] = 'inherit'; task[field] = ''; return true; }
                if (!isValidRoadmapAssignment(roadmap, field, value)) throw new Error(translateCurrent('roadmap.invalidAssignment'));
                if (task[field] === value && task[mode] === (value ? 'explicit' : 'none')) return false;
                task[field] = value;
                task[mode] = value ? 'explicit' : 'none';
                return true;
            });
        },
        changeSprintStatus,
        openRoadmapEntityModal,
        closeRoadmapEntity,
        togglePortfolioRoadmapRowExpanded,
        saveRoadmapEntity,
        deleteRoadmapEntity,
    };
}
