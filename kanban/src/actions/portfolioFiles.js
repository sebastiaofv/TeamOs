// File-picker and loose-file actions for the portfolio.
//
// File I/O stays outside React, while the resulting records are handed to the
// store-backed portfolio session action through a single narrow callback.

import { BOARD_FILE_EXTENSION } from '../domain/constants.js';
import { createEmptyProjectData, slugifyColumnName } from '../domain/board.js';
import { assertRequiredExtension, formatErrorMessage, hasRequiredExtension, isAbortError } from '../domain/util.js';
import { BoardRepository, writeJsonToFileHandle } from '../persistence/boardRepository.js';
import { createPortfolioRecord } from '../persistence/projectFiles.js';
import { Logger } from '../logger.js';
import { appendPortfolioRecords as appendPortfolioRecordsToStore } from './portfolioControls.js';

function defaultAlert(message) {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(message);
    }
}

function defaultPrompt(message, defaultValue) {
    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        return window.prompt(message, defaultValue);
    }
    return null;
}

function getWindow() {
    return typeof window !== 'undefined' ? window : null;
}

/**
 * Create the browser file actions. The portfolio session callback is injected
 * so importing files cannot mutate DOM state itself.
 */
export function createPortfolioFileActions({
    appendPortfolioRecords = appendPortfolioRecordsToStore,
    alert = defaultAlert,
    prompt = defaultPrompt,
    logger = Logger,
    windowRef = null
} = {}) {
    const getBrowserWindow = () => windowRef || getWindow();

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
            const requestedName = prompt('Project name:', defaultTitle);
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
                alert(`Some projects were not imported:\n${errors.join('\n')}`);
            }
        } catch (error) {
            if (!isAbortError(error)) {
                logger.error('Import from picker failed', error);
                alert(`Import failed: ${formatErrorMessage(error)}`);
            }
        }
    }

    async function openPortfolioFromFiles(files) {
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
                alert(`Some projects were not imported:\n${errors.join('\n')}`);
            }
        } catch (error) {
            logger.error('Import from drop failed', error);
            alert(`Import failed: ${formatErrorMessage(error)}`);
        }
    }

    return {
        createNewProject,
        importPortfolioProjects,
        openPortfolioFromFiles
    };
}

const activeActions = createPortfolioFileActions();

export const createNewProject = (...args) => activeActions.createNewProject(...args);
export const importPortfolioProjects = (...args) => activeActions.importPortfolioProjects(...args);
export const openPortfolioFromFiles = (...args) => activeActions.openPortfolioFromFiles(...args);
