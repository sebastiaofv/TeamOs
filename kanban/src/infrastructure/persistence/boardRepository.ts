import { parseConversations } from '@/domain/comments';
import { attachDirectoryHistory, getDirectoryProject, writeDirectoryProject, refreshDirectoryHistory } from './projectDirectory';
// Board file repository: reading, validating, serializing and writing
// *.board.json files. The only component that turns a FileSystemFileHandle
// into a validated board, or a board back into bytes on disk.

import type { BoardRecord } from '@/features/portfolio/types';
import type { BoardData } from '@/domain/types';
import type { BoardFile, BoardFileHandle } from '@/infrastructure/browser/types';
import { BOARD_FILE_EXTENSION } from '@/domain/constants';
import { validateBoardData } from '@/domain/board';
import { serializeBoardDataFromObject, hashTextContent } from '@/domain/serialize';
import { assertRequiredExtension, formatErrorMessage } from '@/domain/util';
import { createPortfolioRecord } from './portfolioRecord';
import { validateConversationPixels } from '@/infrastructure/browser/commentImages';

export type BoardFileMeta = { lastModified: number; size: number; textHash: string };
export type BoardSnapshot = { parsed: BoardData; fileMeta: BoardFileMeta };
// The baseline is the version actually imported, never a later disk reread.
export const importedProjectSnapshots = new WeakMap<BoardFileHandle, BoardSnapshot>();

export type ImportResult = { loaded: BoardRecord[]; errors: string[] };

function getLooseFileSourceKey(file: BoardFile): string {
    return JSON.stringify([
        String(file?.name || ''),
        Number(file?.size) || 0,
        Number(file?.lastModified) || 0
    ]);
}

export async function writeJsonToFileHandle(fileHandle: BoardFileHandle, data: unknown): Promise<{ text: string; data: BoardData } | undefined> {
    if (getDirectoryProject(fileHandle)) return writeDirectoryProject(fileHandle, data as BoardData);
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
}

export const BoardRepository = {
    serialize(boardData: unknown): BoardData {
        return serializeBoardDataFromObject(boardData, { reuseTimeline: true });
    },
    validate(boardData: unknown): void {
        validateBoardData(boardData);
    },
    async readHandleFileMeta(handle: BoardFileHandle | null | undefined): Promise<{ file: BoardFile; lastModified: number; size: number }> {
        if (!handle || typeof handle.getFile !== 'function') {
            throw new Error('Project file handle is not readable.');
        }
        const file = await handle.getFile();
        return {
            file,
            lastModified: Number(file?.lastModified) || 0,
            size: Number(file?.size) || 0
        };
    },
    async readFileSnapshot(file: BoardFile, textOverride?: string): Promise<BoardSnapshot> {
        const text = textOverride === undefined ? await file.text() : textOverride;
        const parsed: unknown = JSON.parse(text);
        this.validate(parsed);
        await validateConversationPixels(parsed as BoardData);
        return {
            parsed: parsed as BoardData,
            fileMeta: {
                lastModified: Number(file?.lastModified) || 0,
                size: Number(file?.size) || 0,
                textHash: hashTextContent(text)
            }
        };
    },
    async readHandleSnapshot(handle: BoardFileHandle): Promise<BoardSnapshot> {
        const { file } = await this.readHandleFileMeta(handle);
        const snapshot = await this.readFileSnapshot(file);
        if (getDirectoryProject(handle)) await refreshDirectoryHistory(handle, snapshot.fileMeta.textHash, snapshot.parsed);
        if (getDirectoryProject(handle)) attachDirectoryHistory(handle, snapshot.parsed);
        if (getDirectoryProject(handle)?.loaded) {
            this.validate(snapshot.parsed);
            parseConversations(snapshot.parsed.extensions.conversations, snapshot.parsed.extensions.timeline?.events);
        }
        return snapshot;
    },
    async createRecordFromFile({ file, handle = null }: { file: BoardFile; handle?: BoardFileHandle | null }): Promise<BoardRecord> {
        if (file.name === 'project.json' && !getDirectoryProject(handle)) throw new Error('Open the project folder to validate history.json and attachments/.');
        if (!getDirectoryProject(handle)) assertRequiredExtension(file?.name || '', BOARD_FILE_EXTENSION, 'Project file');
        const text = await file.text();
        const parsed: unknown = JSON.parse(text);
        this.validate(parsed);
        await validateConversationPixels(parsed as BoardData);
        if (handle) attachDirectoryHistory(handle, parsed as BoardData);
        if (handle) importedProjectSnapshots.set(handle, { parsed: parsed as BoardData, fileMeta: { lastModified: Number(file.lastModified) || 0, size: Number(file.size) || 0, textHash: hashTextContent(text) } });
        return createPortfolioRecord({
            handle,
            ...(!handle ? { sourceKey: getLooseFileSourceKey(file) } : {}),
            fileName: getDirectoryProject(handle)?.directory.name || file.name,
            data: parsed
        });
    },
    async createRecordFromHandle(handle: BoardFileHandle): Promise<BoardRecord> {
        const file = await handle.getFile();
        return this.createRecordFromFile({ file, handle });
    },
    async importFromHandles(handles: BoardFileHandle[]): Promise<ImportResult> {
        const loaded: BoardRecord[] = [];
        const errors: string[] = [];
        for (const handle of handles) {
            try {
                loaded.push(await this.createRecordFromHandle(handle));
            } catch (error) {
                errors.push(`${handle.name || 'Unknown file'}: ${formatErrorMessage(error)}`);
            }
        }
        return { loaded, errors };
    },
    async importFromLooseFiles(files: BoardFile[]): Promise<ImportResult> {
        const loaded: BoardRecord[] = [];
        const errors: string[] = [];
        for (const file of files) {
            try {
                loaded.push(await this.createRecordFromFile({ file, handle: null }));
            } catch (error) {
                errors.push(`${file.name || 'Unknown file'}: ${formatErrorMessage(error)}`);
            }
        }
        return { loaded, errors };
    }
};
