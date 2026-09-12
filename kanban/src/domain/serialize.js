import { TEAMOS_EXTENSIONS_KEY } from './constants.js';

export function areSerializableValuesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneSerializable(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

export function getBoardExtensionsObject(boardData, options = {}) {
    const create = Boolean(options.create);
    if (!boardData || typeof boardData !== 'object' || Array.isArray(boardData)) return null;
    if (!boardData.extensions || typeof boardData.extensions !== 'object' || Array.isArray(boardData.extensions)) {
        if (!create) return null;
        boardData.extensions = {};
    }
    return boardData.extensions;
}

export function hashTextContent(text) {
    const value = String(text ?? '');
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `h${(hash >>> 0).toString(16)}`;
}

export function getTeamOsExtensionsObject(boardData, options = {}) {
    const create = Boolean(options.create);
    const extensions = getBoardExtensionsObject(boardData, { create });
    if (!extensions) return null;
    if (!extensions[TEAMOS_EXTENSIONS_KEY] || typeof extensions[TEAMOS_EXTENSIONS_KEY] !== 'object' || Array.isArray(extensions[TEAMOS_EXTENSIONS_KEY])) {
        if (!create) return null;
        extensions[TEAMOS_EXTENSIONS_KEY] = {};
    }
    return extensions[TEAMOS_EXTENSIONS_KEY];
}
