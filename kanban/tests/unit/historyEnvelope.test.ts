import { expect, it } from 'vitest';
import { MemoryFile } from '../support/projectDirectory';
import { validateHistoryEnvelope } from '../../src/infrastructure/persistence/historyEnvelope';

function history(events: unknown[] = []) {
    return JSON.stringify({ schemaVersion: 1, projectId: 'project-a', baselineEventId: 'baseline', events, recordHistory: { control: {}, transfers: {} }, transactions: [] });
}

it('scans escaped strings and Unicode across chunks without materializing event JSON', async () => {
    const file = new MemoryFile('history.json', history([{ text: 'é \\" ] } \\\\ '.repeat(20000), nested: [{ values: [1, 2, { title: 'transactions' }] }] }]));
    await expect(validateHistoryEnvelope(file, 'project-a', 'baseline')).resolves.toBe(false);
    expect(file.fullReads).toBe(0);
});

it('rejects legacy root keys after a large event array', async () => {
    const raw = JSON.parse(history([{ text: 'x'.repeat(150000) }]));
    const file = new MemoryFile('history.json', JSON.stringify({ ...raw, version: 1, timeline: {}, transactions: [] }));
    await expect(validateHistoryEnvelope(file, 'project-a', 'baseline')).rejects.toThrow('ambiguous');
});

it('rejects duplicate root keys and an invalid final journal key', async () => {
    const duplicate = history().replace('"schemaVersion":1,', '"schemaVersion":1,"schemaVersion":1,');
    await expect(validateHistoryEnvelope(new MemoryFile('history.json', duplicate), 'project-a', 'baseline')).rejects.toThrow();
    const raw = JSON.parse(history());
    const { transactions, ...rest } = raw;
    await expect(validateHistoryEnvelope(new MemoryFile('history.json', JSON.stringify({ transactions, ...rest })), 'project-a', 'baseline')).rejects.toThrow();
});

it('rereads identity even when length and modification time have not changed', async () => {
    const file = new MemoryFile('history.json', history());
    await validateHistoryEnvelope(file, 'project-a', 'baseline');
    file.setText(history().replace('project-a', 'project-b'));
    await expect(validateHistoryEnvelope(file, 'project-a', 'baseline', true)).rejects.toThrow('identity');
});
