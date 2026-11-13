// The save/watch lifecycle of one project as an explicit state machine.
//
// `projectFiles.ts` drives it: every change to a project's save state is a
// named event passed through `transitionProjectSave`. Views and commands read
// it only through the selectors at the bottom, never by combining fields.
// Pure: no store, timers or I/O.

import type { ProjectMerge } from '@/domain/projectMerge';

export type ProjectSavePhase =
    /** Everything shown is in the project file. */
    | { kind: 'synced' }
    /** Local edits wait for autosave. */
    | { kind: 'pending' }
    /** A write to the project file is running. */
    | { kind: 'writing' }
    /** The last write failed; local edits are kept for a retry. */
    | { kind: 'failed'; error: string }
    /**
     * Autosave is paused until the user picks versions. `merge` is null for a
     * restored recovery draft that has not been compared with the disk yet;
     * `error` is a failed attempt to apply the user's decisions.
     */
    | { kind: 'conflict'; source: 'merge' | 'recovery'; merge: ProjectMerge | null; error: string }
    /** The project file cannot be read and there are no local edits. */
    | { kind: 'unreachable'; error: string };

export type ProjectSavePhaseKind = ProjectSavePhase['kind'];

/**
 * What happened on disk most recently. `badge` is true until a timer expires
 * it; the merged change list stays available until the next local edit.
 */
export type ProjectSaveNotice =
    | { kind: 'reloaded'; badge: boolean }
    | { kind: 'merged'; badge: boolean; merge: ProjectMerge };

export type ProjectSaveState = {
    phase: ProjectSavePhase;
    /** Local version counter, raised by every edit and accepted merge. */
    revision: number;
    /** The local version last written to the project file. */
    savedRevision: number;
    lastSavedAt: string;
    notice: ProjectSaveNotice | null;
    /** The local recovery copy runs in the background, independently of the phase. */
    recoveryError: string;
};

export type ProjectSaveEvent =
    | { type: 'edited' }
    | { type: 'writeStarted' }
    | { type: 'written'; revision: number; at: string }
    | { type: 'settled' }
    | { type: 'saveFailed'; error: string }
    | { type: 'diskUnreadable'; error: string }
    | { type: 'diskInSync' }
    | { type: 'reloaded' }
    | { type: 'merged'; merge: ProjectMerge }
    | { type: 'conflicted'; merge: ProjectMerge }
    | { type: 'draftRestored' }
    | { type: 'noticeExpired' }
    | { type: 'recoveryStored' }
    | { type: 'recoveryFailed'; error: string };

export type ProjectSaveTransition = { state: ProjectSaveState } | { refused: string };

export function createProjectSaveState(): ProjectSaveState {
    return { phase: { kind: 'synced' }, revision: 0, savedRevision: 0, lastSavedAt: '', notice: null, recoveryError: '' };
}

