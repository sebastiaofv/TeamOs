// Seams where React components hand control back to legacy behaviour that has
// not moved out of src/legacy/main.js yet. Legacy registers the
// real implementations at startup; the defaults are no-ops so this module can
// be used without a document. Components import these actions, never legacy.

const host = {
    closeTaskDetail: () => {},
    toggleTaskDetailChecklistItem: () => {},
    closeRoadmapEntity: () => {},
    saveRoadmapEntity: () => {},
    performUndo: () => {},
    closeTaskEditor: () => {},
    saveTask: () => {},
    setPortfolioFilter: () => {},
    setPortfolioSort: () => {},
    setPortfolioViewMode: () => {},
    resetPortfolioFilters: () => {},
    selectPortfolioBoard: () => {},
    removePortfolioBoard: () => {},
    retryPortfolioSave: () => {},
    clearPortfolioBulkSelection: () => {},
    openCreateSprintFromSelection: () => {},
    openAssignSprintFromSelection: () => {},
    togglePortfolioTaskBulkSelection: () => {},
    onPortfolioTaskDragStart: () => {},
    onPortfolioTaskDragEnd: () => {},
    onPortfolioColumnDragOver: () => {},
    onPortfolioColumnDragLeave: () => {},
    onPortfolioColumnDrop: () => {},
    setPortfolioTimelineSelection: () => {},
    movePortfolioTimelineToLatest: () => {},
    setPortfolioTimelineExpanded: () => {},
    restorePortfolioTimelineSelection: () => {},
    beginPortfolioTimelineSliderDrag: () => {}
};

export function setLegacyHost(impl = {}) {
    Object.assign(host, impl);
}

export const closeTaskDetail = () => host.closeTaskDetail();
export const toggleTaskDetailChecklistItem = (index, checked) => host.toggleTaskDetailChecklistItem(index, checked);
export const closeRoadmapEntity = () => host.closeRoadmapEntity();
export const saveRoadmapEntity = (draft) => host.saveRoadmapEntity(draft);
export const performUndo = () => host.performUndo();
export const closeTaskEditor = () => host.closeTaskEditor();
export const saveTask = (draft) => host.saveTask(draft);
export const setPortfolioFilter = (name, value) => host.setPortfolioFilter(name, value);
export const setPortfolioSort = value => host.setPortfolioSort(value);
export const setPortfolioViewMode = mode => host.setPortfolioViewMode(mode);
export const resetPortfolioFilters = () => host.resetPortfolioFilters();
export const selectPortfolioBoard = boardId => host.selectPortfolioBoard(boardId);
export const removePortfolioBoard = boardId => host.removePortfolioBoard(boardId);
export const retryPortfolioSave = boardId => host.retryPortfolioSave(boardId);
export const clearPortfolioBulkSelection = boardId => host.clearPortfolioBulkSelection(boardId);
export const openCreateSprintFromSelection = boardId => host.openCreateSprintFromSelection(boardId);
export const openAssignSprintFromSelection = boardId => host.openAssignSprintFromSelection(boardId);
export const togglePortfolioTaskBulkSelection = (boardId, taskId, checked) => host.togglePortfolioTaskBulkSelection(boardId, taskId, checked);
export const onPortfolioTaskDragStart = (event, context) => host.onPortfolioTaskDragStart(event, context);
export const onPortfolioTaskDragEnd = event => host.onPortfolioTaskDragEnd(event);
export const onPortfolioColumnDragOver = (event, targetStatus) => host.onPortfolioColumnDragOver(event, targetStatus);
export const onPortfolioColumnDragLeave = event => host.onPortfolioColumnDragLeave(event);
export const onPortfolioColumnDrop = (event, targetStatus) => host.onPortfolioColumnDrop(event, targetStatus);
export const setPortfolioTimelineSelection = (boardId, eventIndex) => host.setPortfolioTimelineSelection(boardId, eventIndex);
export const movePortfolioTimelineToLatest = boardId => host.movePortfolioTimelineToLatest(boardId);
export const setPortfolioTimelineExpanded = (boardId, expanded) => host.setPortfolioTimelineExpanded(boardId, expanded);
export const restorePortfolioTimelineSelection = () => host.restorePortfolioTimelineSelection();
export const beginPortfolioTimelineSliderDrag = boardId => host.beginPortfolioTimelineSliderDrag(boardId);
