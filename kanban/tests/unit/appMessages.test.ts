import { describe, it, expect, afterEach } from 'vitest';
import { useAppStore } from '../../src/features/portfolio/state/store';
import {
  cancelAppMessages,
  resolveAppMessage,
  showAlert,
  showChoice,
  showConfirm,
  showPrompt
} from '../../src/app/overlays/appMessages';

const openMessage = () => useAppStore.getState().appMessage;
const answerWith = (label: string) => {
  const button = openMessage()!.buttons.find((entry) => entry.label === label);
  resolveAppMessage(button!.value);
};

describe('app messages', () => {
  afterEach(() => {
    cancelAppMessages();
  });

  it('starts with no message open', () => {
    expect(openMessage()).toBe(null);
  });

  it('shows an alert and resolves once it is dismissed', async () => {
    const answered = showAlert('Saved.', { title: 'Done' });

    expect(openMessage()).toMatchObject({ title: 'Done', text: 'Saved.' });
    resolveAppMessage(undefined);

    await expect(answered).resolves.toBeUndefined();
    expect(openMessage()).toBe(null);
  });

  it('resolves a confirm with the chosen button', async () => {
    const confirmed = showConfirm('Delete it?', { confirmLabel: 'Delete', danger: true });
    expect(openMessage()!.buttons.map((button) => button.label)).toEqual(['Cancel', 'Delete']);
    answerWith('Delete');
    await expect(confirmed).resolves.toBe(true);

    const cancelled = showConfirm('Delete it?');
    answerWith('Cancel');
    await expect(cancelled).resolves.toBe(false);
  });

  it('confirms independent dropdown values and cancels without returning decisions', async () => {
    const fields = [{ id: 'story', label: 'Story', options: [{ value: 'advance', label: 'Advance' }, { value: 'keep', label: 'Keep' }] }];
    const confirmed = showConfirm('Review', { selections: fields });
    expect(openMessage()!.selections).toEqual(fields);
    expect(openMessage()!.buttons.find((button) => button.primary)?.submitsSelections).toBe(true);
    resolveAppMessage({ story: 'keep' });
    await expect(confirmed).resolves.toEqual({ story: 'keep' });
    const cancelled = showConfirm('Review', { selections: fields });
    cancelAppMessages();
    await expect(cancelled).resolves.toBe(false);
  });

  it('opens a prompt with its default value and resolves with the entered text', async () => {
    const answered = showPrompt('Project name:', 'Alpha');

    expect(openMessage()!.input).toEqual({ defaultValue: 'Alpha' });
    resolveAppMessage('Beta');

    await expect(answered).resolves.toBe('Beta');
  });

  it('resolves a choice with the chosen value', async () => {
    const answered = showChoice('Pick one', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', primary: true }]);

    expect(openMessage()!.buttons.map((button) => button.label)).toEqual(['Cancel', 'A', 'B']);
    answerWith('A');

    await expect(answered).resolves.toBe('a');
  });

  it('queues messages and shows them one at a time in order', async () => {
    const first = showConfirm('First?');
    const second = showAlert('Second');

    expect(openMessage()!.text).toBe('First?');
    answerWith('OK');
    await expect(first).resolves.toBe(true);

    expect(openMessage()!.text).toBe('Second');
    resolveAppMessage(undefined);
    await expect(second).resolves.toBeUndefined();
    expect(openMessage()).toBe(null);
  });

  it('cancels the open and queued messages with their cancel values', async () => {
    const confirmed = showConfirm('Sure?');
    const named = showPrompt('Name?');

    cancelAppMessages();

    await expect(confirmed).resolves.toBe(false);
    await expect(named).resolves.toBe(null);
    expect(openMessage()).toBe(null);
  });
});
