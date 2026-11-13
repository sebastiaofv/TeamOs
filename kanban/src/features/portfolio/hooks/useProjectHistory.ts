import { useEffect, useState } from 'react';
import { ensureProjectHistoryLoaded } from '@/infrastructure/persistence/projectFiles';
import { formatErrorMessage } from '@/domain/util';

export type ProjectHistoryView = { status: 'idle' } | { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };
/** The settled result of one load request, tagged with the request it answers. */
export type ProjectHistoryLoad = { request: string; view: { status: 'ready' } | { status: 'error'; message: string } } | null;

export const projectHistoryRequest = (boardId: string, enabled: boolean, attempt: number): string => enabled && boardId ? `${attempt}:${boardId}` : '';

/** Idle while not wanted; loading until a result for this exact request arrives, so a result never outlives its request. */
export function projectHistoryView(request: string, load: ProjectHistoryLoad): ProjectHistoryView {
    if (!request) return { status: 'idle' };
    return load?.request === request ? load.view : { status: 'loading' };
}

export function useProjectHistory(boardId: string, enabled: boolean) {
    const [attempt, setAttempt] = useState(0);
    const [load, setLoad] = useState<ProjectHistoryLoad>(null);
    const request = projectHistoryRequest(boardId, enabled, attempt);
    useEffect(() => {
        if (!request) return;
        let active = true;
        ensureProjectHistoryLoaded(boardId).then(
            () => { if (active) setLoad({ request, view: { status: 'ready' } }); },
            (reason: unknown) => { if (active) setLoad({ request, view: { status: 'error', message: formatErrorMessage(reason) } }); }
        );
        return () => { active = false; };
    }, [request, boardId]);
    const view = projectHistoryView(request, load);
    return {
        status: view.status,
        loading: view.status === 'loading',
        error: view.status === 'error' ? view.message : '',
        retry: () => setAttempt((value) => value + 1)
    };
}
