import { expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { appendComment, getTaskComments } from '../../src/domain/comments';
import { appendTimelineEvent, ensureBoardTimelineBaseline, reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { safeWebUrl } from '../../src/domain/links';

it('persists an immutable conversation without changing the description or duplicating its body in timeline events', () => {
    const data = createEmptyProjectData('Comments');
    data.board.tasks = [normalizeTask({ id: 1, title: 'Commented', description: 'Original problem' })];
    ensureBoardTimelineBaseline(data);
    const comment = appendComment(data, 1, 'A <script> is plain text', [], null);
    appendTimelineEvent(data, { kind: 'workitem.comment.added', entityType: 'task', entityId: '1', summary: 'Comment added', meta: { commentId: comment.id } });
    expect(data.board.tasks[0].description).toBe('Original problem');
    expect(JSON.stringify(data.extensions.timeline)).not.toContain('A <script>');
    expect(getTaskComments(serializeBoardDataFromObject(data), 1)).toEqual([comment]);
    expect(getTaskComments(reconstructBoardStateFromTimeline(data, 0), 1)).toEqual([]);
    expect(getTaskComments(reconstructBoardStateFromTimeline(data, 1), 1)).toEqual([comment]);
});

it('rejects empty/oversized comments, unsafe screenshot payloads and unsafe links', () => {
    const data = createEmptyProjectData('Comments'); data.board.tasks = [normalizeTask({ id: 1, title: 'Task' })];
    expect(() => appendComment(data, 1, '', [], null)).toThrow();
    expect(() => appendComment(data, 1, 'x'.repeat(10001), [], null)).toThrow();
    expect(safeWebUrl('javascript:alert(1)')).toBeNull();
    expect(safeWebUrl('https://user:password@example.org')).toBeNull();
    expect(safeWebUrl('https://example.org')).toBe('https://example.org/');
});
