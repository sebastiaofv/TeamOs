import { describe, expect, it } from 'vitest';
import { projectHistoryRequest, projectHistoryView, type ProjectHistoryLoad } from '../../src/features/portfolio/hooks/useProjectHistory';

describe('project history load view', () => {
  it('is idle, not loading, once the load is no longer wanted', () => {
    // Switching tabs mid-load disables the request before its result arrives.
    expect(projectHistoryView(projectHistoryRequest('board-1', false, 0), null)).toEqual({ status: 'idle' });
    expect(projectHistoryView(projectHistoryRequest('', true, 0), null)).toEqual({ status: 'idle' });
  });

  it('loads until the current request settles', () => {
    const request = projectHistoryRequest('board-1', true, 0);
    expect(projectHistoryView(request, null)).toEqual({ status: 'loading' });
    expect(projectHistoryView(request, { request, view: { status: 'ready' } })).toEqual({ status: 'ready' });
  });

  it('drops an error on retry or for another project', () => {
    const failed: ProjectHistoryLoad = { request: projectHistoryRequest('board-1', true, 0), view: { status: 'error', message: 'Unreadable' } };
    expect(projectHistoryView(failed.request, failed)).toEqual({ status: 'error', message: 'Unreadable' });
    expect(projectHistoryView(projectHistoryRequest('board-1', true, 1), failed)).toEqual({ status: 'loading' });
    expect(projectHistoryView(projectHistoryRequest('board-2', true, 0), failed)).toEqual({ status: 'loading' });
  });
});
