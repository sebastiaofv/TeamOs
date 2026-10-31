import type { BoardData, Task } from '@/domain/types';
import { assertAcceptance, WorkitemError } from '@/domain/workitems';
import { workitemLabel } from '@/domain/taskIdentity';
import { translateCurrent as t } from '@/shared/i18n';
import type { BoardMutationOptions } from './mutationContext';

/** Shared completion validation and author confirmation for edits and transfers. */
export async function requestWorkitemAcceptance(data: BoardData, task: Task, prompt: NonNullable<BoardMutationOptions['prompt']>): Promise<string | null> {
    assertAcceptance(data, task);
    const author = await prompt(t('workitems.acceptQuestion', { id: workitemLabel(task), title: task.title }) + (task.acceptanceCriteria ? `\n\n${task.acceptanceCriteria}` : task.expectedResult ? `\n\n${task.expectedResult}` : ''), '', { title: t('workitems.acceptance'), confirmLabel: t('workitems.accept'), required: true });
    if (author === null) return null;
    if (!author.trim()) throw new WorkitemError('author');
    return author.trim();
}
