import { describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board.js';
import { createPortfolioFileActions } from '../../src/actions/portfolioFiles.js';

describe('portfolio file actions', () => {
    it.each([
        ['local', 'local'],
        [' KEEP ', 'local'],
        ['l', 'local'],
        ['reload', 'reload'],
        [' R ', 'reload'],
        [null, null],
        ['later', 'unresolved']
    ])('turns conflict response %s into the persistence choice %s', async (answer, choice) => {
        const prompt = vi.fn(() => answer);
        const actions = createPortfolioFileActions({
            prompt,
            checkFiles: ({ chooseConflict }) => chooseConflict('p1')
        });

        expect(await actions.checkPortfolioFiles()).toBe(choice);
        expect(prompt).toHaveBeenCalledWith(expect.stringContaining('unsaved edits'), 'local');
    });

    it('creates a project file and sends its record to the portfolio session', async () => {
        const write = vi.fn();
        const close = vi.fn();
        const handle = {
            name: 'new-project.board.json',
            createWritable: vi.fn(async () => ({ write, close }))
        };
        const appendPortfolioRecords = vi.fn();
        const actions = createPortfolioFileActions({
            windowRef: {
                showSaveFilePicker: vi.fn(async () => handle)
            },
            prompt: vi.fn(() => 'Planning'),
            appendPortfolioRecords
        });

        await actions.createNewProject();

        expect(write).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(1);
        expect(appendPortfolioRecords).toHaveBeenCalledTimes(1);
        expect(appendPortfolioRecords.mock.calls[0][0][0].title).toBe('Planning');
        expect(appendPortfolioRecords.mock.calls[0][1]).toMatchObject({ selectBoardId: expect.any(String) });
    });

    it('imports only board files dropped into the portfolio', async () => {
        const appendPortfolioRecords = vi.fn();
        const data = createEmptyProjectData('Imported');
        const file = {
            name: 'imported.board.json',
            text: vi.fn(async () => JSON.stringify(data))
        };
        const actions = createPortfolioFileActions({ appendPortfolioRecords });

        await actions.openPortfolioFromFiles([file, { name: 'notes.txt' }]);

        expect(appendPortfolioRecords).toHaveBeenCalledTimes(1);
        expect(appendPortfolioRecords.mock.calls[0][0][0].title).toBe('Imported');
    });

    it('reports when a drop contains no board files', async () => {
        const alert = vi.fn();
        const actions = createPortfolioFileActions({ alert });

        await actions.openPortfolioFromFiles([{ name: 'notes.txt' }]);

        expect(alert).toHaveBeenCalledWith('No .json files found.');
    });
});
