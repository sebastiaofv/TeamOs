import { useLayoutEffect, useRef, useState } from 'react';

/** Fill the viewport, compacting empty states only when equal columns do not fit. */
export function useBoardColumnLayout(columnCount: number) {
    const ref = useRef<HTMLDivElement>(null);
    const [compact, setCompact] = useState(false);
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const measure = () => {
            const style = getComputedStyle(element);
            const minimum = Math.min(parseFloat(style.getPropertyValue('--board-column-min-width')),
                window.innerWidth * parseFloat(style.getPropertyValue('--board-column-viewport-share')));
            const gap = parseFloat(style.columnGap) || 0;
            setCompact(columnCount * minimum + Math.max(0, columnCount - 1) * gap > element.clientWidth + 1);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        const themeObserver = new MutationObserver(measure);
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-style'] });
        window.addEventListener('resize', measure);
        return () => { observer.disconnect(); themeObserver.disconnect(); window.removeEventListener('resize', measure); };
    }, [columnCount]);
    return { ref, compact };
}
