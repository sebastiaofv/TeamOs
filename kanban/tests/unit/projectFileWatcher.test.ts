import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { PROJECT_FILE_CONFLICT_SUPPRESS_MS } from '../../src/domain/constants';
import type { BoardRecord } from '../../src/features/portfolio/types';
import { appendTimelineEvent, ensureBoardTimelineBaseline } from '../../src/domain/timeline';
import { normalizeTask } from '../../src/domain/task';
import { cloneSerializable } from '../../src/domain/serialize';
import { isBoardInHistoricalPreview } from '../../src/features/portfolio/queries';
import {
  checkProjectFilesNow,
  preflightProjectFileSave,
  primeProjectFileBaselines
} from '../../src/infrastructure/persistence/projectFileWatcher';
import { createProjectSaveState, forgetProjectFileState, getProjectFileState } from '../../src/infrastructure/persistence/projectFiles';
import { useAppStore } from '../../src/features/portfolio/state/store';

type DiskFile = { text: string; lastModified: number; size: number };

function createHandle(disk: DiskFile) {
  return {
    name: 'project.board.json',
    async getFile() {
      const snapshot = { ...disk };
      return {
        name: 'project.board.json',
        size: snapshot.size,
        lastModified: snapshot.lastModified,
        async text() {
          return snapshot.text;
        }
      };
    },
    async createWritable() {
      return { write: async () => {}, close: async () => {} };
    }
  };
}

function installBoard(disk: DiskFile) {
  const data = createEmptyProjectData('Local');
  const record: BoardRecord = {
    id: 'p1',
    colorSeed: 0,
    handle: createHandle(disk),
    fileName: 'project.board.json',
    title: 'Local',
    data
  };
  const saveState = { ...createProjectSaveState(), revision: 1 };
  useAppStore.setState({
    portfolioBoards: [record],
    projectSaveStateById: new Map([['p1', saveState]])
  });
  return record;
}

async function installCleanBoard() {
  const data = createEmptyProjectData('Local');
  data.board.tasks = [normalizeTask({ id: 1, title: 'Original task' })];
  ensureBoardTimelineBaseline(data);
  appendTimelineEvent(data, { kind: 'task.updated', entityType: 'task', entityId: '1', summary: 'Task edit',
    changes: { title: { before: 'Original task', after: 'Original task' } } });
  const text = JSON.stringify(data);
  const disk = { text, lastModified: 10, size: text.length };
  const record = { ...installBoard(disk), data };
  const other = { ...record, id: 'p2', handle: null };
  useAppStore.setState({ portfolioBoards: [record, other], selectedPortfolioBoardId: 'p1',
    portfolioTimelineSelection: { boardId: 'p1', eventIndex: 1 },
    projectSaveStateById: new Map([['p1', createProjectSaveState()]]) });
  await primeProjectFileBaselines([record]);
  return { record: useAppStore.getState().portfolioBoards[0], other: useAppStore.getState().portfolioBoards[1], disk };
}

afterEach(() => {
  vi.useRealTimers();
  forgetProjectFileState('p1');
  useAppStore.setState({ portfolioBoards: [], projectSaveStateById: new Map(), selectedPortfolioBoardId: '',
    portfolioTimelineSelection: { boardId: '', eventIndex: null } });
});

