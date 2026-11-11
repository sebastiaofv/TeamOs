import { expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { appendTimelineEvent, ensureBoardTimelineBaseline } from '../../src/domain/timeline';
import { BoardRepository, writeJsonToFileHandle } from '../../src/infrastructure/persistence/boardRepository';
import { createProjectDirectory, loadDirectoryHistory, openProjectDirectory } from '../../src/infrastructure/persistence/projectDirectory';
import { withProjectIdentityLock } from '../../src/infrastructure/persistence/projectLock';
import { MemoryDirectory } from '../support/projectDirectory';

async function savedTwice() {
    const parent = new MemoryDirectory('projects');
    const data = createEmptyProjectData('Folding', 'FLD');
    ensureBoardTimelineBaseline(data);
    await createProjectDirectory(parent, 'folding', data);
    const directory = await parent.getDirectoryHandle('folding');
    const history = await directory.getFileHandle('history.json');
    const handle = await openProjectDirectory(directory);
    const record = await BoardRepository.createRecordFromHandle(handle);
    for (const title of ['First', 'Second']) {
        appendTimelineEvent(record.data, { kind: 'board.settings.updated', entityType: 'board', entityId: 'board', summary: title, changes: { title: { before: record.data.board.settings.title, after: title } } });
        record.data.board.settings.title = title;
        await writeJsonToFileHandle(handle, record.data);
    }
    return { handle, history, record, projectId: record.data.extensions.project!.id };
}
const journal = (text: string) => JSON.parse(text) as { events: { id: string }[]; transactions: { kind: string; events?: unknown[] }[] };

it('folds committed saves into events when history is loaded, and keeps appending after', async () => {
    const { handle, history, record } = await savedTwice();
    const before = journal(history.text());
    expect(before.transactions.filter((entry) => entry.kind === 'stage')).toHaveLength(2);
    const loaded = await loadDirectoryHistory(handle);
    const after = journal(history.text());
    expect(after.events.map((event) => event.id)).toEqual(loaded!.events.map((event) => event.id));
    expect(after.events).toHaveLength(3);
    expect(after.transactions).toHaveLength(2);
    expect(after.transactions[0].events).toEqual([]);

    record.data.extensions.timeline = loaded;
    appendTimelineEvent(record.data, { kind: 'board.settings.updated', entityType: 'board', entityId: 'board', summary: 'Third', changes: { title: { before: 'Second', after: 'Third' } } });
    record.data.board.settings.title = 'Third';
    await writeJsonToFileHandle(handle, record.data);
    expect((await loadDirectoryHistory(handle))!.events.map((event) => event.summary)).toEqual([expect.any(String), 'First', 'Second', 'Third']);
});

it('leaves the journal untouched while a save holds the project lock', async () => {
    const { handle, history, projectId } = await savedTwice();
    const before = history.text();
    const loaded = await withProjectIdentityLock(projectId, () => loadDirectoryHistory(handle));
    expect(loaded!.events).toHaveLength(3);
    expect(history.text()).toBe(before);
});

it('leaves a malformed history to the loader, which names the file', async () => {
    const { handle, history } = await savedTwice();
    const broken = history.text().replace('"events":[', '"events":[invalid');
    history.setText(broken);
    await expect(loadDirectoryHistory(handle)).rejects.toThrow('folding/history.json');
    expect(history.text()).toBe(broken);
});
