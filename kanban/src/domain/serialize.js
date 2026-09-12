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
