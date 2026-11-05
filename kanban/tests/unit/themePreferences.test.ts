import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEME_STORAGE_KEY, THEME_STYLE_STORAGE_KEY } from '../../src/domain/constants';
import { readThemePreferences } from '../../src/shared/themePreferences';
import { setThemeStylePreference, toggleThemePreference } from '../../src/shared/hooks/useTheme';
import { useAppStore } from '../../src/features/portfolio/state/store';
import { validateBoardData } from '../../src/domain/board';

const values = new Map<string, string>();
const attributes = new Map<string, string>();

beforeEach(() => {
    values.clear();
    attributes.clear();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value)
    });
    vi.stubGlobal('document', { documentElement: { setAttribute: (key: string, value: string) => attributes.set(key, value) } });
    useAppStore.setState({ activeTheme: 'light', activeThemeStyle: 'classic' });
});

afterEach(() => vi.unstubAllGlobals());

describe('appearance preferences', () => {
    it('defaults to the original light design and preserves the legacy dark preference', () => {
        expect(readThemePreferences()).toEqual({ theme: 'light', style: 'classic' });
        values.set(THEME_STORAGE_KEY, 'dark');
        expect(readThemePreferences()).toEqual({ theme: 'dark', style: 'classic' });
    });

    it('normalizes invalid preferences independently', () => {
        values.set(THEME_STORAGE_KEY, 'invalid');
        values.set(THEME_STYLE_STORAGE_KEY, 'modern');
        expect(readThemePreferences()).toEqual({ theme: 'light', style: 'modern' });
        values.set(THEME_STORAGE_KEY, 'dark');
        values.set(THEME_STYLE_STORAGE_KEY, 'invalid');
        expect(readThemePreferences()).toEqual({ theme: 'dark', style: 'classic' });
    });

    it('changes appearance without changing projects, navigation, filters or drafts', () => {
        const before = useAppStore.getState();
        setThemeStylePreference('modern');
        toggleThemePreference();
        const after = useAppStore.getState();
        expect(after.activeThemeStyle).toBe('modern');
        expect(after.activeTheme).toBe('dark');
        expect(after.portfolioBoards).toBe(before.portfolioBoards);
        expect(after.selectedPortfolioViewMode).toBe(before.selectedPortfolioViewMode);
        expect(after.portfolioFilters).toBe(before.portfolioFilters);
        expect(after.portfolioEditContext).toBe(before.portfolioEditContext);
        expect(after.projectSaveStateById).toBe(before.projectSaveStateById);
        expect(readThemePreferences()).toEqual({ theme: 'dark', style: 'modern' });
        expect(attributes.get('data-theme')).toBe('dark');
        expect(attributes.get('data-theme-style')).toBe('modern');
        setThemeStylePreference('classic');
        expect(useAppStore.getState().activeTheme).toBe('dark');
    });

    it('supports the session when access to storage is blocked', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('Storage blocked'); },
            setItem: () => { throw new Error('Storage full'); }
        });
        expect(readThemePreferences()).toEqual({ theme: 'light', style: 'classic' });
        expect(() => { setThemeStylePreference('modern'); toggleThemePreference(); }).not.toThrow();
        expect(useAppStore.getState().activeThemeStyle).toBe('modern');
        expect(useAppStore.getState().activeTheme).toBe('dark');
    });

    it('does not lose the mode when only the style key cannot be read', () => {
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => {
                if (key === THEME_STYLE_STORAGE_KEY) throw new Error('Style inaccessible');
                return 'dark';
            }
        });
        expect(readThemePreferences()).toEqual({ theme: 'dark', style: 'classic' });
    });

    it('ships a valid manual board fixture', () => {
        const fixture: unknown = JSON.parse(readFileSync(new URL('../../test-board/us-32.board.json', import.meta.url), 'utf8'));
        expect(() => validateBoardData(fixture)).not.toThrow();
    });
});
