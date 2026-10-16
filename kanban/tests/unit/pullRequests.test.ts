import { expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { getPullRequests, normalizePullRequest, savePullRequest } from '../../src/domain/pullRequests';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';

it('supports optional URLs, canonical GitHub links, correction and non-duplicate associations', () => {
    const data = createEmptyProjectData('PRs'); data.board.tasks = [normalizeTask({ id: 1, title: 'Task' })];
    const local = savePullRequest(data, 1, { number: '#123', repository: '', url: '', notes: '' });
    expect(local.url).toBe('');
    const corrected = savePullRequest(data, 1, { ...local, url: 'https://github.com/team/repo/pull/123?tab=files' });
    expect(corrected.repository).toBe('team/repo');
    expect(corrected.url).toBe('https://github.com/team/repo/pull/123');
    expect(() => savePullRequest(data, 1, { number: '123', repository: 'team/repo', url: '', notes: '' })).toThrow(/already linked/);
    expect(getPullRequests(serializeBoardDataFromObject(data)).byTaskId[1]).toEqual([corrected]);
});

it('rejects dangerous, mismatched and non-GitHub URLs', () => {
    for (const url of ['javascript:alert(1)', 'http://github.com/a/b/pull/1', 'https://github.com.evil.test/a/b/pull/1', 'https://github.com/a/b/pull/2']) {
        expect(() => normalizePullRequest({ number: '1', repository: '', notes: '', url })).toThrow();
    }
});

it('treats a link without repository as a duplicate of the same PR number', () => {
    const data = createEmptyProjectData('PRs'); data.board.tasks = [normalizeTask({ id: 1, title: 'Task' })];
    savePullRequest(data, 1, { number: '#123', repository: '', url: '', notes: '' });
    expect(() => savePullRequest(data, 1, { number: '123', repository: 'team/repo', url: '', notes: '' })).toThrow(/already linked/);
});