/** Returns the next state, or why `event` is not allowed now. Never mutates. */
export function transitionProjectSave(state: ProjectSaveState, event: ProjectSaveEvent): ProjectSaveTransition {
    const { phase } = state;
    const to = (changes: Partial<ProjectSaveState>): ProjectSaveTransition => ({ state: { ...state, ...changes } });
    const refuse = (reason: string): ProjectSaveTransition => ({ refused: reason });
    const unsaved = hasUnsavedChanges(state);

    switch (event.type) {
        case 'edited':
            // Edits are kept locally in every phase, including a conflict.
            return to({
                revision: state.revision + 1,
                notice: null,
                phase: phase.kind === 'synced' || phase.kind === 'unreachable' ? { kind: 'pending' } : phase
            });

        case 'writeStarted':
            if (phase.kind === 'conflict') return refuse('Autosave is paused until the conflict is resolved.');
            if (!unsaved) return refuse('There are no local edits to write.');
            return to({ phase: { kind: 'writing' } });

        case 'written':
            if (phase.kind !== 'writing') return refuse('Only a running write can complete.');
            return to({ savedRevision: event.revision, lastSavedAt: event.at });

        case 'settled':
            if (phase.kind === 'conflict') return refuse('A conflict only ends by merging or by the disk returning to the base version.');
            if (phase.kind === 'unreachable') return refuse('An unreachable file only recovers with a successful check.');
            return to({ phase: unsaved ? { kind: 'pending' } : { kind: 'synced' } });

        case 'saveFailed':
            if (phase.kind === 'conflict') return to({ phase: { ...phase, error: event.error } });
            return to({ phase: { kind: 'failed', error: event.error } });

        case 'diskUnreadable':
            if (phase.kind === 'conflict') return refuse('The conflict takes priority; the next check reports the read error again.');
            // With local edits, an unreadable file means those edits cannot be saved.
            return to({ phase: unsaved || phase.kind === 'writing' ? { kind: 'failed', error: event.error } : { kind: 'unreachable', error: event.error } });

        case 'diskInSync':
            if (phase.kind === 'conflict') return to({ phase: unsaved ? { kind: 'pending' } : { kind: 'synced' } });
            if (phase.kind === 'unreachable') return to({ phase: { kind: 'synced' } });
            return to({});

        case 'reloaded':
            if (phase.kind === 'conflict') return refuse('A conflict waits for the user’s decision.');
            if (unsaved) return refuse('With local edits the other version is merged, never reloaded over them.');
            return to({ phase: { kind: 'synced' }, notice: { kind: 'reloaded', badge: true } });

        case 'merged':
            // The merged result is a new local version that still has to be written.
            return to({
                revision: state.revision + 1,
                notice: { kind: 'merged', badge: true, merge: event.merge },
                phase: phase.kind === 'writing' ? phase : { kind: 'pending' }
            });

        case 'conflicted':
            return to({
                notice: null,
                phase: { kind: 'conflict', source: phase.kind === 'conflict' ? phase.source : 'merge', merge: event.merge, error: '' }
            });

        case 'draftRestored':
            if (unsaved || phase.kind === 'writing' || phase.kind === 'conflict') return refuse('A recovered draft can only replace a saved project.');
            // A recovered draft always needs an explicit check against the disk.
            return to({
                revision: state.revision + 1,
                notice: null,
                phase: { kind: 'conflict', source: 'recovery', merge: null, error: '' }
            });

        case 'noticeExpired':
            if (!state.notice?.badge) return refuse('No notice badge is showing.');
            return to({ notice: { ...state.notice, badge: false } });

        case 'recoveryStored':
            return to({ recoveryError: '' });

        case 'recoveryFailed':
            return to({ recoveryError: event.error });
    }
}

// --- Selectors: the only way the rest of the app reads the lifecycle ---

export function hasUnsavedChanges(state: ProjectSaveState | null | undefined): boolean {
    return Boolean(state && state.revision > state.savedRevision);
}

export function isProjectSaving(state: ProjectSaveState | null | undefined): boolean {
    return state?.phase.kind === 'writing';
}

export function isInConflict(state: ProjectSaveState | null | undefined): boolean {
    return state?.phase.kind === 'conflict';
}

/** Closing the app would lose local edits or an unresolved conflict. */
export function needsCloseWarning(state: ProjectSaveState | null | undefined): boolean {
    return hasUnsavedChanges(state) || isInConflict(state);
}

/** Cross-project moves and copies need a project whose file is known to be current. */
export function blocksProjectTransfers(state: ProjectSaveState | null | undefined): boolean {
    return state?.phase.kind === 'conflict' || state?.phase.kind === 'unreachable';
}

export function canRetrySave(state: ProjectSaveState | null | undefined): boolean {
    return hasUnsavedChanges(state) || state?.phase.kind === 'failed';
}

/** The merge whose details are still on screen: the open conflict or the last clean merge. */
export function currentProjectMerge(state: ProjectSaveState | null | undefined): ProjectMerge | null {
    if (state?.phase.kind === 'conflict') return state.phase.merge;
    return state?.notice?.kind === 'merged' ? state.notice.merge : null;
}

export type ProjectSaveBadge =
    | { kind: 'none' }
    | { kind: 'conflict' }
    | { kind: 'failed'; error: string }
    | { kind: 'saving' }
    | { kind: 'unsaved' }
    | { kind: 'unreachable'; error: string }
    | { kind: 'reloaded' }
    | { kind: 'merged' };

/** The single toolbar badge for a project, in priority order. */
export function projectSaveBadge(state: ProjectSaveState | null | undefined): ProjectSaveBadge {
    if (!state) return { kind: 'none' };
    const { phase, notice } = state;
    switch (phase.kind) {
        case 'conflict': return { kind: 'conflict' };
        case 'failed': return { kind: 'failed', error: phase.error };
        case 'writing': return { kind: 'saving' };
        case 'pending': return { kind: 'unsaved' };
        case 'unreachable': return { kind: 'unreachable', error: phase.error };
        case 'synced':
            if (!notice?.badge) return { kind: 'none' };
            return { kind: notice.kind };
    }
}
