import { useLayoutEffect } from 'react';
import { THEME_STORAGE_KEY } from '../domain/constants.js';
import { normalizeTheme } from '../domain/util.js';
import { useAppStore } from '../state/store.js';

function readStoredTheme() {
    try {
        return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
    } catch (_) {
        return 'light';
    }
}

function applyTheme(theme, persist = false) {
    const activeTheme = normalizeTheme(theme);
    useAppStore.setState({ activeTheme });
    document.documentElement.setAttribute('data-theme', activeTheme);
    if (persist) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
        } catch (_) { }
    }
}

// Applies the stored theme on mount and returns the active theme plus a toggle.
export function useTheme() {
    const theme = useAppStore((state) => state.activeTheme);

    useLayoutEffect(() => {
        applyTheme(readStoredTheme());
    }, []);

    const toggleTheme = () => applyTheme(theme === 'dark' ? 'light' : 'dark', true);
    return { theme, toggleTheme };
}
