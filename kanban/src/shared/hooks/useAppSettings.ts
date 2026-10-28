import { useState } from 'react';

const APP_SETTINGS_STORAGE_KEY = 'teamOsAppSettings';

type AppSettings = { showTimeline: boolean };

function readStoredSettings(): AppSettings {
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(APP_SETTINGS_STORAGE_KEY) || 'null');
        return { showTimeline: typeof stored === 'object' && stored !== null && 'showTimeline' in stored && stored.showTimeline === true };
    } catch (_) {
        return { showTimeline: false };
    }
}

export function useAppSettings() {
    const [settings, setSettings] = useState(readStoredSettings);

    const setShowTimeline = (showTimeline: boolean) => {
        const next = { ...settings, showTimeline };
        setSettings(next);
        try {
            localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(next));
        } catch (_) { }
    };

    return { ...settings, setShowTimeline };
}
