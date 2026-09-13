// Notification compatibility layer for legacy action modules during the
// Zustand migration. React components read the store directly; this module is
// retained for persistence/action code that still calls notifyAppStateChanged.
//
// `appState` stays the source of truth and is mutated in place. React cannot
// detect in-place mutation, so instead of snapshotting state we snapshot a
// counter: every notify bumps it, useSyncExternalStore sees a new snapshot, and
// subscribers re-run their selector against current state.
//
// Call notifyAppStateChanged() after mutating state -- from actions and from
// legacy renders -- and never during a React render. Selectors must be
// read-only. Replaced by Zustand slices in Phase 2.7.
//
// Legacy code can still mutate nested board data in place, so it calls
// notifyAppStateChanged() after those mutations. New code should use Zustand
// setters/actions directly.

import { useAppStore } from '../state/store.js';

export function subscribe(listener) {
    return useAppStore.subscribe((state, previousState) => {
        if (state.version !== previousState.version) listener();
    });
}

export function getVersion() {
    return useAppStore.getState().version;
}

export function notifyAppStateChanged() {
    useAppStore.getState().notify();
}

export function useAppState(select) {
    return useAppStore(select);
}