describe('project file watcher', () => {
  for (const route of ['watcher', 'preflight']) {
    it.each([
      { boardId: 'p1', eventIndex: 1, expected: 2 },
      { boardId: 'p1', eventIndex: null, expected: 2 },
      { boardId: 'p1', eventIndex: 0, expected: 0 },
      { boardId: 'p2', eventIndex: 1, expected: 1 }
    ])(`${route} reload preserves timeline intent for $boardId at $eventIndex atomically`, async ({ boardId, eventIndex, expected }) => {
      const { record, other, disk } = await installCleanBoard();
      useAppStore.setState({ portfolioTimelineSelection: { boardId, eventIndex } });
      const external = cloneSerializable(record.data);
      external.board.tasks[0].title = 'External task';
      appendTimelineEvent(external, { kind: 'task.updated', entityType: 'task', entityId: '1', summary: 'External task edit',
        changes: { title: { before: 'Original task', after: 'External task' } } });
      disk.text = JSON.stringify(external);
      disk.lastModified++;
      const observed: boolean[] = [];
      const unsubscribe = useAppStore.subscribe(state => {
        if (state.portfolioBoards[0].data.board.tasks[0].title === 'External task') {
          observed.push(isBoardInHistoricalPreview(state, 'p1'));
        }
      });
      try {
        if (route === 'watcher') await checkProjectFilesNow();
        else await expect(preflightProjectFileSave('p1')).resolves.toBe(true);
      } finally {
        unsubscribe();
      }
      expect(useAppStore.getState().portfolioTimelineSelection).toEqual({ boardId, eventIndex: expected });
      expect(useAppStore.getState().portfolioBoards[1]).toBe(other);
      expect(observed.length).toBeGreaterThan(0);
      expect(observed.every(preview => preview === (boardId === 'p1' && eventIndex === 0))).toBe(true);
    });
  }

  it('preflight reloads only the requested project and reads even with unchanged file metadata', async () => {
    const { disk, other } = await installCleanBoard();
    disk.text = JSON.stringify(createEmptyProjectData('External'));
    const otherRead = vi.fn(async () => { throw new Error('Must not read another project'); });
    useAppStore.setState(state => ({ portfolioBoards: [state.portfolioBoards[0],
      { ...other, handle: { ...createHandle(disk), getFile: otherRead } }] }));
    await expect(preflightProjectFileSave('p1')).resolves.toBe(true);
    expect(useAppStore.getState().portfolioBoards[0].title).toBe('External');
    expect(otherRead).not.toHaveBeenCalled();
  });

  it.each(['checking', 'inFlight', 'missing-baseline', 'save-error'] as const)('preflight blocks %s without reading or altering save state', async (condition) => {
    const { record, disk } = await installCleanBoard();
    const runtime = getProjectFileState('p1')!;
    if (condition === 'checking') runtime.checking = true;
    if (condition === 'inFlight') runtime.inFlight = Promise.resolve(true);
    if (condition === 'missing-baseline') runtime.lastTextHash = '';
    if (condition === 'save-error') useAppStore.setState({ projectSaveStateById: new Map([
      ['p1', { ...createProjectSaveState(), status: 'error', revision: 1, lastErrorMessage: 'Failed save' }]
    ]) });
    const read = vi.spyOn(record.handle!, 'getFile');
    const before = useAppStore.getState().projectSaveStateById;
    await expect(preflightProjectFileSave('p1')).resolves.toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(useAppStore.getState().projectSaveStateById).toBe(before);
    expect(disk.text).toContain('Original task');
  });

  it.each(['read', 'parse'] as const)('preflight blocks a %s error and can recover on a later successful check', async (failure) => {
    const { record, disk } = await installCleanBoard();
    const original = disk.text;
    if (failure === 'read') vi.spyOn(record.handle!, 'getFile').mockRejectedValueOnce(new Error('Unreadable'));
    else disk.text = '{ invalid json';
    await expect(preflightProjectFileSave('p1')).resolves.toBe(false);
    expect(useAppStore.getState().portfolioBoards[0]).toBe(record);
    expect(useAppStore.getState().projectSaveStateById.get('p1')?.watchStatus).toBe('watch-error');
    disk.text = original;
    await expect(preflightProjectFileSave('p1')).resolves.toBe(true);
    expect(useAppStore.getState().projectSaveStateById.get('p1')?.watchStatus).toBe('idle');
  });

  it('preflight retains unsaved local edits and the external file when a conflict cannot be resolved safely', async () => {
    const { record, disk } = await installCleanBoard();
    useAppStore.setState({ projectSaveStateById: new Map([['p1', { ...createProjectSaveState(), revision: 1, status: 'dirty' }]]) });
    disk.text = JSON.stringify(createEmptyProjectData('External'));
    await expect(preflightProjectFileSave('p1')).resolves.toBe(false);
    expect(useAppStore.getState().portfolioBoards[0]).toBe(record);
    expect(useAppStore.getState().projectSaveStateById.get('p1')).toMatchObject({ revision: 1, savedRevision: 0, watchStatus: 'conflict' });
    expect(disk.text).toContain('External');
  });

  it.each(['handle-replaced', 'write-started', 'local-edit'] as const)('preflight rechecks %s during asynchronous file I/O', async (change) => {
    const { record, disk } = await installCleanBoard();
    const readFile = record.handle!.getFile.bind(record.handle);
    vi.spyOn(record.handle!, 'getFile').mockImplementationOnce(async () => {
      const file = await readFile();
      if (change === 'handle-replaced') useAppStore.setState(state => ({ portfolioBoards:
        state.portfolioBoards.map(board => board.id === 'p1' ? { ...board, handle: null } : board) }));
      if (change === 'write-started') getProjectFileState('p1')!.inFlight = Promise.resolve(true);
      if (change === 'local-edit') useAppStore.setState({ projectSaveStateById: new Map([
        ['p1', { ...createProjectSaveState(), status: 'dirty', revision: 1 }]
      ]) });
      return file;
    });
    disk.text = JSON.stringify(createEmptyProjectData('External'));
    await expect(preflightProjectFileSave('p1')).resolves.toBe(false);
    expect(useAppStore.getState().portfolioBoards[0].data).toBe(record.data);
    expect(disk.text).toContain('External');
  });

  it('detects content changes when file size and timestamp stay the same', async () => {
    const initial = JSON.stringify(createEmptyProjectData('Initial'));
    const disk: DiskFile = { text: initial, lastModified: 10, size: 100 };
    const record = installBoard(disk);
    await primeProjectFileBaselines([record]);

    disk.text = JSON.stringify(createEmptyProjectData('External'));
    const chooseConflict = vi.fn(async () => 'reload');

    await expect(checkProjectFilesNow({ chooseConflict })).resolves.toBe(true);

    expect(chooseConflict).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().portfolioBoards[0].data.board.settings.title).toBe('External');
  });

  it('prompts again after a conflict is dismissed', async () => {
    vi.useFakeTimers();
    const initial = JSON.stringify(createEmptyProjectData('Initial'));
    const disk: DiskFile = { text: initial, lastModified: 10, size: 100 };
    const record = installBoard(disk);
    await primeProjectFileBaselines([record]);

    disk.text = JSON.stringify(createEmptyProjectData('External'));
    disk.lastModified = 11;
    disk.size = 101;
    const chooseConflict = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('reload');

    await checkProjectFilesNow({ chooseConflict });
    await vi.advanceTimersByTimeAsync(PROJECT_FILE_CONFLICT_SUPPRESS_MS + 1);
    await checkProjectFilesNow({ chooseConflict });

    expect(chooseConflict).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().portfolioBoards[0].data.board.settings.title).toBe('External');
  });
});
