import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

// Table controls use the same dismiss/focus behavior for filters and columns.
export function useTableDisclosure(hidden: boolean) {
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const summaryRef = useRef<HTMLElement>(null);
    const onToggle = useCallback(() => {
        const details = detailsRef.current;
        if (!details?.open) return;
        details.parentElement?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((other) => {
            if (other !== details) other.open = false;
        });
        const panel = details.querySelector<HTMLElement>('[data-table-panel]');
        if (panel) {
            const available = window.innerHeight - panel.getBoundingClientRect().top - 12;
            details.style.setProperty('--table-panel-height', `${Math.max(80, available)}px`);
        }
    }, []);

    function close() {
        if (detailsRef.current) detailsRef.current.open = false;
        summaryRef.current?.focus({ preventScroll: true });
    }

    function onKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
        if (event.key !== 'Escape' || !detailsRef.current?.open) return;
        event.preventDefault();
        event.stopPropagation();
        close();
    }

    useEffect(() => {
        if (hidden) return;
        const dismiss = (event: PointerEvent) => {
            const details = detailsRef.current;
            if (details?.open && !details.contains(event.target as Node)) details.open = false;
        };
        document.addEventListener('pointerdown', dismiss);
        window.addEventListener('resize', onToggle);
        return () => {
            document.removeEventListener('pointerdown', dismiss);
            window.removeEventListener('resize', onToggle);
        };
    }, [hidden, onToggle]);

    return { detailsRef, summaryRef, close, onKeyDown, onToggle };
}
