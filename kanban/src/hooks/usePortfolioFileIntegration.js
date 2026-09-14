import { useEffect } from 'react';
import { PROJECT_FILE_WATCH_INTERVAL_MS } from '../domain/constants.js';
import { isFileDrag } from '../domain/util.js';
import { checkProjectFilesNow, stopProjectFileWatcher } from '../persistence/projectFiles.js';
import {
    createNewProject,
    importPortfolioProjects,
    openPortfolioFromFiles
} from '../actions/legacyHost.js';
import { useAppStore } from '../state/store.js';

function setFileDropActive(active) {
    document.getElementById('portfolioView')?.classList.toggle('file-drop-active', active);
}

// Owns the browser integration that cannot be expressed as declarative JSX:
// file-picker buttons, loose-file drops, focus/visibility checks, and the
// polling watcher. The persistence module remains DOM-free and reports changes
// through its registered host callbacks.
export function usePortfolioFileIntegration() {
    useEffect(() => {
        const newProjectButton = document.getElementById('newProjectBtn');
        const importButton = document.getElementById('importProjectsBtn');
        let fileDragDepth = 0;

        const handleNewProject = () => { void createNewProject(); };
        const handleImport = () => { void importPortfolioProjects(); };
        const handleDragEnter = (event) => {
            if (!isFileDrag(event)) return;
            fileDragDepth += 1;
            setFileDropActive(true);
        };
        const handleDragOver = (event) => {
            if (!isFileDrag(event)) return;
            event.preventDefault();
            setFileDropActive(true);
        };
        const handleDragLeave = (event) => {
            if (!isFileDrag(event)) return;
            fileDragDepth = Math.max(0, fileDragDepth - 1);
            if (fileDragDepth === 0) setFileDropActive(false);
        };
        const handleDrop = (event) => {
            if (!isFileDrag(event)) return;
            event.preventDefault();
            fileDragDepth = 0;
            setFileDropActive(false);
            const files = event.dataTransfer?.files;
            if (files?.length) void openPortfolioFromFiles(files);
        };
        const handleFocus = () => { void checkProjectFilesNow(); };
        const handleVisibilityChange = () => {
            if (!document.hidden) void checkProjectFilesNow();
        };

        newProjectButton?.addEventListener('click', handleNewProject);
        importButton?.addEventListener('click', handleImport);
        window.addEventListener('dragenter', handleDragEnter);
        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('drop', handleDrop);
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        useAppStore.getState().projectWatchTimerId = window.setInterval(() => {
            if (document.hidden) return;
            void checkProjectFilesNow();
        }, PROJECT_FILE_WATCH_INTERVAL_MS);
        useAppStore.getState().projectWatchListenersBound = true;
        void checkProjectFilesNow();

        return () => {
            newProjectButton?.removeEventListener('click', handleNewProject);
            importButton?.removeEventListener('click', handleImport);
            window.removeEventListener('dragenter', handleDragEnter);
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('drop', handleDrop);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            stopProjectFileWatcher();
            useAppStore.getState().projectWatchListenersBound = false;
            setFileDropActive(false);
        };
    }, []);
}

export function PortfolioFileIntegration() {
    usePortfolioFileIntegration();
    return null;
}
