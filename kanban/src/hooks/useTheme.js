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
    const label = activeTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    const toggle = document.getElementById('themeToggleBtn');
    if (toggle) {
        toggle.setAttribute('aria-label', label);
        toggle.setAttribute('title', label);
        toggle.setAttribute('aria-pressed', activeTheme === 'dark' ? 'true' : 'false');
    }
    if (persist) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
        } catch (_) { }
    }
}

export function useTheme() {
    useLayoutEffect(() => {
        applyTheme(readStoredTheme());
        const toggle = document.getElementById('themeToggleBtn');
        const handleToggle = () => {
            const current = useAppStore.getState().activeTheme;
            applyTheme(current === 'dark' ? 'light' : 'dark', true);
        };
        toggle?.addEventListener('click', handleToggle);
        return () => toggle?.removeEventListener('click', handleToggle);
    }, []);
}

export function ThemeIntegration() {
    useTheme();
    return null;
}
