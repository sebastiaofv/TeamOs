import type { TimelineEvent } from './types';

export type PullRequestErrorCode = 'required' | 'invalid' | 'scheme' | 'credentials' | 'duplicate';
export class PullRequestLinkError extends Error {
    constructor(public readonly code: PullRequestErrorCode) { super(`Invalid pull request link: ${code}.`); }
}

/** Syntax-only validation. Return the supplied spelling, not URL.href or a canonical address. */
export function validatePullRequestUrl(value: unknown): string {
    if (typeof value !== 'string') throw new PullRequestLinkError('invalid');
    const url = value.trim();
    if (!url) throw new PullRequestLinkError('required');
    if (!/^https?:\/\//i.test(url)) throw new PullRequestLinkError(/^[a-z][a-z\d+.-]*:/i.test(url) ? 'scheme' : 'invalid');
    if (/[\s\\]/u.test(url) || Array.from(url).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new PullRequestLinkError('invalid');
    const authority = url.slice(url.indexOf('://') + 3).split(/[/?#]/)[0];
    if (!authority) throw new PullRequestLinkError('invalid');
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new PullRequestLinkError('invalid'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new PullRequestLinkError('invalid');
    if (parsed.username || parsed.password || authority.includes('@')) throw new PullRequestLinkError('credentials');
    return url;
}

export function parsePullRequestLinks(value: unknown): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new PullRequestLinkError('invalid');
    const result = value.map(validatePullRequestUrl);
    if (new Set(result).size !== result.length) throw new PullRequestLinkError('duplicate');
    return result;
}

export function safePullRequestHref(value: string): string | undefined {
    try { return validatePullRequestUrl(value); } catch { return undefined; }
}

export function validatePullRequestTimeline(events: readonly TimelineEvent[]): void {
    for (const event of events) {
        parsePullRequestLinks(event.snapshot?.pullRequests);
        if (Array.isArray(event.snapshot?.board?.tasks)) event.snapshot.board.tasks.forEach((task) => parsePullRequestLinks(task.pullRequests));
        if (event.changes?.pullRequests) { parsePullRequestLinks(event.changes.pullRequests.before); parsePullRequestLinks(event.changes.pullRequests.after); }
    }
}
