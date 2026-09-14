// Named elements that keyboard shortcuts move focus to. Components register a
// ref with useFocusTarget; actions focus by name instead of looking up DOM ids.

const targets = new Map();

// Returns an unregister function. Only removes the entry if it still holds
// `ref`, so a remounted component's newer registration survives.
export function registerFocusTarget(name, ref) {
    targets.set(name, ref);
    return () => {
        if (targets.get(name) === ref) targets.delete(name);
    };
}

export function focusTarget(name) {
    targets.get(name)?.current?.focus();
}
