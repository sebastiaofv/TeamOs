import type { BoardRecord } from '@/features/portfolio/types';
import type { BoardData, Task } from '@/domain/types';
import type { BoardMutationOptions, BoardMutator } from './mutationContext';
import { cloneSerializable } from '@/domain/serializable';
import { applyStoryAutomation, assertAcceptance, assertWorkitems, childrenOf, effectivePlanning, parentOf, syncWorkitemPlanning, workitemType, WorkitemError } from '@/domain/workitems';
import { appendTimelineEvent, captureTaskTimelineSnapshot, ensureBoardTimelineBaseline, recordTaskTimelineEvent, createTimelineEventId } from '@/domain/timeline';
import { annotateTimelineOperation } from '@/domain/taskHistory';
import { reserveTaskIdentities } from '@/domain/taskIdentity';
import { syncProjectAssignments } from '@/domain/projectData';
import { touchTask } from '@/domain/task';
import { canTransition, statusCategory, getWorkflow } from '@/domain/workflow';
import { translateCurrent } from '@/shared/i18n';

type Interaction = Required<Pick<BoardMutationOptions, 'alert' | 'confirm' | 'prompt'>> & {
    isCurrent: () => boolean;
    taskId?: number;
    publish: (draft: BoardRecord) => Promise<boolean>;
};

/** Owns the full change sequence and its history before handing off to the publisher.
 * Without user interaction, publication remains synchronous up to the disk write.
 */
