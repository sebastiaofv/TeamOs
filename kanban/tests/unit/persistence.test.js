import { describe, it, expect } from 'vitest';
import { createProjectSaveState } from '../../src/domain/persistence.js';

describe('createProjectSaveState', () => {
  it('returns the exact expected shape and key set', () => {
    expect(createProjectSaveState()).toEqual({
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
    });
  });

  it('defaults status and watchStatus to "idle"', () => {
    const state = createProjectSaveState();
    expect(state.status).toBe('idle');
    expect(state.watchStatus).toBe('idle');
  });

  it('defaults inFlight to null and queued to false', () => {
    const state = createProjectSaveState();
    expect(state.inFlight).toBeNull();
    expect(state.queued).toBe(false);
  });

  it('defaults revision counters to 0', () => {
    const state = createProjectSaveState();
    expect(state.revision).toBe(0);
    expect(state.savedRevision).toBe(0);
    expect(state.watchStatusUntil).toBe(0);
  });

  it('defaults message/timestamp fields to empty strings', () => {
    const state = createProjectSaveState();
    expect(state.lastErrorMessage).toBe('');
    expect(state.lastSavedAt).toBe('');
    expect(state.watchMessage).toBe('');
  });

  it('returns a fresh object on each call, not a shared reference', () => {
    const a = createProjectSaveState();
    const b = createProjectSaveState();
    expect(a).not.toBe(b);
    a.status = 'saving';
    expect(b.status).toBe('idle');
  });
});
