// Deterministic manual-test data generator. Run from any directory with Node.
import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';
const at = '2026-10-19T10:00:00.000Z';
const createdAt = '2026-10-01T09:00:00.000Z';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const task = (id, title, extra = {}) => ({ id, title, description: 'Description stays independent from the conversation.', status: 'to-do', archived: false, checklist: [], priority: null, dueDate: '', createdAt, updatedAt: createdAt, ...extra });
const data = {
    meta: { schemaVersion: 2, appId: 'teamos-kanban', createdAt, updatedAt: at },
    board: { columns: [{ status: 'backlog', title: 'Backlog' }, { status: 'to-do', title: 'To Do' }, { status: 'doing', title: 'Doing' }, { status: 'done', title: 'Done' }],
        settings: { title: 'US-7 · Offline workitem conversations' }, tasks: [task(701, 'Delivery conversation · 55 comments', { status: 'done', assignees: ['Ana', 'Bruno'], responsible: 'Ana' }), task(702, 'Archived discussion', { archived: true }), task(703, 'Empty conversation and session drafts')] },
    extensions: { taskIdentity: { version: 1, highWaterMark: 703 }, conversations: { version: 1, entries: [] }, timeline: { version: 1, baselineEventId: 'us7-baseline', events: [] } }
};
data.extensions.timeline.events.push({ id: 'us7-baseline', at: '2026-10-19T09:00:00.000Z', kind: 'board.baseline', entityType: 'board', entityId: 'board', summary: 'Baseline snapshot created', snapshot: { meta: data.meta, board: JSON.parse(JSON.stringify(data.board)), extensions: {} } });
for (let i = 1; i <= 56; i++) {
    const taskId = i === 56 ? 702 : 701;
    const id = `us7-comment-${i}`;
    const eventId = `comment-event-${id}`;
    const when = i % 2 ? at : '2026-10-19T09:30:00.000Z';
    const workitemKey = `baseline:us7-baseline:${taskId}`;
    const author = { name: i % 2 ? 'Ana (demo)' : 'Bruno (demo)', kind: 'local' };
    const images = [1, 54, 55].includes(i) ? [{ id: `us7-image-${i}`, name: `Screenshot-${i}.png`, mime: 'image/png', sizeBytes: 70, kind: 'image', dataUrl: png, createdAt: when }] : [];
    const text = i === 54 ? '' : i === 55 ? 'Final clarification.\n@Bruno remains plain text. https://code.example.test/review?q=demo#discussion\n<img src=x onerror=alert(1)> is text, not HTML.' : `Comment ${String(i).padStart(2, '0')} · publication order is canonical, not timestamp order.`;
    data.extensions.conversations.entries.push({ id, taskId, workitemKey, workitemCreatedAt: createdAt, eventId, at: when, author, text, images });
    data.extensions.timeline.events.push({ id: eventId, at: when, kind: 'task.comment.published', entityType: 'task', entityId: String(taskId), summary: `Comment published: #${taskId} · ${author.name}`, meta: { historyVersion: 1, operationId: eventId, commentId: id, workitemKey, author } });
}
writeFileSync(new URL('./us-7.board.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
