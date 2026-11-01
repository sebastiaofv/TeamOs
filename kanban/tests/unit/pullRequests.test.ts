import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { parsePullRequestLinks, safePullRequestHref, validatePullRequestUrl } from '../../src/domain/pullRequests';
import { normalizeTask } from '../../src/domain/task';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';
import type { BoardData } from '../../src/domain/types';

const url = 'http://git.internal:8080/org/repo/pull/12?Q=One%2FTwo#Diff';
const fixture = (): BoardData => JSON.parse(readFileSync('test-board/us-8.board.json', 'utf8'));
function setup({ writable = true, saved = true } = {}) {
    const data = createEmptyProjectData('Links');
    data.extensions.project!.members = [{ id: 'ana', name: 'Ana' }];
    data.board.tasks = [normalizeTask({ id: 1, title: 'Workitem', description: 'Kept', status: 'doing', assignees: ['Ana'], responsible: 'Ana', createdAt: '2026-10-19T09:00:00Z' })];
    const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Links', handle: writable ? {} : null, data })], selectedPortfolioBoardId: 'p' });
    const save = vi.fn(async () => saved); const alert = vi.fn();
    const actions = createPortfolioMutationActions({ store, enqueueSave: save, markDirty: vi.fn(), alert, openDialogFn: vi.fn(), closeDialogFn: vi.fn() });
    return { store, actions, save, alert, data: () => store.getState().portfolioBoards[0].data };
}

