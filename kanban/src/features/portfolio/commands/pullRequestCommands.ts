import { getPullRequests, savePullRequest, type PullRequestLink } from '@/domain/pullRequests';
import { appendTimelineEvent } from '@/domain/timeline';
import type { BoardMutationContext } from './mutationContext';

export function createPullRequestActions(context: BoardMutationContext) {
    function saveWorkitemPullRequest(boardId: string, taskId: number, input: Omit<PullRequestLink, 'id' | 'provider'> & { id?: string }) {
        return context.runPortfolioBoardMutation(boardId, (data) => {
            const before = getPullRequests(data).byTaskId[taskId]?.find((link) => link.id === input.id) || null;
            const after = savePullRequest(data, taskId, input);
            appendTimelineEvent(data, { kind: `workitem.pullRequest.${before ? 'updated' : 'added'}`, entityType: 'task', entityId: String(taskId), summary: `GitHub PR #${after.number} ${before ? 'updated' : 'linked'}`, changes: { pullRequest: { before, after } } });
            return true;
        });
    }
    async function removeWorkitemPullRequest(boardId: string, taskId: number, id: string) {
        return context.runPortfolioBoardMutation(boardId, (data) => {
            const extension = getPullRequests(data), existing = extension.byTaskId[taskId] || [], before = existing.find((link) => link.id === id);
            if (!before) return false;
            data.extensions.pullRequests = { version: 1, byTaskId: { ...extension.byTaskId, [taskId]: existing.filter((link) => link.id !== id) } };
            appendTimelineEvent(data, { kind: 'workitem.pullRequest.removed', entityType: 'task', entityId: String(taskId), summary: `GitHub PR #${before.number} unlinked`, changes: { pullRequest: { before, after: null } } });
            return true;
        });
    }
    return { saveWorkitemPullRequest, removeWorkitemPullRequest };
}
