import { useSyncExternalStore } from 'react';
const query = '(max-width: 700px)';
const subscribe = (notify: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', notify);
    return () => media.removeEventListener('change', notify);
};
export function useSmallScreen(): boolean {
    return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
}
