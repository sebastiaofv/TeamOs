import { describe, it, expect, vi, afterEach } from 'vitest';
import { appState } from '../../src/state/store.js';
import { subscribe } from '../../src/bridge/appStore.js';
import { openDialog, closeDialog } from '../../src/actions/dialogs.js';

describe('dialog actions', () => {
  let unsubscribe = () => {};

  afterEach(() => {
    unsubscribe();
    appState.activeDialog = null;
    appState.dialogProps = null;
  });

  function listen() {
    const listener = vi.fn();
    unsubscribe = subscribe(listener);
    return listener;
  }

  it('starts with no dialog open and no props', () => {
    expect(appState.activeDialog).toBe(null);
    expect(appState.dialogProps).toBe(null);
  });

  it('openDialog sets activeDialog and notifies', () => {
    const listener = listen();

    openDialog('help');

    expect(appState.activeDialog).toBe('help');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('openDialog stores the view model as dialogProps', () => {
    openDialog('taskDetail', { readOnly: true });

    expect(appState.dialogProps).toEqual({ readOnly: true });
  });

  it('openDialog without props clears stale dialogProps', () => {
    appState.dialogProps = { stale: true };

    openDialog('help');

    expect(appState.dialogProps).toBe(null);
  });

  it('re-opening the open dialog replaces its props and notifies', () => {
    openDialog('taskDetail', { version: 1 });
    const listener = listen();

    openDialog('taskDetail', { version: 2 });

    expect(appState.activeDialog).toBe('taskDetail');
    expect(appState.dialogProps).toEqual({ version: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('closeDialog clears activeDialog and dialogProps and notifies', () => {
    openDialog('roadmapEntity', { kind: 'milestones' });
    const listener = listen();

    closeDialog();

    expect(appState.activeDialog).toBe(null);
    expect(appState.dialogProps).toBe(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('closeDialog does not notify when no dialog is open', () => {
    const listener = listen();

    closeDialog();

    expect(appState.activeDialog).toBe(null);
    expect(listener).not.toHaveBeenCalled();
  });

  it('closeDialog(name) does nothing when a different dialog is open', () => {
    openDialog('help');
    const listener = listen();

    closeDialog('taskDetail');

    expect(appState.activeDialog).toBe('help');
    expect(listener).not.toHaveBeenCalled();
  });

  it('closeDialog(name) closes the matching dialog', () => {
    openDialog('taskDetail', { readOnly: false });
    const listener = listen();

    closeDialog('taskDetail');

    expect(appState.activeDialog).toBe(null);
    expect(appState.dialogProps).toBe(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
