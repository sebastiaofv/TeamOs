import { expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { appendTimelineEvent, ensureBoardTimelineBaseline } from '../../src/domain/timeline';
import { ensureTaskAuditEvents, historyValue, workitemHistory } from '../../src/domain/workitemHistory';
import { taskRef } from '../../src/domain/relations';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';

it('fills board-level audit gaps once and filters by exact task identity', () => {
    const before = serializeBoardDataFromObject(createEmptyProjectData('History'));
    before.board.tasks = [normalizeTask({ id: 1, title: 'One' }), normalizeTask({ id: 2, title: 'Two' })];
    const data = structuredClone(before);
    ensureBoardTimelineBaseline(data);
    const start = data.extensions.timeline!.events.length;
    data.board.tasks[0].assignees = ['Ana'];
    data.board.tasks[0].phaseId = 'phase';
    appendTimelineEvent(data, { kind: 'task.updated', entityType: 'task', entityId: '2', summary: 'Other task' });
    ensureTaskAuditEvents(data, before, start);
    ensureTaskAuditEvents(data, before, start);
    const events = workitemHistory([data], taskRef(data, 1));
    expect(events).toHaveLength(1);
    expect(events[0].changes?.assignees).toEqual({ before: [], after: ['Ana'] });
    expect(workitemHistory([serializeBoardDataFromObject(data)], taskRef(data, 1))).toEqual(events);
    expect(events[0].meta?.actor).toBeUndefined();
});

it('renders attachment names rather than embedded file payloads', () => {
    expect(historyValue([{ name: 'screenshot.png', dataUrl: 'data:image/png;base64,secret' }])).toBe('screenshot.png');
});
