// Structural input so both native and React drag events are accepted.
export function isFileDrag(ev: { dataTransfer?: { types?: readonly string[] } | null }): boolean {
    if (!ev.dataTransfer) return false;
    return Array.from(ev.dataTransfer.types || []).includes('Files');
}