export async function applyWorkitemChange(current: BoardRecord, mutator: BoardMutator, { taskId, isCurrent, alert, confirm, prompt, publish }: Interaction): Promise<boolean> {
    const draft = { ...current, data: cloneSerializable(current.data) };
    ensureBoardTimelineBaseline(draft.data);
    const firstEvent = draft.data.extensions.timeline?.events.length || 0;
    const beforeTask = taskId === undefined ? null : captureTaskTimelineSnapshot(draft.data, taskId);
    if (mutator(draft.data, draft) === false) return false;
    if (taskId !== undefined) {
        const task = draft.data.board.tasks.find((entry) => entry.id === taskId);
        if (task) {
            syncProjectAssignments(draft.data);
            if (beforeTask && task.status !== beforeTask.status && !canTransition(draft.data, beforeTask.status, task.status, task)) throw new Error(translateCurrent('workflow.transitionDenied'));
            touchTask(task);
        }
        recordTaskTimelineEvent(draft.data, beforeTask, captureTaskTimelineSnapshot(draft.data, taskId));
    }
    const boardSnapshotRecorded = draft.data.extensions.timeline?.events.slice(firstEvent).some((event) => Boolean(event.snapshot?.board));
    const previousIds = new Set(current.data.board.tasks.map((task) => task.id));
    const nextIds = new Set(draft.data.board.tasks.map((task) => task.id));
    let insertion = firstEvent;
    for (const task of draft.data.board.tasks) if (!boardSnapshotRecorded && task.id !== taskId && !previousIds.has(task.id)) {
        const event = recordTaskTimelineEvent(draft.data, null, captureTaskTimelineSnapshot(draft.data, task.id));
        // Creation must precede relationship events that reference the new workitem.
        if (event) { draft.data.extensions.timeline!.events.pop(); draft.data.extensions.timeline!.events.splice(insertion++, 0, event); }
    }
    for (const task of current.data.board.tasks) if (!boardSnapshotRecorded && task.id !== taskId && !nextIds.has(task.id)) {
        recordTaskTimelineEvent(draft.data, captureTaskTimelineSnapshot(current.data, task.id), null);
    }
    const stage = cloneSerializable(draft.data);
    syncWorkitemPlanning(draft.data, current.data);
    const effects = applyStoryAutomation(draft.data, current.data);
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
            assertAcceptance(draft.data, task);
            const author = await prompt(translateCurrent('workitems.acceptQuestion', { id: task.id, title: task.title }) + (task.acceptanceCriteria ? `\n\n${task.acceptanceCriteria}` : task.expectedResult ? `\n\n${task.expectedResult}` : ''), '', { title: translateCurrent('workitems.acceptance'), confirmLabel: translateCurrent('workitems.accept'), required: true });
            if (author === null) return false;
            if (!author.trim()) throw new WorkitemError('author');
            task.acceptance = { author: author.trim(), at: new Date().toISOString(), local: true };
        }
        if (changedStatus && category !== 'completed') delete task.acceptance;
        if (before && changedStatus && (category === 'cancelled' || ['completed', 'cancelled'].includes(statusCategory(before.status, current.data, before)))) previews.push(`#${task.id} ${task.title}\n${stateName(current.data, before.status, before)} → ${stateName(draft.data, task.status, task)}`);
        if (before && ((before.parentId ?? null) !== (task.parentId ?? null) || before.sprintId !== task.sprintId)) {
            const name = (id: number | null | undefined, data: BoardData) => { const item = data.board.tasks.find((entry) => entry.id === id); return item ? `#${item.id} ${item.title}` : '—'; };
            previews.push(`#${task.id} ${task.title}\n${translateCurrent('workitems.parent')}: ${name(before.parentId, current.data)} → ${name(task.parentId, draft.data)}\nSprint: ${sprintName(current.data, before.sprintId)} → ${sprintName(draft.data, task.sprintId)}`);
        }
        if (changedStatus && category === 'completed' && workitemType(task) === 'epic' && childrenOf(draft.data, task.id).some((child) => !['completed', 'cancelled'].includes(statusCategory(child.status, draft.data, child)))) previews.push(translateCurrent('workitems.epicPending', { id: task.id, title: task.title }));
        const parent = parentOf(draft.data, task);
        if (before && changedStatus && parent && workitemType(parent) === 'story' && statusCategory(parent.status, draft.data, parent) === 'completed' && category !== 'completed') previews.push(translateCurrent('workitems.reopened', { id: task.id, parent: parent.id }));
        if (before) for (const field of ['phaseId', 'milestoneId'] as const) {
            const oldValue = effectivePlanning(current.data, before, field); const newValue = effectivePlanning(draft.data, task, field);
            if (oldValue !== newValue && before[field] === task[field] && (field === 'phaseId' ? before.phaseMode === task.phaseMode : before.milestoneMode === task.milestoneMode)) previews.push(`#${task.id} ${task.title} · ${translateCurrent(field === 'phaseId' ? 'task.phase' : 'task.milestone')}: ${oldValue || '—'} → ${newValue || '—'}`);
        }
        const rawStage = stageTasks.get(task.id);
        if (rawStage && JSON.stringify(rawStage) !== JSON.stringify(task)) {
            const stageTask = captureTaskTimelineSnapshot(stage, task.id);
            const count = draft.data.extensions.timeline?.events.length || 0;
            recordTaskTimelineEvent(draft.data, stageTask, captureTaskTimelineSnapshot(draft.data, task.id));
            const event = draft.data.extensions.timeline?.events.at(-1);
            if (event && (draft.data.extensions.timeline?.events.length || 0) > count) {
                const automatic = effects.find((effect) => !effect.blocked && effect.storyId === task.id);
                event.meta = { ...event.meta, ...(automatic ? { automatic: true, causeTaskId: automatic.taskId, cause: `Task #${automatic.taskId}` } : {}), ...(task.acceptance && !before?.acceptance ? { author: task.acceptance.author } : {}) };
            }
        }
    }
    for (const effect of effects) if (!effect.blocked) previews.push(translateCurrent('workitems.autoEffect', { id: effect.storyId, state: stateName(draft.data, draft.data.board.tasks.find((task) => task.id === effect.storyId)?.status || '', draft.data.board.tasks.find((task) => task.id === effect.storyId)) }));
    if (previews.length && !(await confirm(translateCurrent('workitems.impact') + '\n\n' + previews.join('\n\n'), { title: translateCurrent('workitems.confirmChanges'), confirmLabel: translateCurrent('messages.confirm') }))) return false;
    if (!isCurrent()) throw new WorkitemError('stale');
    for (const effect of effects) if (effect.blocked) void alert(translateCurrent('workitems.autoBlocked', { id: effect.storyId }));
    syncWorkitemPlanning(draft.data, draft.data);
    if (JSON.stringify(stage.extensions.sprintParticipation) !== JSON.stringify(draft.data.extensions.sprintParticipation)) appendTimelineEvent(draft.data, { kind: 'sprint.participation.updated', entityType: 'board', entityId: 'board', summary: 'Sprint participation recorded', changes: { sprintParticipation: { before: stage.extensions.sprintParticipation ?? null, after: structuredClone(draft.data.extensions.sprintParticipation) } } });
    syncProjectAssignments(draft.data);
    annotateTimelineOperation(current.data, draft.data, firstEvent, createTimelineEventId());
    reserveTaskIdentities(draft.data, current.data);
    return publish(draft);
}
