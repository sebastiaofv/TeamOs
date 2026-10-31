import type { KeyboardEvent } from 'react';

export function navigateControlTabs<T extends string>(event: KeyboardEvent<HTMLButtonElement>, values: readonly T[], current: T, select: (value: T) => void) {
    const index = values.indexOf(current);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1
        : event.key === 'ArrowRight' ? (index + 1) % values.length
            : event.key === 'ArrowLeft' ? (index + values.length - 1) % values.length : null;
    if (next === null) return;
    event.preventDefault(); event.stopPropagation(); select(values[next]);
    const buttons = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)') || []);
    buttons[next]?.focus();
}
