import type { BoardData } from './types';
import { newLocalId } from './project';
import { safeWebUrl } from './links';

export type PullRequestLink = { id: string; provider: 'github'; number: string; repository: string; url: string; notes: string };
export type PullRequests = { version: 1; byTaskId: Record<string, PullRequestLink[]> };
export function getPullRequests(data: BoardData): PullRequests {
    const stored = data.extensions.pullRequests as PullRequests | undefined;
    if (stored && (stored.version !== 1 || !stored.byTaskId || typeof stored.byTaskId !== 'object')) throw new Error('Invalid pull request references.');
    return stored || { version: 1, byTaskId: {} };
}
export function normalizePullRequest(input: Omit<PullRequestLink, 'id' | 'provider'> & { id?: string }): PullRequestLink {
    const number = input.number.trim().replace(/^#/, '');
    if (!/^[1-9]\d*$/.test(number)) throw new Error('Enter a positive GitHub PR number.');
    let repository = input.repository.trim().replace(/\.git$/, ''), url = input.url.trim();
    if (url) {
        const safe = safeWebUrl(url, true);
        if (!safe) throw new Error('Use a safe HTTPS GitHub pull request URL.');
        const parsed = new URL(safe);
        const match = /^\/([^/]+)\/([^/]+)\/pull\/([1-9]\d*)\/?$/.exec(parsed.pathname);
        if (parsed.hostname !== 'github.com' || parsed.port || !match || match[3] !== number) throw new Error('GitHub URL must identify the same pull request number.');
        const fromUrl = `${match[1]}/${match[2]}`;
        if (repository && repository.toLowerCase() !== fromUrl.toLowerCase()) throw new Error('Repository does not match the GitHub URL.');
        repository = fromUrl; url = `https://github.com/${repository}/pull/${number}`;
    }
    if (repository && !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository)) throw new Error('Repository must use owner/name.');
    return { id: input.id || newLocalId('pr'), provider: 'github', number, repository, url, notes: input.notes.trim() };
}

export function savePullRequest(data: BoardData, taskId: number, input: Omit<PullRequestLink, 'id' | 'provider'> & { id?: string }): PullRequestLink {
    if (!data.board.tasks.some((task) => task.id === taskId)) throw new Error('Workitem no longer exists.');
    const link = normalizePullRequest(input), extension = getPullRequests(data), existing = extension.byTaskId[taskId] || [];
    if (existing.some((item) => item.id !== link.id && item.number === link.number && (!item.repository || !link.repository || item.repository.toLowerCase() === link.repository.toLowerCase()))) throw new Error('This PR is already linked to the workitem.');
    data.extensions.pullRequests = { version: 1, byTaskId: { ...extension.byTaskId, [taskId]: [...existing.filter((item) => item.id !== link.id), link] } } satisfies PullRequests;
    return link;
}
