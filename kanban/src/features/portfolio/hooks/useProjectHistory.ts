import { useEffect, useState } from 'react';
import { ensureProjectHistoryLoaded } from '@/infrastructure/persistence/projectFiles';
import { formatErrorMessage } from '@/domain/util';

export function useProjectHistory(boardId: string, enabled: boolean) {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!enabled || !boardId) return;
        let active = true;
        setLoading(true); setError('');
        ensureProjectHistoryLoaded(boardId).catch((reason: unknown) => {
            if (active) setError(formatErrorMessage(reason));
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [boardId, enabled, attempt]);
    return { error, loading, retry: () => setAttempt((value) => value + 1) };
}
