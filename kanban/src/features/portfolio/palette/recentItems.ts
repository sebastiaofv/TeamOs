// The palette's "Recent" list: item keys (task:board:id, cmd:id, project:id),
// newest first. A per-browser convenience in localStorage; failures are ignored.

const STORAGE_KEY = 'teamOs.paletteRecent';
const MAX_RECENT = 8;

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const defaultStore = (): KeyValueStore | null => (typeof localStorage === 'undefined' ? null : localStorage);

export function loadRecentPaletteItems(store: KeyValueStore | null = defaultStore()): string[] {
    try {
        const parsed: unknown = JSON.parse(store?.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string').slice(0, MAX_RECENT) : [];
    } catch (_) {
        return [];
    }
}

export function rememberPaletteItem(key: string, store: KeyValueStore | null = defaultStore()): void {
    try {
        const next = [key, ...loadRecentPaletteItems(store).filter((entry) => entry !== key)].slice(0, MAX_RECENT);
        store?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) {
        // Recent items are optional.
    }
}
