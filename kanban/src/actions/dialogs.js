// Dialog actions, shared by legacy code and React components. Plain module
// functions -- never exposed on window.

import { appState } from '../state/store.js';
import { notifyAppStateChanged } from '../bridge/appStore.js';

export function openDialog(name) {
    appState.activeDialog = name;
    notifyAppStateChanged();
}

export function closeDialog() {
    if (appState.activeDialog === null) return;
    appState.activeDialog = null;
    notifyAppStateChanged();
}
