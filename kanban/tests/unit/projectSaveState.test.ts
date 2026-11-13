import { describe, it, expect } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import type { ProjectMerge } from '../../src/domain/projectMerge';
import { createProjectSaveState as createFromProjectFiles } from '../../src/infrastructure/persistence/projectFiles';
import {
  blocksProjectTransfers,
  canRetrySave,
  createProjectSaveState,
  currentProjectMerge,
  hasUnsavedChanges,
  needsCloseWarning,
  projectSaveBadge,
  transitionProjectSave,
  type ProjectSaveEvent,
  type ProjectSaveState
} from '../../src/infrastructure/persistence/projectSaveLifecycle';

const merge = (changes: string[] = ['board.settings.title']): ProjectMerge => fromPartial({ changes, conflicts: [] });
const conflictMerge = (): ProjectMerge => fromPartial({ changes: [], conflicts: [{ key: 'title' }] });

function run(...events: ProjectSaveEvent[]): ProjectSaveState {
  return events.reduce((state, event) => {
    const result = transitionProjectSave(state, event);
    if ('refused' in result) throw new Error(`${event.type} refused in ${state.phase.kind}: ${result.refused}`);
    return result.state;
  }, createProjectSaveState());
}

function refuses(state: ProjectSaveState, event: ProjectSaveEvent): boolean {
  return 'refused' in transitionProjectSave(state, event);
}

const edited: ProjectSaveEvent = { type: 'edited' };
const writeStarted: ProjectSaveEvent = { type: 'writeStarted' };
const written = (revision: number): ProjectSaveEvent => ({ type: 'written', revision, at: '2026-11-12T10:00:00.000Z' });
const settled: ProjectSaveEvent = { type: 'settled' };

