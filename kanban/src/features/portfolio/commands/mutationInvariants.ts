import type { BoardData, Task } from '@/domain/types';
import {
    appendTimelineEvent,
    captureTaskTimelineSnapshot,
    getTimelineExtensionObject,
    recordTaskTimelineEvent,
} from '@/domain/timeline';
import { touchTask } from '@/domain/task';
import { validateWorkitems, taskWorkContext } from '@/domain/workitems';
import { assertTaskTransition, synchronizeAggregateStatuses } from '@/domain/workflow';
import { validatePhaseHierarchy } from '@/domain/projectPlan';
import { reconcileAssignments } from '@/domain/assignments';
import { ensureTaskAuditEvents } from '@/domain/workitemHistory';
import type { ProjectMember } from '@/domain/project';
import { validateNewAttachments } from '@/domain/attachmentPolicy';

// Extensions whose edits are audited as whole-value board events.
const AUDITED_EXTENSIONS = ['relations', 'pullRequests', 'projectPlan', 'applications', 'maintenance'] as const;

export type MutationInvariantOptions = {
    // Restoring a historical snapshot replays already-validated state, so
    // per-edit rules (attachments, assignments, transitions) are skipped.
    restoreSnapshot: boolean;
    // Timeline length before the mutator ran; later events belong to this mutation.
    eventStart: number;
    actor: ProjectMember | undefined;
};

// Rules every board mutation must satisfy before it is committed. Each step
// either throws, rejecting the whole mutation, or records the audit trail for
// the derived changes it makes.
export function enforceMutationInvariants(draft: BoardData, current: BoardData, { restoreSnapshot, eventStart, actor }: MutationInvariantOptions): void {
    const previousTasks = new Map(current.board.tasks.map((task) => [task.id, task]));
    if (!restoreSnapshot) {
        for (const task of draft.board.tasks) validateNewAttachments(previousTasks.get(task.id)?.attachments || [], task.attachments || []);
        reconcileAndAuditAssignments(draft, current, previousTasks);
    }
    validateWorkitems(draft, restoreSnapshot ? undefined : current);
    validatePhaseHierarchy(draft);
    if (!restoreSnapshot && !workflowsChanged(current, draft)) assertTransitionsAllowed(draft, current, previousTasks);
    synchronizeAndAuditAggregates(draft);
    recordExtensionChanges(draft, current);
    ensureTaskAuditEvents(draft, current, eventStart);
    if (actor) attributeEvents(draft, eventStart, actor);
}

function reconcileAndAuditAssignments(draft: BoardData, current: BoardData, previousTasks: ReadonlyMap<number, Task>): void {
    const beforeAssignment = new Map(draft.board.tasks.map((task) => [task.id, { ...task }]));
    reconcileAssignments(draft, current);
    for (const task of draft.board.tasks) {
        const before = beforeAssignment.get(task.id);
        if (!before || (before.assigneeId === task.assigneeId && JSON.stringify(before.assignees) === JSON.stringify(task.assignees))) continue;
        if (previousTasks.has(task.id)) {
            recordTaskTimelineEvent(draft, before, task);
            continue;
        }
        // A task created in this mutation: refresh its creation snapshot instead.
        const created = [...(getTimelineExtensionObject(draft)?.events || [])].reverse().find((event) => event.kind === 'task.created' && event.entityId === String(task.id));
        if (created) created.snapshot = captureTaskTimelineSnapshot(draft, task.id) || undefined;
    }
}

function workflowsChanged(current: BoardData, draft: BoardData): boolean {
    return JSON.stringify(current.extensions.workflow) !== JSON.stringify(draft.extensions.workflow)
        || JSON.stringify(current.extensions.maintenance) !== JSON.stringify(draft.extensions.maintenance);
}

// Moving between work contexts remaps status explicitly, so only same-context
// status changes must follow the workflow's transitions.
function assertTransitionsAllowed(draft: BoardData, current: BoardData, previousTasks: ReadonlyMap<number, Task>): void {
    for (const task of draft.board.tasks) {
        const before = previousTasks.get(task.id);
        if (before && taskWorkContext(before) === taskWorkContext(task)) assertTaskTransition(current, before, task.status);
    }
}

function synchronizeAndAuditAggregates(draft: BoardData): void {
    const beforeAggregate = new Map(draft.board.tasks.map((task) => [task.id, { ...task }]));
    synchronizeAggregateStatuses(draft, 'project');
    synchronizeAggregateStatuses(draft, 'maintenance');
    for (const task of draft.board.tasks) {
        const before = beforeAggregate.get(task.id);
        if (!before || before.status === task.status) continue;
        touchTask(task);
        recordTaskTimelineEvent(draft, before, task);
    }
}

function recordExtensionChanges(draft: BoardData, current: BoardData): void {
    for (const key of AUDITED_EXTENSIONS) {
        const before = current.extensions[key], after = draft.extensions[key];
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        appendTimelineEvent(draft, { kind: 'board.extension.updated', entityType: 'board', entityId: key, summary: `Workitem ${key} updated`, changes: { [key]: { before, after } } });
    }
}

function attributeEvents(draft: BoardData, eventStart: number, actor: ProjectMember): void {
    for (const event of getTimelineExtensionObject(draft)?.events.slice(eventStart) || []) {
        event.meta = { ...event.meta, actor: { id: actor.id, name: actor.name, verified: false } };
    }
}
