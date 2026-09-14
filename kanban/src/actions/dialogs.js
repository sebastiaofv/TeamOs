// Dialog actions shared by React components and browser integrations. Plain
// module functions -- never exposed on window.

import { flushSync } from 'react-dom';
import { notifyAppStateChanged, useAppStore } from '../state/store.js';

// Opens `name` with an optional view model. Re-opening the dialog that is
// already open replaces its props; the Radix root stays mounted.
export function openDialog(name, props = null) {
    useAppStore.setState({ activeDialog: name, dialogProps: props });
    notifyAppStateChanged();
}

// Closes the open dialog, or only `name` when given. Commits synchronously:
// browser integrations often move focus right after closing a dialog (e.g. into
// the task editor), and Radix's focus trap must already be unmounted by then.
// Never call this during a React render or lifecycle method.
export function closeDialog(name) {
    const { activeDialog } = useAppStore.getState();
    if (activeDialog === null) return;
    if (name !== undefined && activeDialog !== name) return;
    flushSync(() => {
        useAppStore.setState({ activeDialog: null, dialogProps: null });
        notifyAppStateChanged();
    });
}
