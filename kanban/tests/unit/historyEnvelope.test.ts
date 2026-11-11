import { expect, it } from 'vitest';
import { MemoryFile } from '../support/projectDirectory';
import { checkHistoryIdentity, verifyHistoryStructure } from '../../src/infrastructure/persistence/historyEnvelope';

function history(events: unknown[] = []) {
    return JSON.stringify({ schemaVersion: 1, projectId: 'project-a', baselineEventId: 'baseline', events, recordHistory: { control: {}, transfers: {} }, transactions: [] });
}
const file = (text: string) => new MemoryFile('history.json', text);

it('checks identity on open without reading the events', async () => {
    const large = file(history([{ text: 'x'.repeat(500000) }]));
    await expect(checkHistoryIdentity(large, 'project-a', 'baseline')).resolves.toBeUndefined();
    expect(large.fullReads).toBe(0);
    await expect(checkHistoryIdentity(large, 'project-b', 'baseline')).rejects.toThrow('different project');
    await expect(checkHistoryIdentity(large, 'project-a', 'other')).rejects.toThrow('baseline');
});

it('rejects a legacy, reordered or truncated file on open', async () => {
    const raw = JSON.parse(history());
    const { events, ...rest } = raw;
    for (const text of [
        JSON.stringify({ version: 1, timeline: { version: 1, events: [] }, transactions: [] }),
        JSON.stringify({ events, ...rest }),
        history().slice(0, -2),
        JSON.stringify({ ...raw, version: 1, timeline: {} })
    ]) await expect(checkHistoryIdentity(file(text), 'project-a', 'baseline')).rejects.toThrow('ambiguous');
});

it('scans escaped strings and Unicode across chunks without materializing event JSON', async () => {
    const large = file(history([{ text: 'é \\" ] } \\\\ '.repeat(20000), nested: [{ values: [1, 2, { title: 'transactions' }] }] }]));
    await expect(verifyHistoryStructure(large, 'project-a', 'baseline')).resolves.toBeUndefined();
    expect(large.fullReads).toBe(0);
});

it('refuses to append after root keys that the open check cannot see', async () => {
    const trailing = file(history([{ text: 'x'.repeat(150000) }]).replace(/\}$/, ',"other":[]}'));
    await expect(checkHistoryIdentity(trailing, 'project-a', 'baseline')).resolves.toBeUndefined();
    await expect(verifyHistoryStructure(trailing, 'project-a', 'baseline')).rejects.toThrow('ambiguous');
    const legacy = file(history().replace('"recordHistory"', '"version":1,"recordHistory"'));
    await expect(verifyHistoryStructure(legacy, 'project-a', 'baseline')).rejects.toThrow('ambiguous');
});

it('rejects duplicate root keys and a journal that is not the last key', async () => {
    const duplicate = history().replace('"recordHistory"', '"events":[],"recordHistory"');
    await expect(verifyHistoryStructure(file(duplicate), 'project-a', 'baseline')).rejects.toThrow('ambiguous');
    const swapped = history().replace('"recordHistory":{"control":{},"transfers":{}},"transactions":[]', '"transactions":[],"recordHistory":{"control":{},"transfers":{}}');
    await expect(verifyHistoryStructure(file(swapped), 'project-a', 'baseline')).rejects.toThrow('ambiguous');
});

it('rereads identity even when length and modification time have not changed', async () => {
    const same = file(history());
    await verifyHistoryStructure(same, 'project-a', 'baseline');
    same.setText(history().replace('project-a', 'project-b'));
    await expect(verifyHistoryStructure(same, 'project-a', 'baseline')).rejects.toThrow('different project');
});

// The scanner is hand-written, so compare it with JSON.parse over generated input.
it('agrees with JSON.parse on generated histories and their corruptions', async () => {
    let seed = 20261111;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
    const fragments = ['"', '\\', ']', '}', '[', '{', ',', ':', 'transactions', 'é', ' ', '\n', '😀', 'events', ' '];
    const text = () => Array.from({ length: Math.floor(random() * 12) }, () => pick(fragments)).join('');
    const value = (depth: number): unknown => {
        const kind = depth > 3 ? pick(['string', 'number', 'null']) : pick(['string', 'number', 'null', 'bool', 'array', 'object']);
        if (kind === 'string') return text();
        if (kind === 'number') return pick([0, -1.5, 1e21, 42]);
        if (kind === 'null') return null;
        if (kind === 'bool') return random() < 0.5;
        if (kind === 'array') return Array.from({ length: Math.floor(random() * 4) }, () => value(depth + 1));
        return Object.fromEntries(Array.from({ length: Math.floor(random() * 4) }, () => [text(), value(depth + 1)]));
    };
    const corruptions: ((text: string) => string)[] = [
        (text) => text.replace(/\}$/, `,${JSON.stringify(text.length % 2 ? 'timeline' : 'extra')}:[]}`),
        (text) => text.replace('"recordHistory":', '"projectId":"project-a","recordHistory":'),
        (text) => text.replace('"schemaVersion":1', '"schemaVersion":2'),
        (text) => text.replace('"baselineEventId":"baseline"', '"baselineEventId":7'),
        (text) => text.slice(0, -1)
    ];
    for (let round = 0; round < 300; round++) {
        const events = Array.from({ length: Math.floor(random() * 5) }, () => value(0));
        const body = { schemaVersion: 1, projectId: 'project-a', baselineEventId: 'baseline', events, recordHistory: { control: { [text()]: [value(1)] }, transfers: {} }, transactions: [value(1)] };
        // Pretty-print some rounds: the scanner must not depend on the app's layout.
        const valid = JSON.stringify(body, null, round % 3 === 0 ? 2 : 0);
        expect(JSON.parse(valid)).toEqual(JSON.parse(JSON.stringify(body)));
        await expect(verifyHistoryStructure(file(valid), 'project-a', 'baseline'), valid).resolves.toBeUndefined();
        const corrupt = pick(corruptions)(JSON.stringify(body));
        await expect(verifyHistoryStructure(file(corrupt), 'project-a', 'baseline'), corrupt).rejects.toThrow();
    }
});
