import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { PROJECT_FILE_CONFLICT_SUPPRESS_MS } from '../../src/domain/constants';
import type { BoardRecord } from '../../src/features/portfolio/types';
import {
  checkProjectFilesNow,
  primeProjectFileBaselines
} from '../../src/infrastructure/persistence/projectFileWatcher';
import { createProjectSaveState, forgetProjectFileState } from '../../src/infrastructure/persistence/projectFiles';
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

afterEach(() => {
  vi.useRealTimers();
  forgetProjectFileState('p1');
  useAppStore.setState({ portfolioBoards: [], projectSaveStateById: new Map() });
});

describe('project file watcher', () => {
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
