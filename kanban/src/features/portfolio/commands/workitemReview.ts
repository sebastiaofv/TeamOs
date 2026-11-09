import type { WorkitemReview } from '@/app/types';
import type { BoardData, Task } from '@/domain/types';
import { workitemLabel } from '@/domain/taskIdentity';
import { workitemType } from '@/domain/workitems';
import { getWorkflow } from '@/domain/workflow';
import { translateCurrent as t } from '@/shared/i18n';

export function workitemReviewRow(task: Task, field: string, from: string, to: string): WorkitemReview['rows'][number] {
    return { id: workitemLabel(task), type: workitemType(task), title: task.title, field, from, to };
}
export function statusName(data: BoardData, task: Task): string {
    return getWorkflow(data, task).states.find((state) => state.id === task.status)?.name || task.status;
}
export const reviewDecision = (id: string, label: string) => ({ id, label, options: [
    { value: 'advance', label: t('automations.applyChange') }, { value: 'keep', label: t('automations.keepCurrent') }
] });
