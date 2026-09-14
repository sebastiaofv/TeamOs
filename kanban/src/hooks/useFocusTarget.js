import { useEffect, useRef } from 'react';
import { registerFocusTarget } from '../actions/focusTargets.js';

// Registers the returned ref under `name`, so focusTarget(name) can reach it.
export function useFocusTarget(name) {
    const ref = useRef(null);
    useEffect(() => registerFocusTarget(name, ref), [name]);
    return ref;
}
