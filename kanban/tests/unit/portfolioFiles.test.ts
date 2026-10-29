import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { createPortfolioFileActions } from '../../src/features/portfolio/projects/projectCommands';

describe('portfolio file actions', () => {
    it.each(['local', 'reload', null])('hands the conflict choice %s to persistence', async (choice) => {
        const choose = vi.fn(async () => choice);
        const actions = createPortfolioFileActions({
            choose,
            checkFiles: ({ chooseConflict }: any) => chooseConflict('p1')
        });

        expect(await actions.checkPortfolioFiles()).toBe(choice);
        expect(choose).toHaveBeenCalledWith(
            expect.stringContaining('unsaved edits'),
            [expect.objectContaining({ value: 'reload' }), expect.objectContaining({ value: 'local' })],
            expect.objectContaining({ title: 'File changed on disk' })
        );
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
                showSaveFilePicker: fromAny(vi.fn(async () => handle))
            },
            prompt: fromAny(vi.fn().mockResolvedValueOnce('Planning').mockResolvedValueOnce('PLN')),
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
