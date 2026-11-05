import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

// Dismiss, focus restoration and viewport sizing for the column chooser.
export function useTableDisclosure(hidden: boolean) {
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const summaryRef = useRef<HTMLElement>(null);
    const onToggle = useCallback(() => {
        const details = detailsRef.current;
        if (!details?.open) return;
        const panel = details.querySelector<HTMLElement>('[data-table-panel]');
        const summary = summaryRef.current;
        if (panel && summary) {
            const heading = details.closest('.table-heading');
            const anchor = (heading || summary).getBoundingClientRect();
            const preferredWidth = parseFloat(getComputedStyle(panel).getPropertyValue('--table-panel-width')) || 360;
            const inset = Math.max(0, Math.min(12, anchor.left, window.innerWidth - anchor.right));
            const width = Math.min(preferredWidth, heading ? anchor.width : preferredWidth, window.innerWidth - inset * 2);
            const below = Math.max(0, window.innerHeight - anchor.bottom - 18);
            const above = Math.max(0, anchor.top - 18);
            const upwards = below < Math.min(panel.scrollHeight, 400) && above > below;
            const available = upwards ? above : below;
            details.style.setProperty('--table-panel-height', `${available}px`);
            Object.assign(panel.style, {
                position: 'fixed', width: `${width}px`, maxWidth: `${width}px`, right: 'auto', bottom: 'auto',
                left: `${Math.max(inset, Math.min(anchor.right - width, window.innerWidth - width - inset))}px`
            });
            const height = panel.getBoundingClientRect().height;
            panel.style.top = `${upwards ? anchor.top - height - 6 : anchor.bottom + 6}px`;
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
        window.addEventListener('scroll', onToggle, true);
        return () => {
            document.removeEventListener('pointerdown', dismiss);
            window.removeEventListener('resize', onToggle);
            window.removeEventListener('scroll', onToggle, true);
        };
    }, [hidden, onToggle]);

    return { detailsRef, summaryRef, close, onKeyDown, onToggle };
}
