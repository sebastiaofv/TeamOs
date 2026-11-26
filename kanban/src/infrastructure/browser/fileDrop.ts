export const ATTACHMENT_DROP_ZONE_ATTR = 'data-attachment-drop-zone';

// Structural input so both native and React drag events are accepted.
export function isFileDrag(ev: { dataTransfer?: { types?: readonly string[] } | null }): boolean {
    if (!ev.dataTransfer) return false;
    return Array.from(ev.dataTransfer.types || []).includes('Files');
}

export function isAttachmentDropTarget(target: EventTarget | null): boolean {
    return typeof Element !== 'undefined'
        && target instanceof Element
        && Boolean(target.closest(`[${ATTACHMENT_DROP_ZONE_ATTR}="true"]`));
}
