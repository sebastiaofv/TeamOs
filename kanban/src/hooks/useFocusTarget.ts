import { useEffect, useRef, type RefObject } from 'react';
import { registerFocusTarget } from '../actions/focusTargets';

// Registers the returned ref under `name`, so focusTarget(name) can reach it.
export function useFocusTarget<T extends HTMLElement>(name: string): RefObject<T | null> {
    const ref = useRef<T>(null);
    useEffect(() => registerFocusTarget(name, ref), [name]);
    return ref;
}
