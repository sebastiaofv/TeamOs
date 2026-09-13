import { describe, it, expect, vi } from 'vitest';
import { subscribe, getVersion, notifyAppStateChanged } from '../../src/bridge/appStore.js';

describe('appStore version tick', () => {
  it('delivers a notification to a subscribed listener', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    notifyAppStateChanged();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('increments the version by one per notify', () => {
    const before = getVersion();

    notifyAppStateChanged();
    notifyAppStateChanged();

    expect(getVersion()).toBe(before + 2);
  });

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    unsubscribe();
    notifyAppStateChanged();

    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies every subscriber', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribe(first);
    const unsubscribeSecond = subscribe(second);

    notifyAppStateChanged();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribeFirst();
    unsubscribeSecond();
  });
});
