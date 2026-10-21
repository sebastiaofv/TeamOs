import type { BoardMutationContext } from './mutationContext';
import { parsePullRequestLinks, PullRequestLinkError } from '@/domain/pullRequests';
import { areSerializableValuesEqual } from '@/domain/serializable';
import { translateCurrent } from '@/shared/i18n';

export function createPullRequestActions({ getState, findPortfolioTaskSource, canUsePortfolioTaskMutations, notifyPortfolioMutationUnavailable, runPortfolioTaskMutation, alert }: BoardMutationContext) {
    async function setPortfolioTaskPullRequests(boardId: string, taskId: number, input: unknown): Promise<boolean> {
        const context = getState().portfolioDetailContext;
        if (!canUsePortfolioTaskMutations(boardId) || (context?.boardId === boardId && context.taskId === taskId && context.readOnly)) { notifyPortfolioMutationUnavailable(boardId); return false; }
        const source = findPortfolioTaskSource(boardId, taskId);
        if (!source) return false;
        let links: string[];
        try { links = parsePullRequestLinks(input); }
        catch (error) { await alert(translateCurrent(`pullRequests.error.${error instanceof PullRequestLinkError ? error.code : 'invalid'}`)); return false; }
        if (areSerializableValuesEqual(source.task.pullRequests || [], links)) return true;
        let applied = false;
        await runPortfolioTaskMutation(boardId, taskId, (task) => {
            if (areSerializableValuesEqual(task.pullRequests || [], links)) return false;
            task.pullRequests = links;
            return true;
        }, { onMutated: () => { applied = true; } });
        return applied;
    }
    return { setPortfolioTaskPullRequests };
}
