import type { Theme } from '../types';

// A non-null, non-array object.
export function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isAbortError(error: unknown): boolean {
    return Boolean(error && (error as { name?: unknown }).name === 'AbortError');
}

export function formatErrorMessage(error: unknown, fallback = 'Unexpected error.'): string {
    const message = (error as { message?: unknown } | null | undefined)?.message;
    return message ? String(message) : fallback;
}

export function nowIso(): string {
    return new Date().toISOString();
}

export function todayLocalIsoDate(): string {
    const date = new Date();
    if (Number.isNaN(date.getTime())) return '';
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function compareText(a: unknown, b: unknown): number {
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

export function hasExactKeys<K extends string>(obj: unknown, expectedKeys: readonly K[]): obj is Record<K, unknown> {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const actual = Object.keys(obj).sort();
    const expected = [...expectedKeys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatFileSize(bytes: unknown): string {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value >= 10 * 1024 ? 0 : 1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function hasRequiredExtension(fileName: unknown, extension: string): boolean {
    return typeof fileName === 'string' && fileName.toLowerCase().endsWith(extension);
}

export function normalizeTheme(theme: unknown): Theme {
    return theme === 'dark' ? 'dark' : 'light';
}

export function normalizeTimestamp(value: unknown): string {
    if (!value || typeof value !== 'string') return '';
    return Number.isNaN(Date.parse(value)) ? '' : value;
}

export function assertRequiredExtension(fileName: unknown, extension: string, label: string): void {
    if (!hasRequiredExtension(fileName, extension)) {
        throw new Error(`${label} must use ${extension} extension.`);
    }
}
