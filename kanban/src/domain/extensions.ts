import type { BoardExtensions, LooseBoardData, TeamOsExtensions } from '../types';
import { TEAMOS_EXTENSIONS_KEY } from './constants';

export function getBoardExtensionsObject(boardData: LooseBoardData, options: { create: true }): BoardExtensions;
export function getBoardExtensionsObject(boardData: LooseBoardData | null | undefined, options?: { create?: boolean }): BoardExtensions | null;
export function getBoardExtensionsObject(boardData: LooseBoardData | null | undefined, options: { create?: boolean } = {}): BoardExtensions | null {
    const create = Boolean(options.create);
    if (!boardData || typeof boardData !== 'object' || Array.isArray(boardData)) return null;
    if (!boardData.extensions || typeof boardData.extensions !== 'object' || Array.isArray(boardData.extensions)) {
        if (!create) return null;
        boardData.extensions = {};
    }
    return boardData.extensions as BoardExtensions;
}

export function getTeamOsExtensionsObject(boardData: LooseBoardData | null | undefined, options: { create?: boolean } = {}): TeamOsExtensions | null {
    const create = Boolean(options.create);
    const extensions = getBoardExtensionsObject(boardData, { create });
    if (!extensions) return null;
    const teamOs = extensions[TEAMOS_EXTENSIONS_KEY];
    if (!teamOs || typeof teamOs !== 'object' || Array.isArray(teamOs)) {
        if (!create) return null;
        const created = {};
        extensions[TEAMOS_EXTENSIONS_KEY] = created;
        return created;
    }
    return teamOs;
}
