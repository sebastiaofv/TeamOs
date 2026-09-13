// Version-tick bridge between legacy code and React (Phase 2.0 – 2.6).
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
// appState is mutated in place, so object references never change across
// notifies. Select primitives, or treat selected objects as unstable. Never
// key React.memo, useMemo, useCallback or useEffect dependencies on object
// references read from appState -- they will go stale. Key on primitives or
// on getVersion() instead. Every notify re-renders every subscriber; there is
// no selector-equality bailout. Legacy code that changes visible state
// outside renderPortfolio() must also call notifyAppStateChanged() before an
// island relies on that state.

import { useSyncExternalStore } from 'react';
import { appState } from '../state/store.js';

let version = 0;
const listeners = new Set();

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getVersion() {
    return version;
}

export function notifyAppStateChanged() {
    version += 1;
    listeners.forEach((listener) => listener());
}

export function useAppState(select) {
    useSyncExternalStore(subscribe, getVersion);
    return select(appState);
}
