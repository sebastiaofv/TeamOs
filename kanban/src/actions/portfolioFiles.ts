// File-picker and loose-file actions for the portfolio.
//
// File I/O stays outside React, while the resulting records are handed to the
// store-backed portfolio session action through a single narrow callback.

import type { BoardFile, BoardRecord } from '../types';
import { BOARD_FILE_EXTENSION } from '../domain/constants';
import { createEmptyProjectData, slugifyColumnName } from '../domain/board';
import { assertRequiredExtension, formatErrorMessage, hasRequiredExtension, isAbortError } from '../domain/util';
import { BoardRepository, writeJsonToFileHandle } from '../persistence/boardRepository';
import { checkProjectFilesNow, createPortfolioRecord } from '../persistence/projectFiles';
import { getPortfolioBoardRecord } from '../state/store';
import { closePortfolioContextsForProject } from './dialogs';
import { showAlert, showChoice, showPrompt, type Choice, type PromptOptions } from './appMessages';
import { Logger } from '../logger';
import { appendPortfolioRecords as appendPortfolioRecordsToStore } from './portfolioControls';

type PickerWindow = Pick<Window, 'showSaveFilePicker' | 'showOpenFilePicker'>;

export type PortfolioFileOptions = {
    appendPortfolioRecords?: (records: BoardRecord[], options?: { selectBoardId?: string }) => void;
    alert?: (text: string, options?: { title?: string }) => unknown;
    prompt?: (text: string, defaultValue?: unknown, options?: PromptOptions) => Promise<string | null>;
    choose?: (text: string, choices: readonly Choice<string>[], options?: { title?: string }) => unknown;
    logger?: Pick<typeof Logger, 'error'>;
    checkFiles?: typeof checkProjectFilesNow;
    closeContexts?: (boardId: string) => void;
    windowRef?: PickerWindow | null;
};

function getWindow(): PickerWindow | null {
    return typeof window !== 'undefined' ? window : null;
}

/**
 * Create the browser file actions. The portfolio session callback is injected
 * so importing files cannot mutate DOM state itself. `alert`, `prompt` and
 * `choose` return promises (see appMessages.ts).
 */
export function createPortfolioFileActions({
    appendPortfolioRecords = appendPortfolioRecordsToStore,
    alert = showAlert,
    prompt = showPrompt,
    choose = showChoice,
    logger = Logger,
    checkFiles = checkProjectFilesNow,
    closeContexts = closePortfolioContextsForProject,
    windowRef = null
}: PortfolioFileOptions = {}) {
    const getBrowserWindow = () => windowRef || getWindow();

    function checkPortfolioFiles() {
        return checkFiles({
            onReload: closeContexts,
            chooseConflict: (boardId) => {
                const title = getPortfolioBoardRecord(boardId)?.title;
                return choose(
                    `${title ? `"${title}"` : 'A project file'} changed on disk while this app has unsaved edits.\n` +
                    'Keep your local edits and save them over the file, or reload from disk and discard them.',
                    [
                        { value: 'reload', label: 'Reload from disk' },
                        { value: 'local', label: 'Keep local edits', primary: true }
                    ],
                    { title: 'File changed on disk' }
                );
            }
        });
    }

    async function createNewProject() {
        try {
            const browserWindow = getBrowserWindow();
            if (!browserWindow?.showSaveFilePicker) {
                throw new Error('The File System Access API is not available in this browser.');
            }
            const handle = await browserWindow.showSaveFilePicker({
                suggestedName: `new-project${BOARD_FILE_EXTENSION}`,
                types: [{ description: 'Project JSON', accept: { 'application/json': [BOARD_FILE_EXTENSION] } }]
            });
            assertRequiredExtension(handle.name, BOARD_FILE_EXTENSION, 'Project file');

            const defaultTitle = String(handle.name || 'New Project')
                .replace(new RegExp(`${BOARD_FILE_EXTENSION.replace('.', '\\.')}$`, 'i'), '')
                .replace(/[-_]+/g, ' ')
                .trim() || 'New Project';
            const requestedName = await prompt('Project name:', defaultTitle, { title: 'New project', confirmLabel: 'Create' });
            if (requestedName === null) return;
            const title = requestedName.trim();
            if (!title) return;
            const suggestedStem = slugifyColumnName(title) || 'project';

            const data = createEmptyProjectData(title);
            await writeJsonToFileHandle(handle, BoardRepository.serialize(data));
            const record = createPortfolioRecord({
                handle,
                fileName: handle.name || `${suggestedStem}${BOARD_FILE_EXTENSION}`,
                data
            });
            appendPortfolioRecords([record], { selectBoardId: record.id });
        } catch (error) {
            if (!isAbortError(error)) {
                logger.error('New project failed', error);
                alert(`New project failed: ${formatErrorMessage(error)}`);
            }
        }
    }

    async function importPortfolioProjects() {
        try {
            const browserWindow = getBrowserWindow();
            if (!browserWindow?.showOpenFilePicker) {
                throw new Error('The File System Access API is not available in this browser.');
            }
            const handles = await browserWindow.showOpenFilePicker({
                multiple: true,
                types: [{ description: 'Project JSON', accept: { 'application/json': [BOARD_FILE_EXTENSION] } }]
            });

            const { loaded, errors } = await BoardRepository.importFromHandles(handles);
            appendPortfolioRecords(loaded);
            if (errors.length > 0) {
                alert(`Some projects were not imported:\n${errors.join('\n')}`, { title: 'Import incomplete' });
            }
        } catch (error) {
            if (!isAbortError(error)) {
                logger.error('Import from picker failed', error);
                alert(`Import failed: ${formatErrorMessage(error)}`);
            }
        }
    }

    async function openPortfolioFromFiles(files: ArrayLike<BoardFile> | Iterable<BoardFile> | null | undefined) {
        try {
            const list = Array.from(files || []);
            const boardFiles = list.filter((file) => hasRequiredExtension(file.name, BOARD_FILE_EXTENSION));
            if (boardFiles.length === 0) {
                alert(`No ${BOARD_FILE_EXTENSION} files found.`);
                return;
            }

            const { loaded, errors } = await BoardRepository.importFromLooseFiles(boardFiles);
            appendPortfolioRecords(loaded);
            if (errors.length > 0) {
                alert(`Some projects were not imported:\n${errors.join('\n')}`, { title: 'Import incomplete' });
            }
        } catch (error) {
            logger.error('Import from drop failed', error);
            alert(`Import failed: ${formatErrorMessage(error)}`);
        }
    }

    return {
        checkPortfolioFiles,
        createNewProject,
        importPortfolioProjects,
        openPortfolioFromFiles
    };
}

type PortfolioFileActions = ReturnType<typeof createPortfolioFileActions>;

const activeActions = createPortfolioFileActions();

export const createNewProject: PortfolioFileActions['createNewProject'] = (...args) => activeActions.createNewProject(...args);
export const importPortfolioProjects: PortfolioFileActions['importPortfolioProjects'] = (...args) => activeActions.importPortfolioProjects(...args);
export const openPortfolioFromFiles: PortfolioFileActions['openPortfolioFromFiles'] = (...args) => activeActions.openPortfolioFromFiles(...args);

export const checkPortfolioFiles: PortfolioFileActions['checkPortfolioFiles'] = (...args) => activeActions.checkPortfolioFiles(...args);
