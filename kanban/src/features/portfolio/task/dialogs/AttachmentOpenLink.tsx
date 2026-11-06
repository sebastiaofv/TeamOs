import { parseAttachmentReference } from '@/domain/attachmentReferences';
import { attachmentObjectUrl } from './AttachmentMedia';
import { formatErrorMessage } from '@/domain/util';
import { useEffect, useState } from 'react';
import { createAttachmentPreviewUrl } from '@/infrastructure/browser/attachmentPreview';
import { useI18n } from '@/shared/i18n';

export function AttachmentOpenLink({ dataUrl, previewMime, className }: {
    dataUrl: string;
    previewMime: string | null;
    className: string;
}) {
    const { t } = useI18n();
    const [error, setError] = useState('');
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        const nextUrl = previewMime ? createAttachmentPreviewUrl(dataUrl, previewMime) : null;
        setUrl(nextUrl);
        return () => { if (nextUrl) URL.revokeObjectURL(nextUrl); };
    }, [dataUrl, previewMime]);

    if (previewMime && parseAttachmentReference(dataUrl)) return <><a className={className} href="#" target="_blank" rel="noopener noreferrer" onClick={async (event) => {
        event.preventDefault(); setError('');
        const popup = window.open('about:blank', '_blank');
        if (popup) popup.opener = null;
        try {
            const next = await attachmentObjectUrl(dataUrl, previewMime);
            if (popup) popup.location.href = next;
            else { const link = document.createElement('a'); link.href = next; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click(); }
            setTimeout(() => URL.revokeObjectURL(next), 60000);
        } catch (reason) { popup?.close(); setError(formatErrorMessage(reason)); }
    }}>{t('common.open')}</a>{error && <span role="alert">{error}</span>}</>;
    // Blob URLs allow top-level navigation, which browsers block for data URLs.
    return url ? <a className={className} href={url} target="_blank" rel="noopener noreferrer">{t('common.open')}</a> : null;
}
