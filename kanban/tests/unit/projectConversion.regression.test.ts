import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEmptyProjectData } from '../../src/domain/board';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { ensureBoardTimelineBaseline } from '../../src/domain/timeline';
import { createProjectDirectory, openProjectDirectory } from '../../src/infrastructure/persistence/projectDirectory';
import { BoardRepository, writeJsonToFileHandle } from '../../src/infrastructure/persistence/boardRepository';
import { MemoryDirectory, MemoryFile } from '../support/projectDirectory';

function legacyFolder() {
    const directory = new MemoryDirectory('alpha');
    const project = new MemoryFile('project.json', readFileSync('tests/fixtures/legacy/folder-v6/alpha/project.json', 'utf8'));
    const history = new MemoryFile('history.json', readFileSync('tests/fixtures/legacy/folder-v6/alpha/history.json', 'utf8'));
    directory.children.set('project.json', project);
    directory.children.set('history.json', history);
    directory.children.set('attachments', new MemoryDirectory('attachments'));
    return { directory, project, history };
}

it('preserves age-in-state after an actual folder save and reopen', async () => {
    const data = serializeBoardDataFromObject(JSON.parse(readFileSync('tests/fixtures/manual/us-6.board.json', 'utf8')));
    data.board.tasks[0].statusChangedAt = '2026-01-01T00:00:00.000Z';
    data.board.tasks[0].updatedAt = '2026-02-01T00:00:00.000Z';
    const root = new MemoryDirectory('root');
    await createProjectDirectory(root, 'age', data);
    const record = await BoardRepository.createRecordFromHandle(await openProjectDirectory(await root.getDirectoryHandle('age')));
    expect(record.data.board.tasks[0].statusChangedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(record.data.board.tasks[0].updatedAt).toBe('2026-02-01T00:00:00.000Z');
});

it.each(['legacy', 'wrong-project', 'wrong-baseline', 'reordered-wrong-project', 'ambiguous'])('rejects a %s history envelope without writing', async (kind) => {
    const root = new MemoryDirectory('root');
    const data = createEmptyProjectData('Envelope', 'ENV');
    ensureBoardTimelineBaseline(data);
    await createProjectDirectory(root, 'envelope', data);
    const directory = await root.getDirectoryHandle('envelope');
    const project = await directory.getFileHandle('project.json');
    const history = await directory.getFileHandle('history.json');
    const raw = JSON.parse(history.text());
    if (kind === 'legacy') history.setText(JSON.stringify({ version: 1, timeline: { version: 1, baselineEventId: '', events: [] }, archives: {}, transactions: [] }));
    else {
        if (kind === 'ambiguous') Object.assign(raw, { version: 1, timeline: { version: 1, events: [] } });
        else if (kind.includes('project')) raw.projectId = 'other';
        else raw.baselineEventId = 'other';
        history.setText(JSON.stringify(kind.startsWith('reordered') ? { events: raw.events, schemaVersion: 1, projectId: raw.projectId, baselineEventId: raw.baselineEventId, recordHistory: raw.recordHistory, transactions: [] } : raw));
    }
    const before = [project.text(), history.text(), project.writes, history.writes];
    await expect(openProjectDirectory(directory)).rejects.toThrow('history.json');
    expect([project.text(), history.text(), project.writes, history.writes]).toEqual(before);
});

it('serializes concurrent conversion and rereads current files before a waiting opener proceeds', async () => {
    const { directory, project, history } = legacyFolder();
    let release!: () => void, reached!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { reached = resolve; });
    const actual = history.getFile.bind(history);
    let first = true;
    history.getFile = async () => { if (first) { first = false; reached(); await blocked; } return actual(); };
    const converting = openProjectDirectory(directory);
    await entered;
    let opened = false;
    const waiting = openProjectDirectory(directory).then((handle) => { opened = true; return handle; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(opened).toBe(false);
    release();
    await converting;
    const record = await BoardRepository.createRecordFromHandle(await waiting);
    record.data.board.settings.title = 'Saved after conversion';
    await writeJsonToFileHandle(record.handle!, record.data);
    expect(JSON.parse(project.text()).project.title).toBe('Saved after conversion');
    expect((await BoardRepository.createRecordFromHandle(await openProjectDirectory(directory))).title).toBe('Saved after conversion');
});

it('detects an external project edit during conversion without overwriting it', async () => {
    const { directory, project, history } = legacyFolder();
    const actual = history.getFile.bind(history);
    let edited = '';
    history.getFile = async () => {
        const data = JSON.parse(project.text());
        data.board.settings.title = 'External edit';
        edited = JSON.stringify(data);
        project.setText(edited);
        return actual();
    };
    const originalHistory = history.text();
    await expect(openProjectDirectory(directory)).rejects.toThrow('changed during conversion');
    expect(project.text()).toBe(edited);
    expect(history.text()).toBe(originalHistory);
    expect(directory.children.has('backup')).toBe(false);
});

it.each(['project.json', 'history.json'])('recovers an interrupted backup %s write without rewriting verified originals', async (name) => {
    const { directory, project, history } = legacyFolder();
    const backup = await (await directory.getDirectoryHandle('backup', { create: true })).getDirectoryHandle('schema-6', { create: true });
    const target = await backup.getFileHandle(name, { create: true });
    target.failOnAttempt = 1;
    await expect(openProjectDirectory(directory)).rejects.toThrow('write denied');
    const before = [project.text(), history.text()];
    target.failOnAttempt = 0;
    await openProjectDirectory(directory);
    expect((await backup.getFileHandle('project.json')).text()).toBe(before[0]);
    expect((await backup.getFileHandle('history.json')).text()).toBe(before[1]);
    const writes = [...backup.children.values()].map((file) => (file as MemoryFile).writes);
    await openProjectDirectory(directory);
    expect([...backup.children.values()].map((file) => (file as MemoryFile).writes)).toEqual(writes);
});

it('refuses to resume from a backup belonging to another project state', async () => {
    const { directory, project, history } = legacyFolder();
    project.failWrites = true;
    await expect(openProjectDirectory(directory)).rejects.toThrow('write denied');
    project.failWrites = false;
    const external = JSON.parse(project.text());
    external.board.settings.title = 'External change during interruption';
    project.setText(JSON.stringify(external));
    const before = [project.text(), history.text()];
    const backup = await (await directory.getDirectoryHandle('backup')).getDirectoryHandle('schema-6');
    const originalBackup = (await backup.getFileHandle('project.json')).text();
    await expect(openProjectDirectory(directory)).rejects.toThrow('backup was preserved');
    expect([project.text(), history.text()]).toEqual(before);
    expect((await backup.getFileHandle('project.json')).text()).toBe(originalBackup);
});

