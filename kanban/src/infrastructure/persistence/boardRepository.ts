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

export type BoardFileMeta = { lastModified: number; size: number; textHash: string };
export type BoardSnapshot = { parsed: BoardData; fileMeta: BoardFileMeta };
export type ImportResult = { loaded: BoardRecord[]; errors: string[] };

export async function writeJsonToFileHandle(fileHandle: BoardFileHandle, data: unknown): Promise<void> {
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
}

export const BoardRepository = {
    serialize(boardData: unknown): BoardData {
        return serializeBoardDataFromObject(boardData);
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
    async readFileSnapshot(file: BoardFile): Promise<BoardSnapshot> {
        const text = await file.text();
        const parsed: unknown = JSON.parse(text);
        this.validate(parsed);
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
        return this.readFileSnapshot(file);
    },
    async saveRecord(boardRecord: BoardRecord | null | undefined): Promise<boolean> {
        if (!boardRecord || !boardRecord.handle) return false;
        const payload = this.serialize(boardRecord.data);
        await writeJsonToFileHandle(boardRecord.handle, payload);
        return true;
    },
    async createRecordFromFile({ file, handle = null }: { file: BoardFile; handle?: BoardFileHandle | null }): Promise<BoardRecord> {
        assertRequiredExtension(file?.name || '', BOARD_FILE_EXTENSION, 'Project file');
        const parsed: unknown = JSON.parse(await file.text());
        this.validate(parsed);
        return createPortfolioRecord({
            handle,
            fileName: file.name,
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
