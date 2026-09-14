import { describe, it, expect, vi, afterEach } from 'vitest';
import { subscribeToVersion as subscribe, useAppStore } from '../../src/state/store.js';
import { openDialog, closeDialog } from '../../src/actions/dialogs.js';

describe('dialog actions', () => {
  let unsubscribe = () => {};

  afterEach(() => {
    unsubscribe();
    useAppStore.setState({ activeDialog: null, dialogProps: null });
  });

  function listen() {
    const listener = vi.fn();
    unsubscribe = subscribe(listener);
    return listener;
  }

  it('starts with no dialog open and no props', () => {
    expect(useAppStore.getState().activeDialog).toBe(null);
    expect(useAppStore.getState().dialogProps).toBe(null);
  });

  it('openDialog sets activeDialog and notifies', () => {
    const listener = listen();

    openDialog('help');

    expect(useAppStore.getState().activeDialog).toBe('help');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('openDialog stores the view model as dialogProps', () => {
    openDialog('taskDetail', { readOnly: true });

    expect(useAppStore.getState().dialogProps).toEqual({ readOnly: true });
  });

  it('openDialog without props clears stale dialogProps', () => {
    useAppStore.setState({ dialogProps: { stale: true } });

    openDialog('help');

    expect(useAppStore.getState().dialogProps).toBe(null);
  });

  it('re-opening the open dialog replaces its props and notifies', () => {
    openDialog('taskDetail', { version: 1 });
    const listener = listen();

    openDialog('taskDetail', { version: 2 });

    expect(useAppStore.getState().activeDialog).toBe('taskDetail');
    expect(useAppStore.getState().dialogProps).toEqual({ version: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('closeDialog clears activeDialog and dialogProps and notifies', () => {
    openDialog('roadmapEntity', { kind: 'milestones' });
    const listener = listen();

    closeDialog();

    expect(useAppStore.getState().activeDialog).toBe(null);
    expect(useAppStore.getState().dialogProps).toBe(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('closeDialog does not notify when no dialog is open', () => {
    const listener = listen();

    closeDialog();

    expect(useAppStore.getState().activeDialog).toBe(null);
    expect(listener).not.toHaveBeenCalled();
  });

  it('closeDialog(name) does nothing when a different dialog is open', () => {
    openDialog('help');
    const listener = listen();

    closeDialog('taskDetail');

    expect(useAppStore.getState().activeDialog).toBe('help');
    expect(listener).not.toHaveBeenCalled();
  });

  it('closeDialog(name) closes the matching dialog', () => {
    openDialog('taskDetail', { readOnly: false });
    const listener = listen();

    closeDialog('taskDetail');

    expect(useAppStore.getState().activeDialog).toBe(null);
    expect(useAppStore.getState().dialogProps).toBe(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the task editor by name', () => {
    openDialog('taskEditor', { openId: 1 });
    expect(useAppStore.getState().activeDialog).toBe('taskEditor');
    expect(useAppStore.getState().dialogProps).toEqual({ openId: 1 });

    closeDialog('taskDetail');
    expect(useAppStore.getState().activeDialog).toBe('taskEditor');

    closeDialog('taskEditor');
    expect(useAppStore.getState().activeDialog).toBe(null);
    expect(useAppStore.getState().dialogProps).toBe(null);
  });
});
