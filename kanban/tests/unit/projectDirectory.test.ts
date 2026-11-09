import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { appendTimelineEvent, ensureBoardTimelineBaseline } from '../../src/domain/timeline';
import { cloneSerializable } from '../../src/domain/serializable';
import { createAttachmentId } from '../../src/domain/attachments';
import { createPortfolioRecord } from '../../src/infrastructure/persistence/portfolioRecord';
import { BoardRepository, writeJsonToFileHandle } from '../../src/infrastructure/persistence/boardRepository';
import { createProjectDirectory, findProjectDirectories, getDirectoryProject, openProjectDirectory, loadDirectoryHistory, resolveAttachmentBlob, activateDirectoryProject } from '../../src/infrastructure/persistence/projectDirectory';
import { ensureProjectHistoryLoaded, enqueueProjectSave, markProjectDirty, refreshProjectFileBaseline, syncProjectSaveStates } from '../../src/infrastructure/persistence/projectFiles';
import { useAppStore } from '../../src/features/portfolio/state/store';
import { newControlRecord, saveControlRecord } from '../../src/domain/projectControl';
import { MemoryDirectory, MemoryFile } from '../support/projectDirectory';

async function fixture(title = 'Folder project') {
    const parent = new MemoryDirectory('projects');
    const data = createEmptyProjectData(title, 'FLD');
    ensureBoardTimelineBaseline(data);
    appendTimelineEvent(data, { id: 'old-event', kind: 'board.settings.updated', entityType: 'board', entityId: 'board', summary: 'Existing history', changes: { title: { before: 'Old', after: title } } });
    await createProjectDirectory(parent, title, data);
    const directory = await parent.getDirectoryHandle(title);
    const project = await directory.getFileHandle('project.json');
    const history = await directory.getFileHandle('history.json');
    history.reads = 0;
    return { parent, directory, project, history, data };
}
afterEach(() => { useAppStore.setState({ portfolioBoards: [] }); syncProjectSaveStates(); });