describe('local pull request links', () => {
    it('accepts public/internal/self-hosted HTTP(S), arbitrary paths, ports, queries and fragments without canonicalizing', () => {
        for (const value of [url, 'https://github.com/org/repo/pull/1', 'HTTPS://Git.Local:8443/Any/Path?x=%2f#Mixed', 'http://localhost:3000/review', 'https://例え.test/review']) expect(validatePullRequestUrl(`  ${value}  `)).toBe(value);
        expect(parsePullRequestLinks([url, url.replace('#Diff', '#Other')])).toHaveLength(2);
        expect(parsePullRequestLinks(['https://HOST/review', 'https://host/review'])).toHaveLength(2);
    });
    it.each(['', '  ', '12', '#12', '/org/repo/pull/12', 'git.internal/pr/1', 'javascript:alert(1)', 'data:text/plain,test', 'file:///etc/passwd', 'ftp://host/pr/1', 'https:host/pr/1', 'https:///host/pr/1', 'https://host:99999/pr/1', 'https://host/a b', 'https://host/\u0000bad', 'https://host\\other/pr/1'])('rejects incomplete or unsafe input: %s', (value) => {
        expect(() => validatePullRequestUrl(value)).toThrow(); expect(safePullRequestHref(value)).toBeUndefined();
    });
    it.each(['https://user:password@git.local/pr/1', 'https://user@git.local/pr/1', 'https://@git.local/pr/1'])('rejects embedded credentials: %s', (value) => expect(() => validatePullRequestUrl(value)).toThrow(/credentials/));
    it('prevents textual duplicates per workitem, but not across different workitems', () => {
        expect(() => parsePullRequestLinks([url, ` ${url} `])).toThrow(/duplicate/);
        const data = fixture(); validateBoardData(data);
        expect(data.board.tasks[0].pullRequests?.[0]).toBe(data.board.tasks[1].pullRequests?.[0]);
    });
    it('round-trips the manual board exactly and migrates v1/v2 without fabricating links or rewriting history', () => {
        const data = fixture(); validateBoardData(data);
        const reopened = serializeBoardDataFromObject(data); validateBoardData(reopened);
        expect(reopened.board.tasks.map((task) => task.pullRequests)).toEqual(data.board.tasks.map((task) => task.pullRequests));
        expect(reopened.extensions.timeline).toEqual(data.extensions.timeline);
        for (const version of [1, 2]) {
            const legacy = structuredClone(data); legacy.meta.schemaVersion = version; legacy.board.tasks.forEach((task) => { delete task.pullRequests; });
            const migrated = serializeBoardDataFromObject(legacy);
            expect(migrated.meta.schemaVersion).toBe(6);
            expect(migrated.board.tasks.map((task) => task.id)).toEqual(legacy.board.tasks.map((task) => task.id));
            expect(migrated.board.tasks.every((task) => task.pullRequests?.length === 0)).toBe(true);
            expect(migrated.extensions.timeline).toEqual(legacy.extensions.timeline);
        }
    });
    it('does not silently discard malformed associations in current tasks or timeline snapshots/changes', () => {
        const data = fixture(); data.board.tasks[0].pullRequests = ['javascript:bad'];
        expect(() => validateBoardData(data)).toThrow(/scheme/); expect(() => serializeBoardDataFromObject(data)).toThrow(/scheme/);
        const historical = fixture(); historical.extensions.timeline!.events[1].changes!.pullRequests.after = ['file:///bad'];
        expect(() => validateBoardData(historical)).toThrow(/scheme/); expect(() => serializeBoardDataFromObject(historical)).toThrow(/scheme/);
    });
    it('records addition/correction/removal in the canonical task operation and restores the mutable links', async () => {
        const { actions, data, store } = setup();
        await actions.setPortfolioTaskPullRequests('p', 1, [url]);
        await actions.setPortfolioTaskPullRequests('p', 1, ['https://other.internal:8443/anything?x=1#two']);
        await actions.setPortfolioTaskPullRequests('p', 1, []);
        expect(data().extensions.timeline!.events).toHaveLength(4);
        expect(data().extensions.timeline!.events[1].changes?.pullRequests).toEqual({ before: [], after: [url] });
        expect(reconstructBoardStateFromTimeline(data(), 1).board.tasks[0].pullRequests).toEqual([url]);
        store.setState({ portfolioTimelineSelection: { boardId: 'p', eventIndex: 1 } });
        await actions.restorePortfolioTimelineSelection();
        expect(data().board.tasks[0]).toMatchObject({ pullRequests: [url], description: 'Kept', status: 'doing', assignees: ['Ana'], responsible: 'Ana' });
        expect(data().extensions.timeline!.events.at(-1)?.kind).toBe('board.restored');
    });
    it('enforces permissions and URL validation in commands, not only in the UI', async () => {
        const readOnly = setup({ writable: false });
        expect(await readOnly.actions.setPortfolioTaskPullRequests('p', 1, [url])).toBe(false);
        const writable = setup();
        expect(await writable.actions.setPortfolioTaskPullRequests('p', 1, ['javascript:bad'])).toBe(false);
        expect(writable.data().extensions.timeline).toBeUndefined();
        await writable.actions.setPortfolioTaskPullRequests('p', 1, [url]);
        writable.store.setState({ portfolioTimelineSelection: { boardId: 'p', eventIndex: 0 } });
        expect(await writable.actions.setPortfolioTaskPullRequests('p', 1, [])).toBe(false);
        expect(writable.data().board.tasks[0].pullRequests).toEqual([url]);
    });
    it('keeps an applied association after save failure and does not duplicate it or its event', async () => {
        const { actions, data, save } = setup({ saved: false });
        expect(await actions.setPortfolioTaskPullRequests('p', 1, [url])).toBe(true);
        const eventId = data().extensions.timeline!.events[1].id;
        expect(await actions.setPortfolioTaskPullRequests('p', 1, [url])).toBe(true);
        expect(data().extensions.timeline!.events).toHaveLength(2);
        expect(data().extensions.timeline!.events[1].id).toBe(eventId);
        expect(save).toHaveBeenCalledTimes(1);
    });
    it('does not make network requests while validating, listing, mutating or serializing', async () => {
        const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
        try {
            const { actions, data } = setup();
            await actions.setPortfolioTaskPullRequests('p', 1, [url]);
            expect(safePullRequestHref(data().board.tasks[0].pullRequests![0])).toBe(url);
            serializeBoardDataFromObject(data());
            expect(fetch).not.toHaveBeenCalled();
        } finally { vi.unstubAllGlobals(); }
    });
});
