import type { BoardMutationContext } from './mutationContext';
import { buildComment, getComments, validateCommentInput, type CommentInput } from '@/domain/comments';
import { CommentError } from '@/domain/commentImages';
import { appendTimelineEvent } from '@/domain/timeline';
import { isBoardInHistoricalPreview } from '@/features/portfolio/queries';
import { validateCommentImagePixels } from '@/infrastructure/browser/commentImages';
import { translateCurrent } from '@/shared/i18n';

export function createCommentActions({ getState, getBoardRecord, canUsePortfolioTaskMutations, notifyPortfolioMutationUnavailable, runPortfolioBoardMutation, alert }: BoardMutationContext) {
    const inFlight = new Set<string>();
    async function publishPortfolioComment(boardId: string, taskId: number, input: CommentInput, onApplied: () => void = () => {}): Promise<boolean> {
        const context = getState().portfolioDetailContext;
        if (!canUsePortfolioTaskMutations(boardId) || (context?.boardId === boardId && context.taskId === taskId && context.readOnly)) { notifyPortfolioMutationUnavailable(boardId); return false; }
        if (inFlight.has(input.id)) return false;
        inFlight.add(input.id);
        let applied = false;
        try {
            validateCommentInput(input);
            for (const image of input.images) await validateCommentImagePixels(image);
            await runPortfolioBoardMutation(boardId, (data) => {
                const comment = buildComment(data, taskId, input, { writable: Boolean(getBoardRecord(boardId)?.handle), historical: isBoardInHistoricalPreview(getState(), boardId) });
                data.extensions.conversations = { version: 1, entries: [...getComments(data), comment] };
                appendTimelineEvent(data, { id: comment.eventId, at: comment.at, kind: 'task.comment.published', entityType: 'task', entityId: String(taskId), summary: `Comment published: #${taskId} · ${comment.author.name}`,
                    meta: { historyVersion: 1, operationId: comment.eventId, commentId: comment.id, workitemKey: comment.workitemKey, author: comment.author } });
                return true;
            }, { onMutated: () => { applied = true; onApplied(); } });
        } catch (error) {
            await alert(translateCurrent(`comments.error.${error instanceof CommentError ? error.code : 'record'}`));
        } finally { inFlight.delete(input.id); }
        // A failed disk save does not undo the local publication or re-create its draft.
        return applied;
    }
    return { publishPortfolioComment };
}
