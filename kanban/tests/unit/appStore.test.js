import { describe, it, expect, vi } from 'vitest';
import { getStoreVersion, notifyAppStateChanged, subscribeToVersion } from '../../src/state/store.js';

describe('appStore version tick', () => {
  it('delivers a notification to a subscribed listener', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToVersion(listener);

    notifyAppStateChanged();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('increments the version by one per notify', () => {
    const before = getStoreVersion();

    notifyAppStateChanged();
    notifyAppStateChanged();

    expect(getStoreVersion()).toBe(before + 2);
  });

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToVersion(listener);

    unsubscribe();
    notifyAppStateChanged();

    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies every subscriber', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeToVersion(first);
    const unsubscribeSecond = subscribeToVersion(second);

    notifyAppStateChanged();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribeFirst();
    unsubscribeSecond();
  });
});
