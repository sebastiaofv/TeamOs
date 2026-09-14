// Named elements that keyboard shortcuts move focus to. Components register a
// ref with useFocusTarget; actions focus by name instead of looking up DOM ids.

import type { RefObject } from 'react';

type FocusRef = RefObject<HTMLElement | null>;

const targets = new Map<string, FocusRef>();

// Returns an unregister function. Only removes the entry if it still holds
// `ref`, so a remounted component's newer registration survives.
export function registerFocusTarget(name: string, ref: FocusRef): () => void {
    targets.set(name, ref);
    return () => {
        if (targets.get(name) === ref) targets.delete(name);
    };
}

export function focusTarget(name: string): void {
    targets.get(name)?.current?.focus();
}
