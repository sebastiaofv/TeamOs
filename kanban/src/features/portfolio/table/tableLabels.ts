import type { Priority, TaskStatus } from '@/domain/types';
import type { TranslationKey } from '@/shared/i18n';
import type { TableColumnId } from './tableModel';
import type { WorkitemType } from '@/domain/workitems';

export const COLUMN_LABELS: Record<TableColumnId, TranslationKey> = {
    workitemType: 'workitem.type',
    id: 'table.id', title: 'task.title', status: 'task.status', assignees: 'task.assignees',
    priority: 'task.priority', phase: 'task.phase', updatedAt: 'task.updated',
    milestone: 'task.milestone', sprint: 'task.sprint', dueDate: 'task.due', createdAt: 'task.created',
    blocked: 'task.blocked', blockerReason: 'task.blocker', effort: 'task.effort', tags: 'task.tags', archived: 'table.archived'
};
export const STATUS_LABELS: Record<TaskStatus, TranslationKey> = {
    backlog: 'board.backlog', 'to-do': 'board.toDo', doing: 'board.doing', done: 'board.done'
};
export const WORKITEM_TYPE_LABELS: Record<WorkitemType, TranslationKey> = {
    epic: 'workitem.epic', story: 'workitem.story', task: 'workitem.task', bug: 'workitem.bug'
};
export const PRIORITY_LABELS: Record<Priority, TranslationKey> = {
    high: 'toolbar.high', medium: 'toolbar.medium', low: 'toolbar.low'
};
