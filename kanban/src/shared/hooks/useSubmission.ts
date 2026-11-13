import { useCallback, useRef, useState } from 'react';

// One in-flight submission at a time. `busy` drives rendering; the ref closes
// the gap before React re-renders, so a double click cannot start a second run.
export function useSubmission() {
    const running = useRef(false);
    const [busy, setBusy] = useState(false);
    const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
        if (running.current) return undefined;
        running.current = true;
        setBusy(true);
        try { return await action(); } finally { running.current = false; setBusy(false); }
    }, []);
    const isRunning = useCallback(() => running.current, []);
    return { busy, run, isRunning };
}
