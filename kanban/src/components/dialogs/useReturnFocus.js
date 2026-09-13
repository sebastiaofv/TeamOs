import { useRef } from 'react';

// Radix returns focus to Dialog.Trigger on close, but our dialogs are opened by
// legacy buttons and keyboard shortcuts outside React, so there is no Trigger.
// Capture the focused element just before Radix moves focus into the dialog,
// and hand focus back to it on close. Spread the result onto Dialog.Content.
export function useReturnFocus() {
    const returnTargetRef = useRef(null);
    return {
        onOpenAutoFocus: () => {
            returnTargetRef.current = document.activeElement;
        },
        onCloseAutoFocus: (event) => {
            event.preventDefault();
            returnTargetRef.current?.focus();
            returnTargetRef.current = null;
        }
    };
}
