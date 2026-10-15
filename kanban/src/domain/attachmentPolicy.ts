import type { Attachment } from './types';
import { ATTACHMENT_HARD_MAX_BYTES, ATTACHMENT_MAX_COUNT } from './constants';
import { estimateAttachmentDataUrlSizeBytes } from './attachments';

export function isAcceptedPickedAttachment(name: string, mime: string): boolean {
    if (/\.(html?|svg|xhtml|xml|js|mjs|cjs|jsx|tsx|exe|dll|com|bat|cmd|ps1|sh|app|dmg|pkg|scr|jar|wasm)$/i.test(name)) return false;
    if (/(html|svg|javascript|ecmascript|x-executable|x-msdownload|x-sh|x-dosexec)/i.test(mime)) return false;
    return true;
}
export function isSafeAttachmentPreview(attachment: Pick<Attachment, 'dataUrl'>): boolean {
    return /^data:image\/(png|jpeg|webp|gif|bmp|avif|x-icon|vnd.microsoft.icon);base64,[A-Za-z0-9+/=\s]+$/i.test(attachment.dataUrl);
}
export function validateNewAttachments(before: readonly Attachment[], after: readonly Attachment[]): void {
    if (after.length > Math.max(ATTACHMENT_MAX_COUNT, before.length)) throw new Error(`Attachment limit: ${ATTACHMENT_MAX_COUNT}.`);
    for (const item of after) {
        if (before.some((existing) => existing.id === item.id && existing.dataUrl === item.dataUrl)) continue;
        if (!isAcceptedPickedAttachment(item.name, item.mime) || !item.dataUrl.startsWith('data:') || !isAcceptedPickedAttachment(item.name, item.dataUrl.slice(5, item.dataUrl.indexOf(',')))) throw new Error('Executable content, HTML and SVG attachments are not accepted.');
        if (Math.max(item.sizeBytes, estimateAttachmentDataUrlSizeBytes(item.dataUrl)) > ATTACHMENT_HARD_MAX_BYTES) throw new Error('Attachment exceeds the 10 MB limit.');
    }
}
