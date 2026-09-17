import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useAppStore } from '../../src/features/portfolio/state/store';
import { openDialog, closeDialog } from '../../src/app/overlays/dialogs';

describe('dialog actions', () => {
  let unsubscribe = () => {};

  afterEach(() => {
    unsubscribe();
    useAppStore.setState({ activeDialog: null, dialogProps: null });
  });

  function listen() {
    const listener = vi.fn();
    unsubscribe = useAppStore.subscribe(listener);
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
    openDialog('taskDetail', fromPartial({ readOnly: true }));

    expect(useAppStore.getState().dialogProps).toEqual({ readOnly: true });
  });

  it('openDialog without props clears stale dialogProps', () => {
    useAppStore.setState({ dialogProps: fromAny({ stale: true }) });

    openDialog('help');

    expect(useAppStore.getState().dialogProps).toBe(null);
  });

  it('re-opening the open dialog replaces its props and notifies', () => {
    openDialog('taskDetail', fromAny({ version: 1 }));
    const listener = listen();

    openDialog('taskDetail', fromAny({ version: 2 }));

    expect(useAppStore.getState().activeDialog).toBe('taskDetail');
    expect(useAppStore.getState().dialogProps).toEqual({ version: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('closeDialog clears activeDialog and dialogProps and notifies', () => {
    openDialog('roadmapEntity', fromPartial({ kind: 'milestones' }));
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
    openDialog('taskDetail', fromPartial({ readOnly: false }));
    const listener = listen();

    closeDialog('taskDetail');

    expect(useAppStore.getState().activeDialog).toBe(null);
    expect(useAppStore.getState().dialogProps).toBe(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the task editor by name', () => {
    openDialog('taskEditor', fromPartial({ openId: 1 }));
    expect(useAppStore.getState().activeDialog).toBe('taskEditor');
    expect(useAppStore.getState().dialogProps).toEqual({ openId: 1 });

    closeDialog('taskDetail');
    expect(useAppStore.getState().activeDialog).toBe('taskEditor');

    closeDialog('taskEditor');
    expect(useAppStore.getState().activeDialog).toBe(null);
    expect(useAppStore.getState().dialogProps).toBe(null);
  });
});
