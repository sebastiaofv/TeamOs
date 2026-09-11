export function isAbortError(error) {
    return Boolean(error && error.name === 'AbortError');
}

export function formatErrorMessage(error, fallback = 'Unexpected error.') {
    return error?.message ? String(error.message) : fallback;
}

export function isFileDrag(ev) {
    if (!ev.dataTransfer) return false;
    return Array.from(ev.dataTransfer.types || []).includes('Files');
}

export function nowIso() {
    return new Date().toISOString();
}

export function compareText(a, b) {
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

export function hasExactKeys(obj, expectedKeys) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const actual = Object.keys(obj).sort();
    const expected = [...expectedKeys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('File read failed.'));
        reader.readAsDataURL(file);
    });
}
