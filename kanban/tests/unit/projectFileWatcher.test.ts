import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import type { BoardData } from '../../src/domain/types';
import type { BoardRecord } from '../../src/features/portfolio/types';
import { cloneSerializable } from '../../src/domain/serializable';
import { checkProjectFilesNow, primeProjectFileBaselines } from '../../src/infrastructure/persistence/projectFileWatcher';
import { createProjectSaveState, enqueueProjectSave, forgetProjectFileState, getProjectFileState, getProjectSaveState, markProjectDirty, resolveProjectConflicts } from '../../src/infrastructure/persistence/projectFiles';
import { useAppStore } from '../../src/features/portfolio/state/store';

async function setup() {
  const data = createEmptyProjectData('Initial');
  let text = JSON.stringify(data);
  const writes: string[] = [];
  let afterWrite = () => {};
  const handle = {
    name: 'project.board.json',
    async getFile() {
      const snapshot = text;
      return { name: handle.name, size: 100, lastModified: 10, async text() { return snapshot; } };
    },
    async createWritable() {
      return { async write(value: string) { text = value; writes.push(value); }, async close() { afterWrite(); } };
    }
  };
  const record: BoardRecord = { id: 'p1', colorSeed: 0, handle, fileName: handle.name, title: 'Initial', data };
  useAppStore.setState({ portfolioBoards: [record], projectSaveStateById: new Map([['p1', createProjectSaveState()]]) });
  await primeProjectFileBaselines([record]);
  const edit = (update: (draft: BoardData) => void) => {
    const current = cloneSerializable(useAppStore.getState().portfolioBoards[0]);
    current.handle = handle;
    update(current.data);
    useAppStore.setState({ portfolioBoards: [current] });
    markProjectDirty('p1');
  };
  const external = (update: (draft: BoardData) => void, revision = 1) => {
    const draft = JSON.parse(text) as BoardData;
    update(draft); draft.meta.revision = revision; text = JSON.stringify(draft);
  };
  return { record, edit, external, writes, read: () => JSON.parse(text) as BoardData,
    afterWrite: (fn: () => void) => { afterWrite = fn; } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  forgetProjectFileState('p1');
  useAppStore.setState({ portfolioBoards: [], projectSaveStateById: new Map() });
});

