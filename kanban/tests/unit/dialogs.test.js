import { describe, it, expect, vi, afterEach } from 'vitest';
import { appState } from '../../src/state/store.js';
import { subscribe } from '../../src/bridge/appStore.js';
import { openDialog, closeDialog } from '../../src/actions/dialogs.js';

describe('dialog actions', () => {
  let unsubscribe = () => {};

  afterEach(() => {
    unsubscribe();
    appState.activeDialog = null;
  });

  function listen() {
    const listener = vi.fn();
    unsubscribe = subscribe(listener);
    return listener;
  }

  it('starts with no dialog open', () => {
    expect(appState.activeDialog).toBe(null);
  });

  it('openDialog sets activeDialog and notifies', () => {
    const listener = listen();

    openDialog('help');

    expect(appState.activeDialog).toBe('help');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('closeDialog clears activeDialog and notifies', () => {
    openDialog('shortcuts');
    const listener = listen();

    closeDialog();

    expect(appState.activeDialog).toBe(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('closeDialog does not notify when no dialog is open', () => {
    const listener = listen();

    closeDialog();

    expect(appState.activeDialog).toBe(null);
    expect(listener).not.toHaveBeenCalled();
  });
});
