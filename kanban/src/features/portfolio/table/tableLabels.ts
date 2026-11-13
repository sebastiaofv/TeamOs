import type { Priority } from '@/domain/types';
import type { TranslationKey } from '@/shared/i18n';
import type { TableColumnId } from './tableModel';

export const COLUMN_LABELS: Record<TableColumnId, TranslationKey> = {
    type: 'workitems.type', epic: 'workitems.type.epic', story: 'workitems.type.story', id: 'table.id', title: 'task.title', status: 'task.status', assignees: 'task.assignees',
    priority: 'task.priority', phase: 'task.phase', updatedAt: 'task.updated', responsible: 'task.responsible',
    milestone: 'task.milestone', sprint: 'task.sprint', dueDate: 'task.due', createdAt: 'task.created',
    blocked: 'table.manuallyBlocked', dependencyBlocked: 'table.dependencyBlocked', blockerReason: 'task.blocker', effort: 'task.effort', tags: 'task.tags', archived: 'table.archived'
};
export const PRIORITY_LABELS: Record<Priority, TranslationKey> = {
    high: 'toolbar.high', medium: 'toolbar.medium', low: 'toolbar.low'
};