describe('conditional project persistence', () => {
  it('checks the disk before a save, merging edits made before the next poll', async () => {
    const s = await setup();
    s.external((data) => { data.extensions.project!.description = 'External'; });
    s.edit((data) => { data.board.settings.title = 'Local'; });
    expect(await enqueueProjectSave(s.record)).toBe(true);
    expect(s.read().board.settings.title).toBe('Local');
    expect(s.read().extensions.project!.description).toBe('External');
    expect(s.read().meta.revision).toBe(2);
    expect(s.writes).toHaveLength(1);
    expect(getProjectSaveState('p1')?.reconciliation?.changes.length).toBeGreaterThan(0);
  });

  it('keeps conflicts paused across dismissal, more edits and watcher checks', async () => {
    const s = await setup();
    s.external((data) => { data.board.settings.title = 'External'; });
    s.edit((data) => { data.board.settings.title = 'Local'; });
    expect(await enqueueProjectSave(s.record)).toBe(false);
    expect(getProjectSaveState('p1')?.watchStatus).toBe('conflict');
    s.edit((data) => { data.extensions.project!.description = 'More work'; });
    expect(await enqueueProjectSave(s.record)).toBe(false);
    await checkProjectFilesNow();
    expect(s.writes).toEqual([]);
    expect(getProjectSaveState('p1')?.watchStatus).toBe('conflict');
    const conflicts = getProjectSaveState('p1')!.reconciliation!.conflicts;
    expect(conflicts[0]).toMatchObject({ base: 'Initial', local: 'Local', external: 'External' });
  });

  it('resolves only conflicting fields and keeps unrelated external and local changes', async () => {
    const s = await setup();
    s.external((data) => { data.board.settings.title = 'External'; data.extensions.project!.description = 'External description'; });
    s.edit((data) => { data.board.settings.title = 'Local'; data.extensions.project!.productName = 'Local product'; });
    await enqueueProjectSave(s.record);
    const decisions = Object.fromEntries(getProjectSaveState('p1')!.reconciliation!.conflicts.map((c) => [c.key, 'local' as const]));
    expect(await resolveProjectConflicts('p1', decisions)).toBe(true);
    expect(s.read().board.settings.title).toBe('Local');
    expect(s.read().extensions.project).toMatchObject({ description: 'External description', productName: 'Local product' });
  });

  it('retains applicable decisions but asks again for values changed during reconciliation', async () => {
    const s = await setup();
    s.external((data) => { data.board.settings.title = 'External'; data.extensions.project!.description = 'External description'; });
    s.edit((data) => { data.board.settings.title = 'Local'; data.extensions.project!.description = 'Local description'; });
    await enqueueProjectSave(s.record);
    const decisions = Object.fromEntries(getProjectSaveState('p1')!.reconciliation!.conflicts.map((c) => [c.key, 'local' as const]));
    s.external((data) => { data.board.settings.title = 'New external'; }, 2);
    expect(await resolveProjectConflicts('p1', decisions)).toBe(false);
    expect(s.writes).toEqual([]);
    expect(getProjectSaveState('p1')!.reconciliation!.conflicts).toHaveLength(1);
    expect(getProjectSaveState('p1')!.reconciliation!.conflicts[0].external).toBe('New external');
    // A second confirmation includes the earlier valid decision.
    const remaining = getProjectSaveState('p1')!.reconciliation!.conflicts[0];
    expect(await resolveProjectConflicts('p1', { ...decisions, [remaining.key]: 'external' })).toBe(true);
    expect(s.read().extensions.project!.description).toBe('Local description');
    expect(s.read().board.settings.title).toBe('New external');
  });

  it('uses the exact written baseline and detects a competing post-write version', async () => {
    const s = await setup();
    s.edit((data) => { data.board.settings.title = 'Local'; });
    s.afterWrite(() => s.external((data) => { data.board.settings.title = 'Competing'; }, 1));
    expect(await enqueueProjectSave(s.record)).toBe(false);
    expect(s.writes).toHaveLength(1);
    expect(getProjectFileState('p1')!.base!.board.settings.title).toBe('Local');
    expect(getProjectSaveState('p1')?.watchStatus).toBe('conflict');
    expect(s.read().board.settings.title).toBe('Competing');
  });

  it('blocks automatic integration of equal or regressed revisions', async () => {
    const s = await setup();
    s.external((data) => { data.extensions.project!.description = 'Old copy'; }, 0);
    await checkProjectFilesNow();
    expect(s.writes).toEqual([]);
    expect(getProjectSaveState('p1')!.reconciliation!.conflicts.every((c) => c.reason === 'regression')).toBe(true);
  });

  it('detects changes despite unchanged file size and timestamp and closes stale contexts on reload', async () => {
    const s = await setup();
    s.external((data) => { data.board.settings.title = 'External'; });
    const onReload = vi.fn();
    await checkProjectFilesNow({ onReload });
    expect(useAppStore.getState().portfolioBoards[0].title).toBe('External');
    expect(onReload).toHaveBeenCalledWith('p1');
    expect(s.writes).toEqual([]);
  });

  it('uses the permanent project id for the browser write lock', async () => {
    const s = await setup();
    const request = vi.fn(async (_key: string, fn: () => Promise<boolean>) => fn());
    vi.stubGlobal('navigator', { locks: { request } });
    s.edit((data) => { data.board.settings.title = 'Local'; });
    await enqueueProjectSave(s.record);
    expect(request).toHaveBeenCalledWith(`teamos:project:${s.record.data.extensions.project!.id}`, expect.any(Function));
  });

  it('keeps edits made during a write queued until the latest version is saved', async () => {
    const s = await setup();
    s.edit((data) => { data.board.settings.title = 'First'; });
    s.afterWrite(() => { s.afterWrite(() => {}); s.edit((data) => { data.board.settings.title = 'Second'; }); });
    expect(await enqueueProjectSave(s.record)).toBe(true);
    expect(s.writes).toHaveLength(2);
    expect(s.read().board.settings.title).toBe('Second');
    expect(getProjectSaveState('p1')!.savedRevision).toBe(getProjectSaveState('p1')!.revision);
  });

  it('refuses to overwrite invalid JSON and retains local data', async () => {
    const s = await setup();
    s.external((data) => { data.meta.appId = 'invalid'; });
    s.edit((data) => { data.board.settings.title = 'Retained'; });
    expect(await enqueueProjectSave(s.record)).toBe(false);
    expect(s.writes).toEqual([]);
    expect(useAppStore.getState().portfolioBoards[0].title).toBe('Initial'); // edit harness only changes data
    expect(useAppStore.getState().portfolioBoards[0].data.board.settings.title).toBe('Retained');
  });
});
