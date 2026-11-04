import { useEffect, useState } from 'react';
import { createAttachmentPreviewUrl } from '@/infrastructure/browser/attachmentPreview';
import { useI18n } from '@/shared/i18n';

export function AttachmentOpenLink({ dataUrl, previewMime, className }: {
    dataUrl: string;
    previewMime: string | null;
    className: string;
}) {
    const { t } = useI18n();
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        const nextUrl = previewMime ? createAttachmentPreviewUrl(dataUrl, previewMime) : null;
        setUrl(nextUrl);
        return () => { if (nextUrl) URL.revokeObjectURL(nextUrl); };
    }, [dataUrl, previewMime]);

    // Blob URLs allow top-level navigation, which browsers block for data URLs.
    return url ? <a className={className} href={url} target="_blank" rel="noopener noreferrer">{t('common.open')}</a> : null;
}
