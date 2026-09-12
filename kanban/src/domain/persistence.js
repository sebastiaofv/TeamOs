export function createProjectSaveState() {
    return {
        status: 'idle',
        inFlight: null,
        queued: false,
        lastErrorMessage: '',
        lastSavedAt: '',
        revision: 0,
        savedRevision: 0,
        watchStatus: 'idle',
        watchMessage: '',
        watchStatusUntil: 0
    };
}
