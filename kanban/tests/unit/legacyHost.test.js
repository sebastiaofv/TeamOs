import { describe, it, expect, vi } from 'vitest';
import {
  setLegacyHost,
  closeTaskDetail,
  toggleTaskDetailChecklistItem,
  closeRoadmapEntity,
  saveRoadmapEntity,
  performUndo,
  closeTaskEditor,
  saveTask,
  setPortfolioFilter,
  setPortfolioSort,
  setPortfolioViewMode,
  resetPortfolioFilters,
  selectPortfolioBoard,
  removePortfolioBoard,
  retryPortfolioSave,
  clearPortfolioBulkSelection,
  openCreateSprintFromSelection,
  openAssignSprintFromSelection,
  togglePortfolioTaskBulkSelection,
  onPortfolioTaskDragStart,
  onPortfolioTaskDragEnd,
  onPortfolioColumnDragOver,
  onPortfolioColumnDragLeave,
  onPortfolioColumnDrop,
  setPortfolioTimelineSelection,
  movePortfolioTimelineToLatest,
  setPortfolioTimelineExpanded,
  restorePortfolioTimelineSelection,
  beginPortfolioTimelineSliderDrag
} from '../../src/actions/legacyHost.js';

// Order matters: the first test runs before any host is registered.
describe('legacy host actions', () => {
  it('do nothing before a host is registered', () => {
    expect(closeTaskDetail()).toBeUndefined();
    expect(toggleTaskDetailChecklistItem(0, true)).toBeUndefined();
    expect(closeRoadmapEntity()).toBeUndefined();
    expect(saveRoadmapEntity({ kind: 'milestones' })).toBeUndefined();
    expect(performUndo()).toBeUndefined();
    expect(closeTaskEditor()).toBeUndefined();
    expect(saveTask({ title: 'x' })).toBeUndefined();
    expect(setPortfolioFilter('search', 'x')).toBeUndefined();
    expect(setPortfolioSort('score')).toBeUndefined();
    expect(setPortfolioViewMode('calendar')).toBeUndefined();
    expect(resetPortfolioFilters()).toBeUndefined();
    expect(selectPortfolioBoard('p1')).toBeUndefined();
    expect(removePortfolioBoard('p1')).toBeUndefined();
    expect(retryPortfolioSave('p1')).toBeUndefined();
    expect(clearPortfolioBulkSelection('p1')).toBeUndefined();
    expect(openCreateSprintFromSelection('p1')).toBeUndefined();
    expect(openAssignSprintFromSelection('p1')).toBeUndefined();
    expect(togglePortfolioTaskBulkSelection('p1', 1, true)).toBeUndefined();
    expect(onPortfolioTaskDragStart({}, { boardId: 'p1', taskId: 1 })).toBeUndefined();
    expect(onPortfolioTaskDragEnd({})).toBeUndefined();
    expect(onPortfolioColumnDragOver({}, 'doing')).toBeUndefined();
    expect(onPortfolioColumnDragLeave({})).toBeUndefined();
    expect(onPortfolioColumnDrop({}, 'doing')).toBeUndefined();
    expect(setPortfolioTimelineSelection('p1', 2)).toBeUndefined();
    expect(movePortfolioTimelineToLatest('p1')).toBeUndefined();
    expect(setPortfolioTimelineExpanded('p1', true)).toBeUndefined();
    expect(restorePortfolioTimelineSelection()).toBeUndefined();
    expect(beginPortfolioTimelineSliderDrag('p1')).toBeUndefined();
  });

  it('delegate to the registered host, passing arguments and returning its result', () => {
    const host = {
      closeTaskDetail: vi.fn(() => 'closed-detail'),
      toggleTaskDetailChecklistItem: vi.fn(() => 'toggled'),
      closeRoadmapEntity: vi.fn(() => 'closed-roadmap'),
      saveRoadmapEntity: vi.fn(() => 'saved'),
      performUndo: vi.fn(() => 'undone'),
      closeTaskEditor: vi.fn(() => 'closed-editor'),
      saveTask: vi.fn(() => 'saved-task'),
      setPortfolioFilter: vi.fn(() => 'filter-set'),
      setPortfolioSort: vi.fn(() => 'sort-set'),
      setPortfolioViewMode: vi.fn(() => 'view-set'),
      resetPortfolioFilters: vi.fn(() => 'filters-reset'),
      selectPortfolioBoard: vi.fn(() => 'board-selected'),
      removePortfolioBoard: vi.fn(() => 'board-removed'),
      retryPortfolioSave: vi.fn(() => 'save-retried'),
      clearPortfolioBulkSelection: vi.fn(() => 'selection-cleared'),
      openCreateSprintFromSelection: vi.fn(() => 'create-sprint'),
      openAssignSprintFromSelection: vi.fn(() => 'assign-sprint'),
      togglePortfolioTaskBulkSelection: vi.fn(() => 'selection-toggled'),
      onPortfolioTaskDragStart: vi.fn(() => 'drag-started'),
      onPortfolioTaskDragEnd: vi.fn(() => 'drag-ended'),
      onPortfolioColumnDragOver: vi.fn(() => 'drag-over'),
      onPortfolioColumnDragLeave: vi.fn(() => 'drag-left'),
      onPortfolioColumnDrop: vi.fn(() => 'dropped'),
      setPortfolioTimelineSelection: vi.fn(() => 'timeline-selected'),
      movePortfolioTimelineToLatest: vi.fn(() => 'timeline-latest'),
      setPortfolioTimelineExpanded: vi.fn(() => 'timeline-expanded'),
      restorePortfolioTimelineSelection: vi.fn(() => 'timeline-restored'),
      beginPortfolioTimelineSliderDrag: vi.fn(() => 'timeline-drag-started')
    };
    setLegacyHost(host);
    const draft = { kind: 'phases', itemId: 'p1', title: 'Build' };

    expect(closeTaskDetail()).toBe('closed-detail');
    expect(toggleTaskDetailChecklistItem(2, false)).toBe('toggled');
    expect(closeRoadmapEntity()).toBe('closed-roadmap');
    expect(saveRoadmapEntity(draft)).toBe('saved');
    expect(performUndo()).toBe('undone');
    const taskDraft = { title: 'Ship it' };
    expect(closeTaskEditor()).toBe('closed-editor');
    expect(saveTask(taskDraft)).toBe('saved-task');
    expect(setPortfolioFilter('priority', 'high')).toBe('filter-set');
    expect(setPortfolioSort('score')).toBe('sort-set');
    expect(setPortfolioViewMode('roadmap')).toBe('view-set');
    expect(resetPortfolioFilters()).toBe('filters-reset');
    expect(selectPortfolioBoard('p1')).toBe('board-selected');
    expect(removePortfolioBoard('p1')).toBe('board-removed');
    expect(retryPortfolioSave('p1')).toBe('save-retried');
    expect(clearPortfolioBulkSelection('p1')).toBe('selection-cleared');
    expect(openCreateSprintFromSelection('p1')).toBe('create-sprint');
    expect(openAssignSprintFromSelection('p1')).toBe('assign-sprint');
    expect(togglePortfolioTaskBulkSelection('p1', 1, true)).toBe('selection-toggled');
    const dragEvent = {};
    const dragContext = { boardId: 'p1', taskId: 1, status: 'backlog' };
    expect(onPortfolioTaskDragStart(dragEvent, dragContext)).toBe('drag-started');
    expect(onPortfolioTaskDragEnd(dragEvent)).toBe('drag-ended');
    expect(onPortfolioColumnDragOver(dragEvent, 'doing')).toBe('drag-over');
    expect(onPortfolioColumnDragLeave(dragEvent)).toBe('drag-left');
    expect(onPortfolioColumnDrop(dragEvent, 'doing')).toBe('dropped');
    expect(setPortfolioTimelineSelection('p1', 2)).toBe('timeline-selected');
    expect(movePortfolioTimelineToLatest('p1')).toBe('timeline-latest');
    expect(setPortfolioTimelineExpanded('p1', true)).toBe('timeline-expanded');
    expect(restorePortfolioTimelineSelection()).toBe('timeline-restored');
    expect(beginPortfolioTimelineSliderDrag('p1')).toBe('timeline-drag-started');

    expect(host.toggleTaskDetailChecklistItem).toHaveBeenCalledWith(2, false);
    expect(host.saveRoadmapEntity).toHaveBeenCalledWith(draft);
    expect(host.closeTaskDetail).toHaveBeenCalledTimes(1);
    expect(host.closeRoadmapEntity).toHaveBeenCalledTimes(1);
    expect(host.performUndo).toHaveBeenCalledTimes(1);
    expect(host.closeTaskEditor).toHaveBeenCalledTimes(1);
    expect(host.saveTask).toHaveBeenCalledWith(taskDraft);
    expect(host.setPortfolioFilter).toHaveBeenCalledWith('priority', 'high');
    expect(host.setPortfolioSort).toHaveBeenCalledWith('score');
    expect(host.setPortfolioViewMode).toHaveBeenCalledWith('roadmap');
    expect(host.resetPortfolioFilters).toHaveBeenCalledTimes(1);
    expect(host.selectPortfolioBoard).toHaveBeenCalledWith('p1');
    expect(host.removePortfolioBoard).toHaveBeenCalledWith('p1');
    expect(host.retryPortfolioSave).toHaveBeenCalledWith('p1');
    expect(host.clearPortfolioBulkSelection).toHaveBeenCalledWith('p1');
    expect(host.openCreateSprintFromSelection).toHaveBeenCalledWith('p1');
    expect(host.openAssignSprintFromSelection).toHaveBeenCalledWith('p1');
    expect(host.togglePortfolioTaskBulkSelection).toHaveBeenCalledWith('p1', 1, true);
    expect(host.onPortfolioTaskDragStart).toHaveBeenCalledWith(dragEvent, dragContext);
    expect(host.onPortfolioTaskDragEnd).toHaveBeenCalledWith(dragEvent);
    expect(host.onPortfolioColumnDragOver).toHaveBeenCalledWith(dragEvent, 'doing');
    expect(host.onPortfolioColumnDragLeave).toHaveBeenCalledWith(dragEvent);
    expect(host.onPortfolioColumnDrop).toHaveBeenCalledWith(dragEvent, 'doing');
    expect(host.setPortfolioTimelineSelection).toHaveBeenCalledWith('p1', 2);
    expect(host.movePortfolioTimelineToLatest).toHaveBeenCalledWith('p1');
    expect(host.setPortfolioTimelineExpanded).toHaveBeenCalledWith('p1', true);
    expect(host.restorePortfolioTimelineSelection).toHaveBeenCalledTimes(1);
    expect(host.beginPortfolioTimelineSliderDrag).toHaveBeenCalledWith('p1');
  });
});
