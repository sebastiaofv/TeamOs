import { describe, it, expect, vi } from 'vitest';
import {
  setLegacyHost,
  closeTaskDetail,
  toggleTaskDetailChecklistItem,
  closeRoadmapEntity,
  saveRoadmapEntity,
  performUndo
} from '../../src/actions/legacyHost.js';

// Order matters: the first test runs before any host is registered.
describe('legacy host actions', () => {
  it('do nothing before a host is registered', () => {
    expect(closeTaskDetail()).toBeUndefined();
    expect(toggleTaskDetailChecklistItem(0, true)).toBeUndefined();
    expect(closeRoadmapEntity()).toBeUndefined();
    expect(saveRoadmapEntity({ kind: 'milestones' })).toBeUndefined();
    expect(performUndo()).toBeUndefined();
  });

  it('delegate to the registered host, passing arguments and returning its result', () => {
    const host = {
      closeTaskDetail: vi.fn(() => 'closed-detail'),
      toggleTaskDetailChecklistItem: vi.fn(() => 'toggled'),
      closeRoadmapEntity: vi.fn(() => 'closed-roadmap'),
      saveRoadmapEntity: vi.fn(() => 'saved'),
      performUndo: vi.fn(() => 'undone')
    };
    setLegacyHost(host);
    const draft = { kind: 'phases', itemId: 'p1', title: 'Build' };

    expect(closeTaskDetail()).toBe('closed-detail');
    expect(toggleTaskDetailChecklistItem(2, false)).toBe('toggled');
    expect(closeRoadmapEntity()).toBe('closed-roadmap');
    expect(saveRoadmapEntity(draft)).toBe('saved');
    expect(performUndo()).toBe('undone');

    expect(host.toggleTaskDetailChecklistItem).toHaveBeenCalledWith(2, false);
    expect(host.saveRoadmapEntity).toHaveBeenCalledWith(draft);
    expect(host.closeTaskDetail).toHaveBeenCalledTimes(1);
    expect(host.closeRoadmapEntity).toHaveBeenCalledTimes(1);
    expect(host.performUndo).toHaveBeenCalledTimes(1);
  });
});