describe('project directory persistence', () => {
    it('opens current state without reading a large history or attachment binaries', async () => {
        const { directory, history } = await fixture();
        const raw = JSON.parse(history.text());
        raw.timeline.events.push(...Array.from({ length: 10000 }, (_, index) => ({ ...raw.timeline.events[1], id: `large-${index}` })));
        history.setText(JSON.stringify(raw));
        const binary = await (await directory.getDirectoryHandle('attachments')).getFileHandle('unused', { create: true });
        binary.setText('a very large attachment');
        const handle = await openProjectDirectory(directory);
        const board = await BoardRepository.createRecordFromHandle(handle);
        expect(board.data.extensions.timeline).toBeUndefined();
        expect(history.reads).toBe(0); expect(binary.reads).toBe(0);
        const originalPrefix = history.text().slice(0, history.text().lastIndexOf(']'));
        appendTimelineEvent(board.data, { id: 'large-append', kind: 'board.settings.updated', entityType: 'board', entityId: 'board', summary: 'Append without loading history', changes: { title: { before: board.title, after: 'Updated' } } });
        board.data.board.settings.title = 'Updated';
        await writeJsonToFileHandle(handle, board.data);
        expect(history.fullReads).toBe(0);
        expect(history.text().startsWith(originalPrefix)).toBe(true);
        expect((await loadDirectoryHistory(handle))?.events).toHaveLength(10003);
        expect(history.fullReads).toBe(1);
    });

    it.each(['history.json', 'attachments', 'project.json'])('rejects a missing or wrong-type %s before import', async (name) => {
        const { directory, project } = await fixture();
        const original = project.text();
        directory.children.delete(name);
        await expect(openProjectDirectory(directory)).rejects.toThrow(name);
        directory.children.set(name, name === 'attachments' ? new MemoryFile(name) : new MemoryDirectory(name));
        await expect(openProjectDirectory(directory)).rejects.toThrow(name);
        if (name !== 'project.json') expect(project.text()).toBe(original);
    });

    it('continues valid siblings and ignores nonprojects', async () => {
        const { parent, directory } = await fixture();
        const broken = await parent.getDirectoryHandle('broken', { create: true });
        broken.children.set('project.json', new MemoryFile('project.json', '{}'));
        await parent.getDirectoryHandle('notes', { create: true });
        const result = await findProjectDirectories(parent);
        expect(result.handles).toHaveLength(1);
        expect(result.errors).toHaveLength(1); expect(result.errors[0]).toContain('broken');
        expect((await BoardRepository.createRecordFromHandle(result.handles[0])).title).toBe(directory.name);
    });

    it('reports malformed project data and defers malformed history errors', async () => {
        const { directory, project, history } = await fixture();
        history.setText('invalid JSON');
        const handle = await openProjectDirectory(directory);
        expect(history.reads).toBe(0);
        await expect(loadDirectoryHistory(handle)).rejects.toThrow('Folder project/history.json');
        project.setText('{}');
        await expect(openProjectDirectory(directory)).rejects.toThrow('project.json');
    });

    it('saves a new event before history consultation without discarding older events', async () => {
        const { directory, history, project } = await fixture();
        const handle = await openProjectDirectory(directory);
        const board = await BoardRepository.createRecordFromHandle(handle);
        appendTimelineEvent(board.data, { id: 'new-event', kind: 'board.settings.updated', entityType: 'board', entityId: 'board', summary: 'New event', changes: { title: { before: board.title, after: 'Renamed' } } });
        board.data.board.settings.title = 'Renamed';
        await writeJsonToFileHandle(handle, board.data);
        expect(history.fullReads).toBe(0);
        expect(getDirectoryProject(handle)?.loaded).toBe(false);
        expect((await loadDirectoryHistory(handle))?.events.map((event) => event.id)).toEqual([expect.stringContaining('baseline_'), 'old-event', 'new-event']);
        expect(JSON.parse(project.text()).extensions.timeline).toBeUndefined();
        expect(getDirectoryProject(handle)?.loaded).toBe(false);
    });

    it('does not read or rewrite history for a current-state-only change', async () => {
        const { directory, history } = await fixture();
        const handle = await openProjectDirectory(directory);
        const board = await BoardRepository.createRecordFromHandle(handle);
        const writes = history.writes;
        board.data.board.settings.title = 'State only';
        await writeJsonToFileHandle(handle, board.data);
        expect(history.reads).toBe(0); expect(history.writes).toBe(writes);
    });

    it('extracts binary contents once and keeps historical attachments after removal', async () => {
        const { parent, data } = await fixture();
        const attachment = { id: createAttachmentId(), name: 'test.txt', mime: 'text/plain', kind: 'file' as const, dataUrl: 'data:text/plain;base64,aGVsbG8=', sizeBytes: 5, createdAt: data.meta.createdAt };
        appendTimelineEvent(data, { id: 'attachment', kind: 'task.created', entityType: 'task', entityId: '1', summary: 'Historical attachment', snapshot: { ...data.board.tasks[0], attachments: [attachment] } });
        const handle = await createProjectDirectory(parent, 'with-attachment', data);
        activateDirectoryProject(handle);
        const directory = await parent.getDirectoryHandle('with-attachment');
        const history = await directory.getFileHandle('history.json');
        expect(history.text()).not.toContain('data:text/plain');
        const reference = JSON.parse(history.text()).timeline.events.at(-1).snapshot.attachments[0].dataUrl;
        const binaries = await directory.getDirectoryHandle('attachments');
        expect(binaries.children.size).toBe(1);
        expect(await (await resolveAttachmentBlob(reference)).text()).toBe('hello');
        const binary = [...binaries.children.values()][0];
        expect(binary).toBeInstanceOf(MemoryFile);
        const reads = binary instanceof MemoryFile ? binary.reads : -1;
        const board = await BoardRepository.createRecordFromHandle(handle);
        await writeJsonToFileHandle(handle, board.data);
        expect(binary instanceof MemoryFile && binary.reads).toBe(reads);
        expect(binaries.children.size).toBe(1);
    });

    it('preserves the original legacy JSON and separates control history during migration', async () => {
        const data = createEmptyProjectData('Migration', 'MIG');
        const risk = newControlRecord('risks'); risk.title = 'A risk';
        saveControlRecord(data, risk, 'Tester');
        ensureBoardTimelineBaseline(data);
        const original = new MemoryFile('legacy.board.json', JSON.stringify(data));
        const before = original.text();
        const imported = await BoardRepository.createRecordFromHandle(original);
        const parent = new MemoryDirectory('destination');
        const handle = await createProjectDirectory(parent, 'migration', imported.data);
        const directory = await parent.getDirectoryHandle('migration');
        const current = JSON.parse((await directory.getFileHandle('project.json')).text());
        expect(current.extensions.projectControl.records[0].history).toEqual([]);
        expect(current.extensions.timeline).toBeUndefined();
        expect(JSON.parse((await directory.getFileHandle('history.json')).text()).archives).toHaveProperty(`control:${data.extensions.projectControl!.records[0].id}`);
        expect((await BoardRepository.createRecordFromHandle(handle)).data.extensions.projectControl?.records[0].history).toHaveLength(1);
        expect(original.text()).toBe(before); expect(original.writes).toBe(0);
    });

    it('keeps old history authoritative when a project write fails after staging', async () => {
        const { directory, project, history } = await fixture();
        const handle = await openProjectDirectory(directory);
        const board = await BoardRepository.createRecordFromHandle(handle);
        appendTimelineEvent(board.data, { id: 'not-committed', kind: 'board.settings.updated', entityType: 'board', entityId: 'board', summary: 'Pending', changes: { title: { before: board.title, after: 'Pending' } } });
        board.data.board.settings.title = 'Pending';
        project.failWrites = true;
        await expect(writeJsonToFileHandle(handle, board.data)).rejects.toThrow('write denied');
        expect(JSON.parse(history.text()).transactions[0].kind).toBe('stage');
        const reopened = await openProjectDirectory(directory);
        expect((await loadDirectoryHistory(reopened))?.events.some((event) => event.id === 'not-committed')).toBe(false);
        project.failWrites = false;
        await writeJsonToFileHandle(reopened, board.data);
        expect((await loadDirectoryHistory(reopened))?.events.at(-1)?.id).toBe('not-committed');
    });

    it('refuses existing destination folders and denied permissions without overwriting', async () => {
        const { parent, project, data } = await fixture();
        const original = project.text();
        await expect(createProjectDirectory(parent, 'Folder project', data)).rejects.toThrow('already exists');
        expect(project.text()).toBe(original);
        parent.permission = 'denied';
        await expect(findProjectDirectories(parent)).rejects.toThrow('permission denied');
        await expect(createProjectDirectory(parent, 'other', data)).rejects.toThrow('permission denied');
        expect(parent.children.size).toBe(1);
    });

    it('works through the save queue, hydrates on consultation and reopens coherently', async () => {
        const { directory, history } = await fixture();
        const handle = await openProjectDirectory(directory);
        const board = await BoardRepository.createRecordFromHandle(handle);
        useAppStore.setState({ portfolioBoards: [board] }); syncProjectSaveStates();
        await refreshProjectFileBaseline(board);
        expect(history.reads).toBe(0);
        const updated = cloneSerializable(board.data);
        updated.board.settings.title = 'Queued save';
        appendTimelineEvent(updated, { id: 'queued', kind: 'board.settings.updated', entityType: 'board', entityId: 'board', summary: 'Queued', changes: { title: { before: board.title, after: 'Queued save' } } });
        useAppStore.setState({ portfolioBoards: [{ ...board, data: updated }] });
        markProjectDirty(board.id);
        expect(await enqueueProjectSave(board)).toBe(true);
        expect(useAppStore.getState().projectSaveStateById.get(board.id)?.status).toBe('idle');
        await ensureProjectHistoryLoaded(board.id);
        expect(useAppStore.getState().portfolioBoards[0].data.extensions.timeline?.events.map((event) => event.id)).toContain('old-event');
        const reopened = await BoardRepository.createRecordFromHandle(await openProjectDirectory(directory));
        expect(reopened.data.board.settings.title).toBe('Queued save');
        expect(reopened.data.extensions.timeline).toBeUndefined();
        expect((await loadDirectoryHistory(reopened.handle!))?.events.at(-1)?.id).toBe('queued');
    });


    it('recovers a failed commit marker before an unrelated state save without loading history', async () => {
        const { directory, history } = await fixture();
        const handle = await openProjectDirectory(directory);
        const board = await BoardRepository.createRecordFromHandle(handle);
        appendTimelineEvent(board.data, { id: 'commit-recovery', kind: 'board.settings.updated', entityType: 'board', entityId: 'board', summary: 'Committed project', changes: { title: { before: board.title, after: 'Saved state' } } });
        board.data.board.settings.title = 'Saved state';
        history.failOnAttempt = history.attempts + 2;
        await expect(writeJsonToFileHandle(handle, board.data)).rejects.toThrow('write denied');
        const reopenedHandle = await openProjectDirectory(directory);
        const reopened = await BoardRepository.createRecordFromHandle(reopenedHandle);
        expect(reopened.data.board.settings.title).toBe('Saved state');
        reopened.data.board.settings.title = 'Another state-only save';
        await writeJsonToFileHandle(reopenedHandle, reopened.data);
        expect(history.fullReads).toBe(0);
        expect((await loadDirectoryHistory(reopenedHandle))?.events.at(-1)?.id).toBe('commit-recovery');
    });

    it('leaves history untouched for a state-only save after hydration', async () => {
        const { directory, history } = await fixture();
        const handle = await openProjectDirectory(directory);
        const board = await BoardRepository.createRecordFromHandle(handle);
        useAppStore.setState({ portfolioBoards: [board] }); syncProjectSaveStates();
        await refreshProjectFileBaseline(board); await ensureProjectHistoryLoaded(board.id);
        const current = useAppStore.getState().portfolioBoards[0];
        const writes = history.writes; const reads = history.fullReads;
        const draft = cloneSerializable(current.data); draft.board.settings.title = 'Only state';
        await writeJsonToFileHandle(handle, draft);
        expect(history.writes).toBe(writes); expect(history.fullReads).toBe(reads);
    });

    it('preserves encoded legacy project identities and their attachment references', async () => {
        const data = createEmptyProjectData('Legacy namespace', 'LGC');
        const id = 'legacy-project_2026-11-06T09%3A00%3A00Z_Project%20Name';
        data.extensions.project!.id = id;
        ensureBoardTimelineBaseline(data);
        appendTimelineEvent(data, { id: 'legacy-attachment', kind: 'task.created', entityType: 'task', entityId: '1', summary: 'Legacy attachment', snapshot: { attachments: [{ id: 'old-file', name: 'report.txt', mime: 'text/plain', kind: 'file', dataUrl: 'data:text/plain;base64,aGVsbG8=', sizeBytes: 5, createdAt: data.meta.createdAt }] } });
        const parent = new MemoryDirectory('migration');
        await createProjectDirectory(parent, 'legacy', data);
        const handle = await openProjectDirectory(await parent.getDirectoryHandle('legacy'));
        activateDirectoryProject(handle);
        expect((await BoardRepository.createRecordFromHandle(handle)).data.extensions.project?.id).toBe(id);
        const history = await loadDirectoryHistory(handle);
        const source = history?.events.at(-1)?.snapshot?.attachments?.[0]?.dataUrl;
        expect(source).toContain(encodeURIComponent(id));
        expect(await (await resolveAttachmentBlob(source!)).text()).toBe('hello');
    });

    it('does not accept project.json as a loose legacy import', async () => {
        const file = new MemoryFile('project.json', JSON.stringify(createEmptyProjectData('Loose')));
        await expect(BoardRepository.createRecordFromFile({ file: await file.getFile() })).rejects.toThrow('Open the project folder');
        expect(createPortfolioRecord({ data: createEmptyProjectData('Normal legacy') }).title).toBe('Normal legacy');
    });
});

