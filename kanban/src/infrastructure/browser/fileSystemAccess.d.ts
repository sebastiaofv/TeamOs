// The File System Access pickers (Chromium only) are not part of lib.dom.
import type { BoardFileHandle, ProjectDirectoryHandle } from './types';

declare global {
    type FilePickerOptions = {
        suggestedName?: string;
        multiple?: boolean;
        types?: { description: string; accept: Record<string, string[]> }[];
    };

    interface Window {
        showDirectoryPicker?: (options?: { mode: 'readwrite' }) => Promise<ProjectDirectoryHandle>;
        showSaveFilePicker?: (options?: FilePickerOptions) => Promise<BoardFileHandle>;
        showOpenFilePicker?: (options?: FilePickerOptions) => Promise<BoardFileHandle[]>;
    }
}

export {};
