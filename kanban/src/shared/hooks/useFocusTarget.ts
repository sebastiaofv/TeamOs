import { useEffect, useRef, type RefObject } from 'react';
import { registerFocusTarget } from '@/shared/ui/focusTargets';

// Registers the returned ref under `name`, so focusTarget(name) can reach it.
export function useFocusTarget<T extends HTMLElement>(name: string, active = true): RefObject<T | null> {
    const ref = useRef<T>(null);
    useEffect(() => active ? registerFocusTarget(name, ref) : undefined, [name, active]);
    return ref;
}
