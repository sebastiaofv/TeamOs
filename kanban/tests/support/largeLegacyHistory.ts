// The large legacy fixture keeps only its baseline and record histories in the
// repository. Its 10,000 identical settings events are rebuilt here, exactly as
// test-board/us-25/generate.mjs produced them before the v1 format.

const TITLE = 'US-25 Beta — large history and Project Control';

export function expandLargeLegacyHistory(historyText: string, count = 10000): string {
    const history = JSON.parse(historyText) as { timeline: { events: unknown[] } };
    for (let index = 0; index < count; index++) {
        history.timeline.events.push({
            id: `us25-large-${index}`,
            at: '2026-11-06T09:00:00.000Z',
            kind: 'board.settings.updated',
            entityType: 'board',
            entityId: 'board',
            summary: `Historical event ${index + 1}`,
            changes: { title: { before: TITLE, after: TITLE } }
        });
    }
    return JSON.stringify(history, null, 2);
}
