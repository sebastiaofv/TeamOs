export function isFileDrag(ev: DragEvent): boolean {
    if (!ev.dataTransfer) return false;
    return Array.from(ev.dataTransfer.types || []).includes('Files');
}
