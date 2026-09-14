// Board file repository: reading, validating, serializing and writing
// *.board.json files. The only component that turns a FileSystemFileHandle
// into a validated board, or a board back into bytes on disk.

import { BOARD_FILE_EXTENSION } from '../domain/constants.js';
import { validateBoardData } from '../domain/board.js';
import { serializeBoardDataFromObject, hashTextContent } from '../domain/serialize.js';
import { assertRequiredExtension, formatErrorMessage } from '../domain/util.js';
import { createPortfolioRecord } from './projectFiles.js';

export async function writeJsonToFileHandle(fileHandle, data) {
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
}

export const BoardRepository = {
    serialize(boardData) {
        return serializeBoardDataFromObject(boardData);
    },
    validate(boardData) {
        validateBoardData(boardData);
    },
    async readHandleFileMeta(handle) {
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
    async readFileSnapshot(file) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        this.validate(parsed);
        return {
            parsed,
            fileMeta: {
                lastModified: Number(file?.lastModified) || 0,
                size: Number(file?.size) || 0,
                textHash: hashTextContent(text)
            }
        };
    },
    async readHandleSnapshot(handle) {
        const { file } = await this.readHandleFileMeta(handle);
        return this.readFileSnapshot(file);
    },
    async saveRecord(boardRecord) {
        if (!boardRecord || !boardRecord.handle) return false;
        const payload = this.serialize(boardRecord.data);
        await writeJsonToFileHandle(boardRecord.handle, payload);
        return true;
    },
    async createRecordFromFile({ file, handle = null }) {
        assertRequiredExtension(file?.name || '', BOARD_FILE_EXTENSION, 'Project file');
        const parsed = JSON.parse(await file.text());
        this.validate(parsed);
        return createPortfolioRecord({
            handle,
            fileName: file.name,
            data: parsed
        });
    },
    async createRecordFromHandle(handle) {
        const file = await handle.getFile();
        return this.createRecordFromFile({ file, handle });
    },
    async importFromHandles(handles) {
        const loaded = [];
        const errors = [];
        for (const handle of handles) {
            try {
                loaded.push(await this.createRecordFromHandle(handle));
            } catch (error) {
                errors.push(`${handle.name || 'Unknown file'}: ${formatErrorMessage(error)}`);
            }
        }
        return { loaded, errors };
    },
    async importFromLooseFiles(files) {
        const loaded = [];
        const errors = [];
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
