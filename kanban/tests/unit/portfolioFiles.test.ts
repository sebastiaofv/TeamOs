import { MemoryDirectory } from '../support/projectDirectory';
import { createProjectDirectory } from '../../src/infrastructure/persistence/projectDirectory';
import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { describe, expect, it, vi } from 'vitest';
import type { DialogPropsByName } from '../../src/features/portfolio/types';
import { createEmptyProjectData } from '../../src/domain/board';
import { createPortfolioFileActions } from '../../src/features/portfolio/projects/projectCommands';

describe('portfolio file actions', () => {
    it('checks files without opening a modal conflict choice', async () => {
        const choose = vi.fn();
        const checkFiles = vi.fn(async () => true);
        const closeContexts = vi.fn();
        const actions = createPortfolioFileActions({ choose, checkFiles, closeContexts });
        expect(await actions.checkPortfolioFiles()).toBe(true);
        expect(checkFiles).toHaveBeenCalledWith({ onReload: closeContexts });
        expect(choose).not.toHaveBeenCalled();
    });

    it('creates a project file and sends its record to the portfolio session', async () => {
        const write = vi.fn();
        const close = vi.fn();
        const handle = {
            name: 'new-project.board.json',
            createWritable: vi.fn(async () => ({ write, close }))
        };
        const appendPortfolioRecords = vi.fn();
        let settings: DialogPropsByName['projectSettings'] | undefined;
        const actions = createPortfolioFileActions({
            openDialogFn: (_name, props) => { settings = fromAny(props); },
            windowRef: {
                showSaveFilePicker: fromAny(vi.fn(async () => handle))
            },
            appendPortfolioRecords
        });

        await actions.createNewProject('House');
        expect(write).not.toHaveBeenCalled();
        expect(settings?.data.extensions.project?.productName).toBe('House');
        const draft = createEmptyProjectData('Planning', 'PLN');
        draft.extensions.project!.productName = 'House';
        expect(await settings!.onCreate!(draft)).toBe(true);

        expect(write).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(1);
        expect(appendPortfolioRecords).toHaveBeenCalledTimes(1);
        expect(appendPortfolioRecords.mock.calls[0][0][0].title).toBe('Planning');
        expect(appendPortfolioRecords.mock.calls[0][1]).toMatchObject({ selectBoardId: expect.any(String) });
    });

    it('allows multiple project files in one picker operation and imports valid files despite an invalid one', async () => {
        const appendPortfolioRecords = vi.fn();
        const alert = vi.fn();
        const showOpenFilePicker = vi.fn(async () => [
            ...['First', 'Second'].map((title) => ({ name: `${title}.board.json`, getFile: async () => ({ name: `${title}.board.json`, text: async () => JSON.stringify(createEmptyProjectData(title)) }) })),
            { name: 'broken.board.json', getFile: async () => ({ name: 'broken.board.json', text: async () => 'invalid JSON' }) }
        ]);
        const actions = createPortfolioFileActions({ appendPortfolioRecords, alert, windowRef: { showOpenFilePicker: fromAny(showOpenFilePicker) } });
        await actions.importPortfolioProjects();
        expect(showOpenFilePicker).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }));
        expect(appendPortfolioRecords.mock.calls[0][0].map((board: { title: string }) => board.title)).toEqual(['First', 'Second']);
        expect(alert).toHaveBeenCalledWith(expect.stringContaining('broken.board.json'), expect.objectContaining({ title: 'Import incomplete' }));
    });

    it('uses the folder picker for Import Projects when both pickers are available', async () => {
        const directory = new MemoryDirectory('portfolio');
        await createProjectDirectory(directory, 'first', createEmptyProjectData('First', 'ONE'));
        await createProjectDirectory(directory, 'second', createEmptyProjectData('Second', 'TWO'));
        const showDirectoryPicker = vi.fn(async () => directory);
        const showOpenFilePicker = vi.fn(async () => []);
        const appendPortfolioRecords = vi.fn();
        const actions = createPortfolioFileActions({ appendPortfolioRecords, windowRef: { showDirectoryPicker, showOpenFilePicker } });
        await actions.importPortfolioProjects();
        expect(showDirectoryPicker).toHaveBeenCalledWith({ mode: 'readwrite' });
        expect(showOpenFilePicker).not.toHaveBeenCalled();
        expect(appendPortfolioRecords.mock.calls.map((call) => call[0][0].title)).toEqual(['First', 'Second']);
    });

    it('converts legacy files through the folder import once and skips backup reads later', async () => {
        const directory = new MemoryDirectory('legacy-import');
        const original = await directory.getFileHandle('legacy.board.json', { create: true });
        original.setText(JSON.stringify(createEmptyProjectData('Legacy folder', 'LGC')));
        const content = original.text();
        const appendPortfolioRecords = vi.fn();
        const prompt = vi.fn(async () => null);
        const actions = createPortfolioFileActions({ appendPortfolioRecords, prompt, windowRef: { showDirectoryPicker: async () => directory } });
        await actions.importPortfolioProjects();
        expect(appendPortfolioRecords.mock.calls[0][0][0].title).toBe('Legacy folder');
        expect(original.text()).toBe(content); expect(original.writes).toBe(0);
        const reads = original.fullReads;
        await actions.importPortfolioProjects();
        expect(original.fullReads).toBe(reads);
        expect(directory.children.size).toBe(2);
        expect(prompt).not.toHaveBeenCalled();
    });

    it('imports only board files dropped into the portfolio', async () => {
        const appendPortfolioRecords = vi.fn();
        const data = createEmptyProjectData('Imported');
        const file = {
            name: 'imported.board.json',
            text: vi.fn(async () => JSON.stringify(data))
        };
        const actions = createPortfolioFileActions({ appendPortfolioRecords });

        await actions.openPortfolioFromFiles(fromPartial([file, { name: 'notes.txt' }]));

        expect(appendPortfolioRecords).toHaveBeenCalledTimes(1);
        expect(appendPortfolioRecords.mock.calls[0][0][0].title).toBe('Imported');
    });

    it('reports when a drop contains no board files', async () => {
        const alert = vi.fn();
        const actions = createPortfolioFileActions({ alert });

        await actions.openPortfolioFromFiles(fromPartial([{ name: 'notes.txt' }]));

        expect(alert).toHaveBeenCalledWith('No .json files found.');
    });
});
