import { useCallback, useLayoutEffect, type RefObject } from 'react';

/** Position a floating panel below its trigger, bounded by the viewport. */
export function useAnchoredPanel(open: boolean, anchorId: string, panel: RefObject<HTMLElement | null>) {
    const place = useCallback(() => {
        const anchor = document.getElementById(anchorId)?.getBoundingClientRect();
        const content = panel.current;
        if (!anchor || !content) return;
        const width = content.offsetWidth || parseFloat(getComputedStyle(content).width);
        Object.assign(content.style, {
            left: `${Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))}px`,
            top: `${anchor.bottom + 8}px`,
            maxHeight: `${Math.max(0, window.innerHeight - anchor.bottom - 20)}px`
        });
    }, [anchorId, panel]);
    useLayoutEffect(() => {
        if (!open) return;
        place();
        const observer = new ResizeObserver(place);
        const anchor = document.getElementById(anchorId);
        if (anchor) observer.observe(anchor.closest('header') || anchor);
        if (panel.current) observer.observe(panel.current);
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    }, [open, place, anchorId, panel]);
    return place;
}