describe('loaded-history performance', () => {
    it('externalizes new history entries without walking already persisted event payloads', async () => {
        const { directory } = await fixture();
        const handle = await openProjectDirectory(directory);
        const record = await BoardRepository.createRecordFromHandle(handle);
        useAppStore.setState({ portfolioBoards: [record] }); syncProjectSaveStates();
        await refreshProjectFileBaseline(record);
        await ensureProjectHistoryLoaded(record.id);
        const data = useAppStore.getState().portfolioBoards[0].data;
        appendTimelineEvent(data, { id: 'delta', kind: 'board.settings.updated', entityType: 'board', entityId: 'board', summary: 'New title', changes: { title: { before: data.board.settings.title, after: 'Changed' } } });
        data.board.settings.title = 'Changed';
        const old = data.extensions.timeline!.events.find((event) => event.id === 'old-event')!;
        const changes = old.changes;
        let reads = 0;
        Object.defineProperty(old, 'changes', { enumerable: true, get: () => { reads++; return changes; } });
        await writeJsonToFileHandle(handle, data);
        expect(reads).toBe(0);
        expect((await loadDirectoryHistory(handle))!.events.map((event) => event.id)).toEqual([expect.stringContaining('baseline_'), 'old-event', 'delta']);
    });

    it('coalesces simultaneous history consumers into one load', async () => {
        const { directory, history } = await fixture();
        const handle = await openProjectDirectory(directory);
        const record = await BoardRepository.createRecordFromHandle(handle);
        useAppStore.setState({ portfolioBoards: [record] }); syncProjectSaveStates();
        await refreshProjectFileBaseline(record);
        await Promise.all([ensureProjectHistoryLoaded(record.id), ensureProjectHistoryLoaded(record.id)]);
        expect(history.fullReads).toBe(1);
        expect(getDirectoryProject(handle)!.loaded).toBe(true);
    });

    it('allows retry after a shared history load fails', async () => {
        const { directory, history } = await fixture();
        const original = history.text();
        history.setText('invalid JSON');
        const handle = await openProjectDirectory(directory);
        const record = await BoardRepository.createRecordFromHandle(handle);
        useAppStore.setState({ portfolioBoards: [record] }); syncProjectSaveStates();
        await refreshProjectFileBaseline(record);
        const failed = await Promise.allSettled([ensureProjectHistoryLoaded(record.id), ensureProjectHistoryLoaded(record.id)]);
        expect(failed.map((result) => result.status)).toEqual(['rejected', 'rejected']);
        expect(getDirectoryProject(handle)!.loaded).toBe(false);
        history.setText(original);
        await ensureProjectHistoryLoaded(record.id);
        expect(history.fullReads).toBe(2);
        expect(getDirectoryProject(handle)!.loaded).toBe(true);
    });
});
