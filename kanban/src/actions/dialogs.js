// Dialog actions, shared by legacy code and React components. Plain module
// functions -- never exposed on window.

import { flushSync } from 'react-dom';
import { appState } from '../state/store.js';
import { notifyAppStateChanged } from '../bridge/appStore.js';

// Opens `name` with an optional view model. Re-opening the dialog that is
// already open replaces its props; the Radix root stays mounted.
export function openDialog(name, props = null) {
    appState.activeDialog = name;
    appState.dialogProps = props;
    notifyAppStateChanged();
}

// Closes the open dialog, or only `name` when given. Commits synchronously:
// legacy code often moves focus right after closing a dialog (e.g. into the
// task editor), and Radix's focus trap must already be unmounted by then.
// Never call this during a React render or lifecycle method.
export function closeDialog(name) {
    if (appState.activeDialog === null) return;
    if (name !== undefined && appState.activeDialog !== name) return;
    appState.activeDialog = null;
    appState.dialogProps = null;
    flushSync(() => notifyAppStateChanged());
}
