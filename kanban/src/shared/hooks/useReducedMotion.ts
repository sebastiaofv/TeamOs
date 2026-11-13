import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
function subscribe(changed: () => void) {
    const media = window.matchMedia(query);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
}

/** CSS cannot override smooth scrolling requested explicitly by JavaScript. */
export function useReducedMotion() {
    return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
