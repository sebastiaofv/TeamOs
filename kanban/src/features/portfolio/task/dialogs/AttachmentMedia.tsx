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
export function AttachmentImage({ src = '', mime = '', alt, ...props }: ImgHTMLAttributes<HTMLImageElement> & { mime?: string }) {
    const [url, setUrl] = useState(''); const [error, setError] = useState('');
    useEffect(() => {
        if (!parseAttachmentReference(src)) { setUrl(src); return; }
        let active = true; let created = '';
        setError(''); setUrl('');
        attachmentObjectUrl(src, mime).then((next) => {
            created = next; if (active) setUrl(next); else URL.revokeObjectURL(next);
        }).catch((reason: unknown) => { if (active) setError(formatErrorMessage(reason)); });
        return () => { active = false; if (created) URL.revokeObjectURL(created); };
    }, [src, mime]);
    return error ? <span role="alert">{error}</span> : url ? <img {...props} src={url} alt={alt} /> : <span role="status">…</span>;
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
