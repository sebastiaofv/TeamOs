import { createProjectDirectory, findProjectDirectories, ProjectFolderExistsError } from '@/infrastructure/persistence/projectDirectory';
import type { ProjectDirectoryHandle } from '@/infrastructure/browser/types';
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
import { assertUniqueProjectAcronym, ProjectDataError } from '@/domain/projectData';
import { useAppStore } from '@/features/portfolio/state/store';
import { openDialog, closeDialog, closePortfolioContextsForProject } from '@/app/overlays/dialogs';
import { showAlert, showPrompt, type Choice } from '@/app/overlays/appMessages';
import { Logger } from '@/infrastructure/logging/logger';
import { appendPortfolioRecords as appendPortfolioRecordsToStore } from '@/features/portfolio/commands/portfolioControls';
import { translateCurrent } from '@/shared/i18n';

type PickerWindow = Pick<Window, 'showSaveFilePicker' | 'showOpenFilePicker' | 'showDirectoryPicker'>;

export type PortfolioFileOptions = {
    appendPortfolioRecords?: (records: BoardRecord[], options?: { selectBoardId?: string }) => void | Promise<void>;
    alert?: (text: string, options?: { title?: string }) => unknown;
    openDialogFn?: typeof openDialog;
    prompt?: typeof showPrompt;
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
    openDialogFn = openDialog,
    logger = Logger,
    checkFiles = checkProjectFilesNow,
    closeContexts = closePortfolioContextsForProject,
    windowRef = null
}: PortfolioFileOptions = {}) {
    const getBrowserWindow = () => windowRef || getWindow();

    function checkPortfolioFiles() {
        return checkFiles({ onReload: closeContexts });
    }

    async function createNewProject(productName = '') {
        const data = createEmptyProjectData('');
        data.extensions.project!.productName = productName;
        delete data.extensions.project!.acronym;
        openDialogFn('projectSettings', {
            boardId: '', data, readOnly: false,
            onCreate: async (draft) => {
                try {
                    const project = draft.extensions.project!;
                    if (!project.acronym) throw new ProjectDataError('acronym');
                    assertUniqueProjectAcronym(project, useAppStore.getState().portfolioBoards.flatMap((board) => board.data.extensions.project ? [board.data.extensions.project] : []));
                    const browserWindow = getBrowserWindow();
                    if (browserWindow?.showDirectoryPicker) {
                        const parent = await browserWindow.showDirectoryPicker({ mode: 'readwrite' });
                        const handle = await createFolder(parent, draft);
                        if (!handle) return false;
                        const record = await BoardRepository.createRecordFromHandle(handle);
                        await appendPortfolioRecords([record], { selectBoardId: record.id });
                        closeDialog('projectSettings');
                        return true;
                    }
                    if (!browserWindow?.showSaveFilePicker) throw new Error(translateCurrent('projects.filePickerUnavailable'));
                    const stem = slugifyColumnName(draft.board.settings.title) || 'project';
                    const handle = await browserWindow.showSaveFilePicker({
                        suggestedName: `${stem}${BOARD_FILE_EXTENSION}`,
                        types: [{ description: translateCurrent('projects.projectJson'), accept: { 'application/json': [BOARD_FILE_EXTENSION] } }]
                    });
                    assertRequiredExtension(handle.name, BOARD_FILE_EXTENSION, translateCurrent('projects.projectFile'));
                    // Another project may have been opened while the picker was showing.
                    assertUniqueProjectAcronym(project, useAppStore.getState().portfolioBoards.flatMap((board) => board.data.extensions.project ? [board.data.extensions.project] : []));
                    await writeJsonToFileHandle(handle, BoardRepository.serialize(draft));
                    const record = createPortfolioRecord({ handle, fileName: handle.name || `${stem}${BOARD_FILE_EXTENSION}`, data: draft });
                    await appendPortfolioRecords([record], { selectBoardId: record.id });
                    closeDialog('projectSettings');
                    return true;
                } catch (error) {
                    if (!isAbortError(error)) {
                        logger.error('New project failed', error);
                        await alert(error instanceof ProjectDataError ? translateCurrent(`project.error.${error.code}`) : translateCurrent('projects.newProjectFailed', { error: formatErrorMessage(error) }));
                    }
                    return false;
                }
            }
        });
    }

    async function createFolder(parent: ProjectDirectoryHandle, draft: import('@/domain/types').BoardData) {
        let name = slugifyColumnName(draft.board.settings.title) || 'project';
        while (true) {
            try { return await createProjectDirectory(parent, name, draft); }
            catch (error) {
                if (!(error instanceof ProjectFolderExistsError)) throw error;
                const next = await prompt(translateCurrent('projects.folderExists', { name }), name, { required: true });
                if (next === null) return null;
                name = next.trim();
            }
        }
    }

    async function importPortfolioProjects() {
        try {
            const browserWindow = getBrowserWindow();
            if (!browserWindow?.showDirectoryPicker) return importLegacyProjectFiles();
            const directory = await browserWindow.showDirectoryPicker({ mode: 'readwrite' });
            const found = await findProjectDirectories(directory);
            const imported = await BoardRepository.importFromHandles(found.handles);
            const legacy = await BoardRepository.importFromHandles(found.legacyHandles);
            const errors = [...found.errors, ...imported.errors, ...legacy.errors];
            const knownIds = new Set([...useAppStore.getState().portfolioBoards, ...imported.loaded].map((record) => record.data.extensions.project?.id));
            for (const source of legacy.loaded) {
                if (knownIds.has(source.data.extensions.project?.id)) continue;
                try {
                    source.data.extensions.projectStorage = { version: 1, baselineEventId: '', legacyFileName: source.fileName };
                    const handle = await createFolder(directory, source.data);
                    if (handle) {
                        const record = await BoardRepository.createRecordFromHandle(handle);
                        imported.loaded.push(record);
                        knownIds.add(record.data.extensions.project?.id);
                    }
                } catch (error) { errors.push(`${source.fileName}: ${formatErrorMessage(error)}`); }
            }
            for (const record of imported.loaded) {
                try { await appendPortfolioRecords([record]); }
                catch (error) { errors.push(`${record.fileName}: ${formatErrorMessage(error)}`); }
            }
            if (errors.length) await alert(translateCurrent('projects.someNotImported', { errors: errors.join('\n') }), { title: translateCurrent('projects.importIncomplete') });
        } catch (error) {
            if (!isAbortError(error)) await alert(translateCurrent('projects.importFailed', { error: formatErrorMessage(error) }));
        }
    }

    async function importLegacyProjectFiles() {
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

export const { createNewProject, importPortfolioProjects, openPortfolioFromFiles, checkPortfolioFiles } = createPortfolioFileActions();
