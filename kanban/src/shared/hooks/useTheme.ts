import { useLayoutEffect } from 'react';
import type { Theme } from '@/shared/types/ui';
import { THEME_STORAGE_KEY } from '@/domain/constants';
import { normalizeTheme } from '@/domain/util';
import { useAppStore } from '@/features/portfolio/state/store';

function readStoredTheme(): Theme {
    try {
        return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
    } catch (_) {
        return 'light';
    }
}

function applyTheme(theme: unknown, persist = false) {
    const activeTheme = normalizeTheme(theme);
    useAppStore.setState({ activeTheme });
    document.documentElement.setAttribute('data-theme', activeTheme);
    if (persist) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
        } catch (_) { }
    }
}

// Switches between light and dark and remembers the choice.
export function toggleThemePreference(): void {
    applyTheme(useAppStore.getState().activeTheme === 'dark' ? 'light' : 'dark', true);
}

// Applies the stored theme on mount and returns the active theme plus a toggle.
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
    const theme = useAppStore((state) => state.activeTheme);

    useLayoutEffect(() => {
        applyTheme(readStoredTheme());
    }, []);

    const toggleTheme = () => applyTheme(theme === 'dark' ? 'light' : 'dark', true);
    return { theme, toggleTheme };
}
