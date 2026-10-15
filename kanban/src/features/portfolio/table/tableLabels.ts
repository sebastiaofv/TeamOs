import type { Priority, TaskStatus } from '@/domain/types';
import type { TranslationKey } from '@/shared/i18n';
import type { TableColumnId } from './tableModel';

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
export const PRIORITY_LABELS: Record<Priority, TranslationKey> = {
    high: 'toolbar.high', medium: 'toolbar.medium', low: 'toolbar.low'
};
