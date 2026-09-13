// Seams where React components hand control back to legacy behaviour that has
// not moved out of src/legacy/main.js yet (Phase 2.1a). Legacy registers the
// real implementations at startup; the defaults are no-ops so this module can
// be used without a document. Components import these actions, never legacy.

const host = {
    closeTaskDetail: () => {},
    toggleTaskDetailChecklistItem: () => {},
    closeRoadmapEntity: () => {},
    saveRoadmapEntity: () => {},
    performUndo: () => {}
};

export function setLegacyHost(impl = {}) {
    Object.assign(host, impl);
}

export const closeTaskDetail = () => host.closeTaskDetail();
export const toggleTaskDetailChecklistItem = (index, checked) => host.toggleTaskDetailChecklistItem(index, checked);
export const closeRoadmapEntity = () => host.closeRoadmapEntity();
export const saveRoadmapEntity = (draft) => host.saveRoadmapEntity(draft);
export const performUndo = () => host.performUndo();
