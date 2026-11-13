import { useEffect, useState, type ImgHTMLAttributes, type AnchorHTMLAttributes } from 'react';
import { parseAttachmentReference } from '@/domain/attachmentReferences';
import { resolveAttachmentBlob } from '@/infrastructure/persistence/projectDirectory';
import { formatErrorMessage } from '@/domain/util';
import { imageMimeFromBytes } from '@/domain/commentImages';

export async function attachmentObjectUrl(source: string, mime = ''): Promise<string> {
    const blob = await resolveAttachmentBlob(source);
    if (['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
        if (imageMimeFromBytes(new Uint8Array(await blob.arrayBuffer())) !== mime) throw new Error('Invalid attachment image.');
        if (typeof createImageBitmap === 'function') {
            const image = await createImageBitmap(blob); image.close();
        }
    }
    return URL.createObjectURL(new Blob([blob], { type: mime || blob.type || 'application/octet-stream' }));
}
export type AttachmentImageView = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'error'; message: string };
/** The settled result of resolving one stored attachment, tagged with the source it belongs to. */
export type AttachmentImageLoad = { source: string; view: Exclude<AttachmentImageView, { status: 'loading' }> } | null;

export const attachmentImageSource = (src: string, mime: string): string => parseAttachmentReference(src) ? `${mime}\n${src}` : '';

/** A plain URL is shown as is; a stored attachment is loading until a result for this exact source arrives. */
export function attachmentImageView(src: string, mime: string, load: AttachmentImageLoad): AttachmentImageView {
    const source = attachmentImageSource(src, mime);
    if (!source) return { status: 'ready', url: src };
    return load?.source === source ? load.view : { status: 'loading' };
}

export function AttachmentImage({ src = '', mime = '', alt, ...props }: ImgHTMLAttributes<HTMLImageElement> & { mime?: string }) {
    const [load, setLoad] = useState<AttachmentImageLoad>(null);
    const source = attachmentImageSource(src, mime);
    useEffect(() => {
        if (!source) return;
        let active = true; let created = '';
        attachmentObjectUrl(src, mime).then((next) => {
            created = next;
            if (active) setLoad({ source, view: { status: 'ready', url: next } }); else URL.revokeObjectURL(next);
        }).catch((reason: unknown) => { if (active) setLoad({ source, view: { status: 'error', message: formatErrorMessage(reason) } }); });
        return () => { active = false; if (created) URL.revokeObjectURL(created); };
    }, [source, src, mime]);
    const view = attachmentImageView(src, mime, load);
    if (view.status === 'error') return <span role="alert">{view.message}</span>;
    if (view.status === 'loading') return <span role="status">…</span>;
    return <img {...props} src={view.url} alt={alt} />;
}
export function AttachmentDownload({ href = '', download, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
    const [error, setError] = useState('');
    return <><a {...props} href={parseAttachmentReference(href) ? '#' : href} download={download} onClick={async (event) => {
        if (!parseAttachmentReference(href)) return;
        event.preventDefault(); setError('');
        try {
            const url = await attachmentObjectUrl(href);
            const link = document.createElement('a'); link.href = url; link.download = typeof download === 'string' ? download : 'attachment'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (reason) { setError(formatErrorMessage(reason)); }
    }}>{children}</a>{error && <span role="alert">{error}</span>}</>;
}
