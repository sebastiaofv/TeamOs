// File-picker and loose-file actions for the portfolio.
//
// File I/O stays outside React, while the resulting records are handed to the
// store-backed portfolio session action through a single narrow callback.

import type { BoardRecord } from '@/features/portfolio/types';
import type { BoardFile } from '@/infrastructure/browser/types';
import { BOARD_FILE_EXTENSION } from '@/domain/constants';
import { createEmptyProjectData, slugifyColumnName } from '@/domain/board';
import { assertRequiredExtension, formatErrorMessage, hasRequiredExtension, isAbortError } from '@/domain/util';
import { BoardRepository, writeJsonToFileHandle } from '@/infrastructure/persistence/boardRepository';
import { checkProjectFilesNow } from '@/infrastructure/persistence/projectFileWatcher';
import { createPortfolioRecord } from '@/infrastructure/persistence/portfolioRecord';
import { getPortfolioBoardRecord } from '@/features/portfolio/state/store';
import { closePortfolioContextsForProject } from '@/app/overlays/dialogs';
import { showAlert, showChoice, showPrompt, type Choice, type PromptOptions } from '@/app/overlays/appMessages';
import { Logger } from '@/infrastructure/logging/logger';
import { appendPortfolioRecords as appendPortfolioRecordsToStore } from '@/features/portfolio/commands/portfolioControls';
import { translateCurrent } from '@/shared/i18n';

type PickerWindow = Pick<Window, 'showSaveFilePicker' | 'showOpenFilePicker'>;

export type PortfolioFileOptions = {
    appendPortfolioRecords?: (records: BoardRecord[], options?: { selectBoardId?: string }) => void | Promise<void>;
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
                    translateCurrent('projects.fileChangedMessage', {
                        project: title ? `"${title}"` : translateCurrent('projects.projectFile'),
                        errors: ''
                    }),
                    [
                        { value: 'reload', label: translateCurrent('projects.reloadFromDisk') },
                        { value: 'local', label: translateCurrent('projects.keepLocalEdits'), primary: true }
                    ],
                    { title: translateCurrent('projects.fileChangedTitle') }
                );
            }
        });
    }

    async function createNewProject() {
        try {
            const browserWindow = getBrowserWindow();
            if (!browserWindow?.showSaveFilePicker) {
                throw new Error(translateCurrent('projects.filePickerUnavailable'));
            }
            const handle = await browserWindow.showSaveFilePicker({
                suggestedName: `new-project${BOARD_FILE_EXTENSION}`,
                types: [{ description: translateCurrent('projects.projectJson'), accept: { 'application/json': [BOARD_FILE_EXTENSION] } }]
            });
            assertRequiredExtension(handle.name, BOARD_FILE_EXTENSION, translateCurrent('projects.projectFile'));

            const defaultTitle = String(handle.name || 'New Project')
                .replace(new RegExp(`${BOARD_FILE_EXTENSION.replace('.', '\\.')}$`, 'i'), '')
                .replace(/[-_]+/g, ' ')
                .trim() || 'New Project';
            const requestedName = await prompt(translateCurrent('projects.projectName'), defaultTitle, {
                title: translateCurrent('projects.newProject'),
                confirmLabel: translateCurrent('common.create')
            });
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
            await appendPortfolioRecords([record], { selectBoardId: record.id });
        } catch (error) {
            if (!isAbortError(error)) {
                logger.error('New project failed', error);
                alert(translateCurrent('projects.newProjectFailed', { error: formatErrorMessage(error) }));
            }
        }
    }

    async function importPortfolioProjects() {
        try {
            const browserWindow = getBrowserWindow();
            if (!browserWindow?.showOpenFilePicker) {
                throw new Error(translateCurrent('projects.filePickerUnavailable'));
            }
            const handles = await browserWindow.showOpenFilePicker({
                multiple: true,
                types: [{ description: translateCurrent('projects.projectJson'), accept: { 'application/json': [BOARD_FILE_EXTENSION] } }]
            });

            const { loaded, errors } = await BoardRepository.importFromHandles(handles);
            await appendPortfolioRecords(loaded);
            if (errors.length > 0) {
                alert(translateCurrent('projects.someNotImported', { errors: errors.join('\n') }), { title: translateCurrent('projects.importIncomplete') });
            }
        } catch (error) {
            if (!isAbortError(error)) {
                logger.error('Import from picker failed', error);
                alert(translateCurrent('projects.importFailed', { error: formatErrorMessage(error) }));
            }
        }
    }

    async function openPortfolioFromFiles(files: ArrayLike<BoardFile> | Iterable<BoardFile> | null | undefined) {
        try {
            const list = Array.from(files || []);
            const boardFiles = list.filter((file) => hasRequiredExtension(file.name, BOARD_FILE_EXTENSION));
            if (boardFiles.length === 0) {
                alert(translateCurrent('projects.noFilesFound', { extension: BOARD_FILE_EXTENSION }));
                return;
            }

            const { loaded, errors } = await BoardRepository.importFromLooseFiles(boardFiles);
            await appendPortfolioRecords(loaded);
            if (errors.length > 0) {
                alert(translateCurrent('projects.someNotImported', { errors: errors.join('\n') }), { title: translateCurrent('projects.importIncomplete') });
            }
        } catch (error) {
            logger.error('Import from drop failed', error);
            alert(translateCurrent('projects.importFailed', { error: formatErrorMessage(error) }));
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
