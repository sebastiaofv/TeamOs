import { useLayoutEffect } from 'react';
import type { Theme, ThemeStyle } from '@/shared/types/ui';
import { THEME_STORAGE_KEY, THEME_STYLE_STORAGE_KEY } from '@/domain/constants';
import { normalizeTheme } from '@/domain/util';
import { useAppStore } from '@/features/portfolio/state/store';
import { normalizeThemeStyle, readThemePreferences } from '@/shared/themePreferences';

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

export function setThemeStylePreference(style: ThemeStyle): void {
    const activeThemeStyle = normalizeThemeStyle(style);
    useAppStore.setState({ activeThemeStyle });
    document.documentElement.setAttribute('data-theme-style', activeThemeStyle);
    try {
        localStorage.setItem(THEME_STYLE_STORAGE_KEY, activeThemeStyle);
    } catch (_) { }
}

// Switches between light and dark and remembers the choice.
export function toggleThemePreference(): void {
    applyTheme(useAppStore.getState().activeTheme === 'dark' ? 'light' : 'dark', true);
}

// Applies the stored theme on mount and returns the active theme plus a toggle.
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
    const theme = useAppStore((state) => state.activeTheme);

    useLayoutEffect(() => {
        const syncPreferences = () => {
            const { theme, style } = readThemePreferences();
            applyTheme(theme);
            useAppStore.setState({ activeThemeStyle: style });
            document.documentElement.setAttribute('data-theme-style', style);
        };
        syncPreferences();
        // Other tabs can change appearance without disturbing an open draft.
        const onStorage = (event: StorageEvent) => {
            if (event.key === null || event.key === THEME_STORAGE_KEY || event.key === THEME_STYLE_STORAGE_KEY) {
                syncPreferences();
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const toggleTheme = () => applyTheme(theme === 'dark' ? 'light' : 'dark', true);
    return { theme, toggleTheme };
}
