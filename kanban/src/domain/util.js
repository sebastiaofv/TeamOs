import { normalizeAssignees, normalizeChecklist } from './task.js';
import { normalizePortfolioSortKey } from './board.js';

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

export function formatFileSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value >= 10 * 1024 ? 0 : 1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function assigneesToInput(value) {
    return normalizeAssignees(value).join('\n');
}

export function checklistToInput(checklist) {
    return normalizeChecklist(checklist)
        .map(item => `${item.done ? '[x]' : '[ ]'} ${item.text}`)
        .join('\n');
}

export function hasRequiredExtension(fileName, extension) {
    return typeof fileName === 'string' && fileName.toLowerCase().endsWith(extension);
}

export function normalizeTheme(theme) {
    return theme === 'dark' ? 'dark' : 'light';
}

export function normalizeTimestamp(value) {
    if (!value || typeof value !== 'string') return '';
    return Number.isNaN(Date.parse(value)) ? '' : value;
}

export function assertRequiredExtension(fileName, extension, label) {
    if (!hasRequiredExtension(fileName, extension)) {
        throw new Error(`${label} must use ${extension} extension.`);
    }
}

export function portfolioSortSelectValueFromKey(sortKey) {
    const key = normalizePortfolioSortKey(sortKey);
    if (key === 'task') return 'name';
    if (['priority', 'effort', 'score'].includes(key)) return key;
    return 'priority';
}
