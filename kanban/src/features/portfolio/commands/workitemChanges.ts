import { sprintPhaseDateConflicts } from '@/domain/sprintPhaseDates';
import { recalculatePhaseDates } from '@/domain/phaseTree';
import { formatDate } from '@/domain/dates';
import { projectActor } from '@/features/portfolio/projects/projectIdentity';
import { recordSprintCredits } from '@/domain/sprintResults';
import { removeDeletedControlLinks } from '@/domain/projectControl';
import { lastCommentAuthor } from '@/features/portfolio/task/conversationDrafts';
import { requestWorkitemAcceptance } from './workitemAcceptance';
import { workitemLabel } from '@/domain/taskIdentity';
import type { BoardRecord } from '@/features/portfolio/types';
import type { BoardData, Task } from '@/domain/types';
import type { BoardMutationOptions, BoardMutator } from './mutationContext';
import { createBoardStateSnapshot } from '@/domain/serialize';
import { cloneSerializable } from '@/domain/serializable';
import { resolveHierarchyAutomations } from './hierarchyAutomationChanges';
import { assertWorkitems, childrenOf, effectivePlanning, parentOf, syncWorkitemPlanning, workitemType, WorkitemError } from '@/domain/workitems';
import { appendTimelineEvent, captureTaskTimelineSnapshot, ensureBoardTimelineBaseline, recordTaskTimelineEvent, createTimelineEventId } from '@/domain/timeline';
import { annotateTimelineOperation } from '@/domain/taskHistory';
import { createWorkitemDisplayId, ensurePermanentTaskIdentities, reserveTaskIdentities } from '@/domain/taskIdentity';
import { syncProjectAssignments, ProjectDataError } from '@/domain/projectData';
import { nextTaskIdForBoard, normalizeTask, touchTask } from '@/domain/task';
import { canTransition, statusCategory, getWorkflow } from '@/domain/workflow';
import { translateCurrent } from '@/shared/i18n';

type Interaction = Required<Pick<BoardMutationOptions, 'alert' | 'confirm' | 'prompt'>> & {
    isCurrent: () => boolean;
    taskId?: number;
    confirmSprintAllocation?: boolean;
    publish: (draft: BoardRecord) => Promise<boolean>;
};

/** Owns the full change sequence and its history before handing off to the publisher.
 * Without user interaction, publication remains synchronous up to the disk write.
 */
