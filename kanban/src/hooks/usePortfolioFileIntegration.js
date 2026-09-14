import { useEffect, useState } from 'react';
import { isFileDrag } from '../domain/util.js';
import { PROJECT_FILE_WATCH_INTERVAL_MS } from '../domain/constants.js';
import { checkPortfolioFiles, openPortfolioFromFiles } from '../actions/portfolioFiles.js';

// Window-level file integration: loose-file drops, focus/visibility checks and
// the polling watcher for external file changes. Returns whether a file is
// currently being dragged over the window.
export function usePortfolioFileIntegration() {
    const [fileDropActive, setFileDropActive] = useState(false);

    useEffect(() => {
        let fileDragDepth = 0;

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
        const handleFocus = () => { void checkPortfolioFiles(); };
        const handleVisibilityChange = () => {
            if (!document.hidden) void checkPortfolioFiles();
        };

        window.addEventListener('dragenter', handleDragEnter);
        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('drop', handleDrop);
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const watchTimerId = setInterval(() => {
            if (!document.hidden) void checkPortfolioFiles();
        }, PROJECT_FILE_WATCH_INTERVAL_MS);
        void checkPortfolioFiles();

        return () => {
            window.removeEventListener('dragenter', handleDragEnter);
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('drop', handleDrop);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearInterval(watchTimerId);
        };
    }, []);

    return fileDropActive;
}
