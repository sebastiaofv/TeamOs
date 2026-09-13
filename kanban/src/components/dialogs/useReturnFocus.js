import { useRef } from 'react';

// Radix returns focus to Dialog.Trigger on close, but our dialogs are opened by
// legacy buttons, cards and keyboard shortcuts outside React, so there is no
// Trigger. Capture the focused element just before Radix moves focus into the
// dialog, and hand focus back on close -- but only when closing lost focus
// (it fell to body) and the element is still in the document. Legacy code that
// already moved focus elsewhere (e.g. into the task editor) keeps it.
//
// `initialFocus` is an optional ref; when set, it receives focus on open
// instead of Radix's default (the first tabbable element).
// Spread the result onto Dialog.Content.
export function useReturnFocus({ initialFocus } = {}) {
    const returnTargetRef = useRef(null);
    return {
        onOpenAutoFocus: (event) => {
            returnTargetRef.current = document.activeElement;
            if (initialFocus?.current) {
                event.preventDefault();
                initialFocus.current.focus();
            }
        },
        onCloseAutoFocus: (event) => {
            event.preventDefault();
            const target = returnTargetRef.current;
            returnTargetRef.current = null;
            const focusWasLost = !document.activeElement || document.activeElement === document.body;
            if (focusWasLost && target?.isConnected) {
                target.focus();
            }
        }
    };
}
