import { THEME_STORAGE_KEY, THEME_STYLE_STORAGE_KEY } from '@/domain/constants';
import { normalizeTheme } from '@/domain/util';
import type { Theme, ThemeStyle } from '@/shared/types/ui';

export function normalizeThemeStyle(value: unknown): ThemeStyle {
    return value === 'modern' ? 'modern' : 'classic';
}

// Keep the existing light/dark key so upgrades preserve the user's mode.
// The small pre-paint script in index.html uses the same keys and defaults.
export function readThemePreferences(): { theme: Theme; style: ThemeStyle } {
    let theme: Theme = 'light';
    let style: ThemeStyle = 'classic';
    try { theme = normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)); } catch (_) { }
    try { style = normalizeThemeStyle(localStorage.getItem(THEME_STYLE_STORAGE_KEY)); } catch (_) { }
    return { theme, style };
}