describe('project save lifecycle', () => {
  it('starts saved, with nothing pending', () => {
    const state = createProjectSaveState();
    expect(state).toEqual({ phase: { kind: 'synced' }, revision: 0, savedRevision: 0, lastSavedAt: '', notice: null, recoveryError: '' });
    expect(createFromProjectFiles()).toEqual(state);
    expect(createProjectSaveState()).not.toBe(state);
    expect(projectSaveBadge(state)).toEqual({ kind: 'none' });
  });

  it('walks the happy path: edit, write, settle', () => {
    const pending = run(edited);
    expect(pending.phase.kind).toBe('pending');
    expect(projectSaveBadge(pending).kind).toBe('unsaved');
    const writing = run(edited, writeStarted);
    expect(projectSaveBadge(writing).kind).toBe('saving');
    const saved = run(edited, writeStarted, written(1), settled);
    expect(saved.phase.kind).toBe('synced');
    expect(saved.lastSavedAt).toBe('2026-11-12T10:00:00.000Z');
    expect(hasUnsavedChanges(saved)).toBe(false);
  });

  it('keeps edits made during a write pending after it settles', () => {
    const state = run(edited, writeStarted, edited, written(1), settled);
    expect(state.phase.kind).toBe('pending');
    expect(state.revision).toBe(2);
    expect(state.savedRevision).toBe(1);
  });

  it('turns a clean merge into a new local version and a notice that fades but keeps its details', () => {
    const merged = run(edited, writeStarted, { type: 'merged', merge: merge() });
    expect(merged.phase.kind).toBe('writing');
    expect(merged.revision).toBe(2);
    const saved = run(edited, writeStarted, { type: 'merged', merge: merge() }, written(2), settled);
    expect(projectSaveBadge(saved).kind).toBe('merged');
    const faded = run(edited, writeStarted, { type: 'merged', merge: merge() }, written(2), settled, { type: 'noticeExpired' });
    expect(projectSaveBadge(faded).kind).toBe('none');
    expect(currentProjectMerge(faded)?.changes).toEqual(['board.settings.title']);
    expect(run(edited, { type: 'merged', merge: merge() }, edited).notice).toBeNull();
  });

  it('pauses autosave during a conflict but keeps accepting edits', () => {
    const conflict = run(edited, { type: 'conflicted', merge: conflictMerge() });
    expect(projectSaveBadge(conflict).kind).toBe('conflict');
    expect(refuses(conflict, writeStarted)).toBe(true);
    expect(refuses(conflict, settled)).toBe(true);
    const more = run(edited, { type: 'conflicted', merge: conflictMerge() }, edited);
    expect(more.phase.kind).toBe('conflict');
    expect(more.revision).toBe(2);
    expect(needsCloseWarning(more)).toBe(true);
    expect(blocksProjectTransfers(more)).toBe(true);
  });

  it('ends a conflict by merging the decisions or when the other version disappears', () => {
    const resolved = run(edited, { type: 'conflicted', merge: conflictMerge() }, { type: 'merged', merge: merge() });
    expect(resolved.phase.kind).toBe('pending');
    const vanished = run(edited, { type: 'conflicted', merge: conflictMerge() }, { type: 'diskInSync' });
    expect(vanished.phase.kind).toBe('pending');
  });

  it('keeps a conflict when applying decisions fails, with the error', () => {
    const state = run(edited, { type: 'conflicted', merge: conflictMerge() }, { type: 'saveFailed', error: 'Disk full' });
    expect(state.phase).toMatchObject({ kind: 'conflict', error: 'Disk full' });
  });

  it('starts a restored draft as a conflict from recovery', () => {
    const state = run({ type: 'draftRestored' });
    expect(state.phase).toMatchObject({ kind: 'conflict', source: 'recovery', merge: null });
    expect(hasUnsavedChanges(state)).toBe(true);
    expect(refuses(run(edited), { type: 'draftRestored' })).toBe(true);
  });

  it('separates an unreachable file from a failed save of local edits', () => {
    const unreachable = run({ type: 'diskUnreadable', error: 'Gone' });
    expect(projectSaveBadge(unreachable)).toEqual({ kind: 'unreachable', error: 'Gone' });
    expect(needsCloseWarning(unreachable)).toBe(false);
    expect(blocksProjectTransfers(unreachable)).toBe(true);
    expect(run({ type: 'diskUnreadable', error: 'Gone' }, { type: 'diskInSync' }).phase.kind).toBe('synced');
    expect(run({ type: 'diskUnreadable', error: 'Gone' }, edited).phase.kind).toBe('pending');
    const failed = run(edited, { type: 'diskUnreadable', error: 'Gone' });
    expect(failed.phase).toEqual({ kind: 'failed', error: 'Gone' });
    expect(canRetrySave(failed)).toBe(true);
    expect(refuses(run(edited, { type: 'conflicted', merge: conflictMerge() }), { type: 'diskUnreadable', error: 'Gone' })).toBe(true);
  });

  it('retries a failed write and recovers', () => {
    const state = run(edited, writeStarted, { type: 'saveFailed', error: 'Denied' }, writeStarted, written(1), settled);
    expect(state.phase.kind).toBe('synced');
  });

  it('reloads only when there are no local edits', () => {
    expect(run({ type: 'reloaded' }).notice).toEqual({ kind: 'reloaded', badge: true });
    expect(refuses(run(edited), { type: 'reloaded' })).toBe(true);
  });

  it('refuses events that cannot happen in the current phase', () => {
    const saved = createProjectSaveState();
    expect(refuses(saved, writeStarted)).toBe(true);
    expect(refuses(saved, written(1))).toBe(true);
    expect(refuses(saved, { type: 'noticeExpired' })).toBe(true);
    expect(refuses(run({ type: 'diskUnreadable', error: 'x' }), settled)).toBe(true);
  });

  it('tracks the local recovery copy independently of the phase', () => {
    const state = run(edited, { type: 'recoveryFailed', error: 'Quota' });
    expect(state.recoveryError).toBe('Quota');
    expect(state.phase.kind).toBe('pending');
    expect(run(edited, { type: 'recoveryFailed', error: 'Quota' }, { type: 'recoveryStored' }).recoveryError).toBe('');
  });
});