export async function applyWorkitemChange(current: BoardRecord, mutator: BoardMutator, { taskId, confirmSprintAllocation = true, isCurrent, confirm, prompt, publish }: Interaction): Promise<boolean> {
    const draft = { ...current, data: cloneSerializable(current.data) };
    ensureBoardTimelineBaseline(draft.data);
    const firstEvent = draft.data.extensions.timeline?.events.length || 0;
    const beforeTask = taskId === undefined ? null : captureTaskTimelineSnapshot(draft.data, taskId);
    if (mutator(draft.data, draft) === false) return false;
    for (const bug of draft.data.board.tasks.filter((task) => task.type === 'bug' && !current.data.board.tasks.some((before) => before.id === task.id))) {
        const id = nextTaskIdForBoard({ data: draft.data });
        draft.data.board.tasks.push(normalizeTask({ id, type: 'task', parentId: bug.id, title: bug.title,
            description: bug.description, status: getWorkflow(draft.data, { type: 'task' }).entryStateId,
            assignees: bug.assignees, responsible: bug.responsible, priority: bug.priority, effort: bug.effort,
            dueDate: bug.dueDate, sprintId: bug.sprintId, phaseMode: 'inherit', milestoneMode: 'inherit',
            createdAt: bug.createdAt, updatedAt: bug.updatedAt }, { includeStatusChangedAt: false, workflow: getWorkflow(draft.data, { type: 'task' }) }));
    }
    ensurePermanentTaskIdentities({ ...draft.data, board: { ...draft.data.board, tasks: draft.data.board.tasks.filter((task) => !current.data.board.tasks.some((previous) => previous.id === task.id)) } });
    const boardSnapshotRecorded = draft.data.extensions.timeline?.events.slice(firstEvent).some((event) => Boolean(event.snapshot?.board));
    const existingIds = new Set(current.data.board.tasks.map((task) => task.id));
    const createdTasks = draft.data.board.tasks.filter((task) => !boardSnapshotRecorded && !existingIds.has(task.id) && !task.displayId);
    if (createdTasks.length) {
        const project = draft.data.extensions.project!;
        if (!project.acronym) {
            const acronym = await prompt(translateCurrent('project.acronymHelp'), '', { title: translateCurrent('project.acronym'), required: true });
            if (acronym === null) return false;
            project.acronym = acronym.trim().toUpperCase();
            if (!/^[A-Z]{1,4}$/.test(project.acronym)) throw new ProjectDataError('acronym');
        }
        for (const task of createdTasks) task.displayId = createWorkitemDisplayId(project.acronym, task);
        // Persist first-use legacy configuration before the creation events.
        if (!current.data.extensions.project?.acronym) appendTimelineEvent(draft.data, { kind: 'board.project.updated', entityType: 'board', entityId: project.id, summary: translateCurrent('project.updated'), snapshot: createBoardStateSnapshot({ ...current.data, extensions: { ...current.data.extensions, project } }) });
    }
    if (taskId !== undefined) {
        const task = draft.data.board.tasks.find((entry) => entry.id === taskId);
        if (task) {
            syncProjectAssignments(draft.data);
            if (beforeTask && task.status !== beforeTask.status && !canTransition(draft.data, beforeTask.status, task.status, task)) throw new Error(translateCurrent('workflow.transitionDenied'));
            touchTask(task);
        }
        recordTaskTimelineEvent(draft.data, beforeTask, captureTaskTimelineSnapshot(draft.data, taskId));
    }
    const previousIds = new Set(current.data.board.tasks.map((task) => task.id));
    const nextIds = new Set(draft.data.board.tasks.map((task) => task.id));
    let insertion = firstEvent;
    if (createdTasks.length && !current.data.extensions.project?.acronym) {
        const events = draft.data.extensions.timeline!.events;
        const index = events.findIndex((event, index) => index >= firstEvent && event.kind === 'board.project.updated');
        const [configuration] = events.splice(index, 1);
        events.splice(firstEvent, 0, configuration);
        insertion++;
    }
    for (const task of draft.data.board.tasks) if (!boardSnapshotRecorded && task.id !== taskId && !previousIds.has(task.id)) {
        const event = recordTaskTimelineEvent(draft.data, null, captureTaskTimelineSnapshot(draft.data, task.id));
        // Creation must precede relationship events that reference the new workitem.
        if (event) { draft.data.extensions.timeline!.events.pop(); draft.data.extensions.timeline!.events.splice(insertion++, 0, event); }
    }
    for (const task of current.data.board.tasks) if (!boardSnapshotRecorded && task.id !== taskId && !nextIds.has(task.id)) {
        recordTaskTimelineEvent(draft.data, captureTaskTimelineSnapshot(current.data, task.id), null);
    }
    if (removeDeletedControlLinks(draft.data, current.data, lastCommentAuthor(current.id))) appendTimelineEvent(draft.data, { kind: 'board.control.associations', entityType: 'board', entityId: 'board', summary: 'Project Control associations updated after element deletion', snapshot: createBoardStateSnapshot(draft.data) });
    const stage = cloneSerializable(draft.data);
    syncWorkitemPlanning(draft.data, current.data);
    assertWorkitems(draft.data, current.data);
    const previews: string[] = [];
    const beforeTasks = new Map(current.data.board.tasks.map((task) => [task.id, task]));
    const stageTasks = new Map(stage.board.tasks.map((task) => [task.id, task]));
    const sprintName = (data: BoardData, id: string) => data.extensions.roadmap?.sprints.find((sprint) => sprint.id === id)?.title || id || '—';
    const stateName = (data: BoardData, id: string, task?: Task) => getWorkflow(data, task).states.find((state) => state.id === id)?.name || id;
    for (const task of draft.data.board.tasks) {
        const before = beforeTasks.get(task.id);
        const category = statusCategory(task.status, draft.data, task);
        const changedStatus = !before || before.status !== task.status || statusCategory(before.status, current.data, before) !== category;
        const changedCriteria = before && workitemType(task) === 'story' && before.acceptanceCriteria !== task.acceptanceCriteria;
        if ((changedStatus || changedCriteria) && category === 'completed' && ['story', 'bug'].includes(workitemType(task))) {
            const author = await requestWorkitemAcceptance(draft.data, task, prompt, projectActor(current.id)?.name);
            if (author === null) return false;
            task.acceptance = { author: author.trim(), at: new Date().toISOString(), local: true };
        }
        if (changedStatus && category !== 'completed') delete task.acceptance;
        if (before && changedStatus && (category === 'cancelled' || ['completed', 'cancelled'].includes(statusCategory(before.status, current.data, before)))) previews.push(`${workitemLabel(task)} ${task.title}\n${stateName(current.data, before.status, before)} → ${stateName(draft.data, task.status, task)}`);
        if (before && ((before.parentId ?? null) !== (task.parentId ?? null) || (confirmSprintAllocation && before.sprintId !== task.sprintId))) {
            const name = (id: number | null | undefined, data: BoardData) => { const item = data.board.tasks.find((entry) => entry.id === id); return item ? `${workitemLabel(item)} ${item.title}` : '—'; };
            previews.push(`${workitemLabel(task)} ${task.title}\n${translateCurrent('workitems.parent')}: ${name(before.parentId, current.data)} → ${name(task.parentId, draft.data)}\nSprint: ${sprintName(current.data, before.sprintId)} → ${sprintName(draft.data, task.sprintId)}`);
        }
        if (changedStatus && category === 'completed' && workitemType(task) === 'epic' && childrenOf(draft.data, task.id).some((child) => !['completed', 'cancelled'].includes(statusCategory(child.status, draft.data, child)))) previews.push(translateCurrent('workitems.epicPending', { id: workitemLabel(task), title: task.title }));
        const parent = parentOf(draft.data, task);
        if (before && changedStatus && parent && workitemType(parent) === 'story' && statusCategory(parent.status, draft.data, parent) === 'completed' && category !== 'completed') previews.push(translateCurrent('workitems.reopened', { id: workitemLabel(task), parent: workitemLabel(parent) }));
        if (before) for (const field of ['phaseId', 'milestoneId'] as const) {
            const oldValue = effectivePlanning(current.data, before, field); const newValue = effectivePlanning(draft.data, task, field);
            if (oldValue !== newValue && before[field] === task[field] && (field === 'phaseId' ? before.phaseMode === task.phaseMode : before.milestoneMode === task.milestoneMode)) previews.push(`${workitemLabel(task)} ${task.title} · ${translateCurrent(field === 'phaseId' ? 'task.phase' : 'task.milestone')}: ${oldValue || '—'} → ${newValue || '—'}`);
        }
    }
    if (previews.length) {
        const answer = await confirm(translateCurrent('workitems.impact') + '\n\n' + previews.join('\n\n'), { title: translateCurrent('workitems.confirmChanges'), confirmLabel: translateCurrent('messages.confirm') });
        if (!answer) return false;
    }
    assertWorkitems(draft.data, current.data);
    for (const task of draft.data.board.tasks) {
        const before = beforeTasks.get(task.id);
        const rawStage = stageTasks.get(task.id);
        if (rawStage && JSON.stringify(rawStage) !== JSON.stringify(task)) {
            const stageTask = captureTaskTimelineSnapshot(stage, task.id);
            const count = draft.data.extensions.timeline?.events.length || 0;
            recordTaskTimelineEvent(draft.data, stageTask, captureTaskTimelineSnapshot(draft.data, task.id));
            const event = draft.data.extensions.timeline?.events.at(-1);
            if (event && (draft.data.extensions.timeline?.events.length || 0) > count) {
                event.meta = { ...event.meta, ...(task.acceptance && !before?.acceptance ? { author: task.acceptance.author } : {}) };
            }
        }
    }
    const automationReview = !boardSnapshotRecorded && resolveHierarchyAutomations(draft.data, current.data, confirm);
    if (automationReview) await automationReview;
    assertWorkitems(draft.data, current.data);
    const dateConflicts = sprintPhaseDateConflicts(draft.data, current.data);
    if (dateConflicts.length) {
        const answer = await confirm(translateCurrent('planning.phaseDatesConflict'), {
            title: translateCurrent('planning.phaseDatesTitle'), confirmLabel: translateCurrent('messages.confirm'),
            selections: dateConflicts.map((entry) => {
                const phase = draft.data.extensions.roadmap!.phases.find((phase) => phase.id === entry.phaseId)!;
                return { id: entry.phaseId, label: entry.title, options: [
                    { value: 'keep', label: translateCurrent('planning.currentDates', { start: formatDate(phase.startDate!), end: formatDate(phase.endDate!) }) },
                    { value: 'update', label: translateCurrent('planning.sprintDates', { start: formatDate(entry.startDate), end: formatDate(entry.endDate) }) }
                ] };
            })
        });
        if (!answer) return false;
        let changed = false;
        if (typeof answer === 'object') for (const entry of dateConflicts) {
            if ((answer as Record<string, unknown>)[entry.phaseId] !== 'update') continue;
            Object.assign(draft.data.extensions.roadmap!.phases.find((phase) => phase.id === entry.phaseId)!, { startDate: entry.startDate, endDate: entry.endDate });
            changed = true;
        }
        if (changed) {
            recalculatePhaseDates(draft.data.extensions.roadmap!.phases);
            appendTimelineEvent(draft.data, { kind: 'roadmap.updated', entityType: 'board', entityId: 'board', summary: translateCurrent('planning.datesUpdated'), snapshot: createBoardStateSnapshot(draft.data) });
        }
    }
    if (!isCurrent()) throw new WorkitemError('stale');
    syncWorkitemPlanning(draft.data, draft.data);
    if (JSON.stringify(stage.extensions.sprintParticipation) !== JSON.stringify(draft.data.extensions.sprintParticipation)) appendTimelineEvent(draft.data, { kind: 'sprint.participation.updated', entityType: 'board', entityId: 'board', summary: 'Sprint participation recorded', changes: { sprintParticipation: { before: stage.extensions.sprintParticipation ?? null, after: structuredClone(draft.data.extensions.sprintParticipation) } } });
    recordSprintCredits(draft.data, current.data);
    if (JSON.stringify(current.data.extensions.sprintResults) !== JSON.stringify(draft.data.extensions.sprintResults)) appendTimelineEvent(draft.data, { kind: 'sprint.results.updated', entityType: 'board', entityId: 'board', summary: 'Sprint results recorded', changes: { sprintResults: { before: current.data.extensions.sprintResults ?? null, after: structuredClone(draft.data.extensions.sprintResults) } } });
    syncProjectAssignments(draft.data);
    annotateTimelineOperation(current.data, draft.data, firstEvent, createTimelineEventId());
    const actor = projectActor(current.id);
    if (actor) for (const event of draft.data.extensions.timeline?.events.slice(firstEvent) || []) event.meta = { ...event.meta, author: event.meta?.author || actor.name, memberId: actor.id };
    reserveTaskIdentities(draft.data, current.data);
    return publish(draft);
}
