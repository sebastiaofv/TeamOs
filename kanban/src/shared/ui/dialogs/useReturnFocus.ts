import { useRef, type RefObject } from 'react';

type InitialFocusElement = HTMLElement & { select?: () => void };

// Radix returns focus to Dialog.Trigger on close, but our dialogs are opened by
// buttons, cards and keyboard shortcuts outside the dialog tree, so there is no
// Trigger. Capture the focused element just before Radix moves focus into the
// dialog, and hand focus back on close -- but only when closing lost focus
// (it fell to body) and the element is still in the document. Code that already
// moved focus elsewhere (e.g. into the task editor) keeps it.
//
// `initialFocus` is an optional ref; when set, it receives focus on open
// instead of Radix's default (the first tabbable element). With
// `selectInitial`, its text is selected too.
// Spread the result onto Dialog.Content.
export function useReturnFocus({ initialFocus, selectInitial = false }: {
    initialFocus?: RefObject<InitialFocusElement | null>;
    selectInitial?: boolean;
} = {}) {
    const returnTargetRef = useRef<HTMLElement | null>(null);
    return {
        onOpenAutoFocus: (event: Event) => {
            returnTargetRef.current = document.activeElement as HTMLElement | null;
            const content = event.target instanceof HTMLElement ? event.target : null;
            if (initialFocus?.current) {
                event.preventDefault();
                initialFocus.current.focus({ preventScroll: true });
                if (selectInitial) initialFocus.current.select?.();
            }
            // Radix's default focus can target a control below a long review.
            // Reset after it runs so every newly opened dialog starts at its top.
            requestAnimationFrame(() => {
                if (!content?.isConnected) return;
                content.scrollTop = 0;
                content.querySelectorAll('.modal-body').forEach((body) => { body.scrollTop = 0; });
            });
        },
        onCloseAutoFocus: (event: Event) => {
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
