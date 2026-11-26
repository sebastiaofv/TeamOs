import { AttachmentImage, AttachmentDownload } from '../AttachmentMedia';
import { projectActor } from '@/features/portfolio/projects/projectIdentity';
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent, type RefObject } from 'react';
import type { DraftMessage } from '@/features/portfolio/types';
import type { Attachment } from '@/domain/types';
import { ATTACHMENT_MAX_COUNT } from '@/domain/constants';
import { formatFileSize } from '@/domain/util';
import { buildAttachmentWarnings, mergePickedAttachments } from '@/domain/taskDraft';
import { readFileAsDataUrl } from '@/infrastructure/browser/fileReader';
import { ATTACHMENT_DROP_ZONE_ATTR, isFileDrag } from '@/infrastructure/browser/fileDrop';
import { getAttachmentPreviewMime } from '@/domain/attachments';
import { AttachmentOpenLink } from '../AttachmentOpenLink';
import { useI18n } from '@/shared/i18n';
import { lastCommentAuthor, rememberCommentAuthor } from '../../conversationDrafts';

export function useAttachmentDropZone({ enabled, blocked, onDropFiles }: {
    enabled: boolean;
    blocked: boolean;
    onDropFiles: (files: File[]) => void;
}) {
    const [dropActive, setDropActive] = useState(false);
    const depthRef = useRef(0);

    useEffect(() => {
        if (!enabled || blocked) {
            depthRef.current = 0;
            setDropActive(false);
        }
    }, [enabled, blocked]);

    useEffect(() => {
        if (!enabled) return;
        const clear = () => {
            depthRef.current = 0;
            setDropActive(false);
        };
        window.addEventListener('dragend', clear);
        return () => window.removeEventListener('dragend', clear);
    }, [enabled]);

    if (!enabled) return { dropActive: false, dropZoneProps: {} };

    return {
        dropActive: !blocked && dropActive,
        dropZoneProps: {
            [ATTACHMENT_DROP_ZONE_ATTR]: 'true',
            onDragEnter: (event: ReactDragEvent<HTMLElement>) => {
                if (!isFileDrag(event)) return;
                event.preventDefault();
                depthRef.current += 1;
                if (!blocked) setDropActive(true);
            },
            onDragOver: (event: ReactDragEvent<HTMLElement>) => {
                if (!isFileDrag(event)) return;
                event.preventDefault();
                if (event.dataTransfer) event.dataTransfer.dropEffect = blocked ? 'none' : 'copy';
                if (!blocked) setDropActive(true);
            },
            onDragLeave: (event: ReactDragEvent<HTMLElement>) => {
                if (!isFileDrag(event)) return;
                depthRef.current = Math.max(0, depthRef.current - 1);
                if (depthRef.current === 0) setDropActive(false);
            },
            onDrop: (event: ReactDragEvent<HTMLElement>) => {
                if (!isFileDrag(event)) return;
                event.preventDefault();
                depthRef.current = 0;
                setDropActive(false);
                if (blocked) return;
                const files = Array.from(event.dataTransfer?.files || []);
                if (files.length > 0) onDropFiles(files);
            }
        }
    };
}

export function AttachmentsEditor({
    boardId,
    value,
    onChange,
    otherAttachmentBytes,
    showList = true,
    disabled = false,
    onBusyChange,
    beforePick,
    dropTarget = true,
    dropActive: externalDropActive = false,
    dropFilesRef
}: {
    boardId: string;
    value: Attachment[];
    onChange: (next: Attachment[], uploadedBy?: string) => void | boolean | Promise<void | boolean>;
    showList?: boolean;
    disabled?: boolean;
    onBusyChange?: (busy: boolean) => void;
    beforePick?: () => Promise<boolean>;
    otherAttachmentBytes: number;
    dropTarget?: boolean;
    dropActive?: boolean;
    dropFilesRef?: RefObject<((files: File[]) => Promise<void>) | null>;
}) {
    const { t } = useI18n();
    const [pickerMessages, setPickerMessages] = useState<DraftMessage[]>([]);
    const [uploaderDraft, setUploadedBy] = useState(() => lastCommentAuthor(boardId));
    const inputRef = useRef<HTMLInputElement>(null);
    const busyRef = useRef(false);
    const preparingRef = useRef(false);
    const [busy, setBusy] = useState(false);
    const mountedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const actor = projectActor(boardId);
    const uploadedBy = actor?.name || uploaderDraft;

    async function pickFiles() {
        if (disabled || busyRef.current || preparingRef.current) return;
        preparingRef.current = true;
        try {
            if (beforePick && !await beforePick()) return;
            if (mountedRef.current) inputRef.current?.click();
        } finally { preparingRef.current = false; }
    }

    const commitFiles = async (files: File[], { prepare }: { prepare: boolean }) => {
        if (files.length === 0 || disabled || busyRef.current || preparingRef.current) return;
        const uploader = uploadedBy.trim();
        if (!uploader) {
            setPickerMessages([{ type: 'error', text: t('attachments.authorRequired') }]);
            return;
        }
        if (prepare && beforePick) {
            preparingRef.current = true;
            busyRef.current = true;
            setBusy(true);
            onBusyChange?.(true);
            let permitted = false;
            try {
                permitted = await beforePick();
            } finally {
                preparingRef.current = false;
                if (!permitted) {
                    busyRef.current = false;
                    if (mountedRef.current) { setBusy(false); onBusyChange?.(false); }
                }
            }
            if (!permitted || !mountedRef.current) return;
        } else {
            busyRef.current = true;
            setBusy(true);
            onBusyChange?.(true);
        }
        rememberCommentAuthor(boardId, uploader);
        try {
            const result = await mergePickedAttachments(value, files, { readFile: readFileAsDataUrl, uploadedBy: uploader });
            // The dialog may have closed while files were being read.
            if (!mountedRef.current) return;
            await onChange(result.attachments, uploader);
            if (mountedRef.current) setPickerMessages(result.messages);
        } finally {
            busyRef.current = false;
            if (mountedRef.current) { setBusy(false); onBusyChange?.(false); }
        }
    };

    useLayoutEffect(() => {
        if (!dropFilesRef) return;
        dropFilesRef.current = (files: File[]) => commitFiles(files, { prepare: true });
        return () => { dropFilesRef.current = null; };
    });

    const onFilesPicked = async (event: ChangeEvent<HTMLInputElement>) => {
        const input = event.target;
        const files = Array.from(input.files || []);
        input.value = '';
        await commitFiles(files, { prepare: false });
    };

    const { dropActive: ownDropActive, dropZoneProps } = useAttachmentDropZone({
        enabled: dropTarget,
        blocked: disabled || busy,
        onDropFiles: (files) => { void commitFiles(files, { prepare: true }); }
    });
    const isDropActive = !disabled && !busy && (dropTarget ? ownDropActive : externalDropActive);

    const remove = (attachmentId: string) => {
        onChange(value.filter((item) => item.id !== attachmentId), uploadedBy.trim() || undefined);
        setPickerMessages([]);
    };

    const totalBytes = value.reduce((sum, item) => sum + (Number(item.sizeBytes) || 0), 0);
    const summary = value.length === 0
        ? t('editor.noAttachments')
        : `${value.length} / ${ATTACHMENT_MAX_COUNT} • ${formatFileSize(totalBytes)}`;
    const messages = [...pickerMessages, ...buildAttachmentWarnings(value, otherAttachmentBytes)]
        .filter((message) => message && typeof message.text === 'string' && message.text.trim());

    return (
        <div
            className={`attachment-editor${isDropActive ? ' is-drop-active' : ''}`}
            id="taskAttachmentsEditor"
            aria-label={t('task.attachments')}
            aria-describedby="taskAttachmentsDropHint"
            aria-busy={busy}
            {...dropZoneProps}
        >
            <div className="attachment-uploader form-group">
                <label htmlFor="taskAttachmentUploader">{t('attachments.uploadedBy')}</label>
                <input id="taskAttachmentUploader" readOnly={Boolean(actor)} disabled={disabled || busy} type="text" autoComplete="off" value={uploadedBy} onChange={(event) => setUploadedBy(event.target.value)} />
            </div>
            <div className="attachment-editor-toolbar">
                <button type="button" className="btn" id="taskAttachmentsAddBtn" disabled={disabled || busy} onClick={() => void pickFiles()}>{t('editor.addFiles')}</button>
                <span className="attachment-editor-summary" id="taskAttachmentsSummary">{summary}</span>
            </div>
            <p className="attachment-editor-drop-hint" id="taskAttachmentsDropHint">{t('attachments.dropHint')}</p>
            <div className="attachment-editor-warnings" id="taskAttachmentsWarnings" role={messages.some((message) => message.type === 'error') ? 'alert' : 'status'} aria-live="polite" aria-atomic="true">
                {messages.map((message, index) => (
                    <div key={index} className={message.type === 'error' ? 'attachment-editor-error' : 'attachment-editor-warning'}>
                        {message.text}
                    </div>
                ))}
            </div>
            {showList && <div className="attachment-editor-list" id="taskAttachmentsList">
                {value.length === 0 ? (
                    <div className="attachment-editor-empty">{t('editor.noAttachmentsYet')}</div>
                ) : value.map((item) => (
                    <div className="attachment-editor-item" key={item.id}>
                        {item.kind === 'image'
                            ? <AttachmentImage className="attachment-editor-thumb" alt="" src={item.dataUrl} mime={item.mime} />
                            : <span className="attachment-editor-icon">{t('common.file')}</span>}
                        <div className="attachment-editor-meta">
                            <div className="attachment-editor-name">{item.name}</div>
                            <div className="attachment-editor-sub">
                                {`${formatFileSize(item.sizeBytes)}${item.mime ? ` • ${item.mime}` : ''}`}
                            </div>
                            <div className="attachment-editor-sub">{t('attachments.uploadedBy')}: {item.uploadedBy || t('attachments.unknownAuthor')}</div>
                        </div>
                        <div className="attachment-editor-actions">
                            <div className="attachment-preview-actions">
                                <AttachmentOpenLink className="attachment-editor-open attachment-open" dataUrl={item.dataUrl} previewMime={getAttachmentPreviewMime(item)} />
                                <AttachmentDownload className="attachment-editor-download attachment-download" href={item.dataUrl} download={item.name || 'attachment'}>{t('common.download')}</AttachmentDownload>
                            </div>
                            <button
                                type="button"
                                className="attachment-remove-btn"
                                disabled={disabled || busy}
                                aria-label={t('editor.removeAttachment', { name: item.name })}
                                title={t('common.remove')}
                                data-attachment-id={item.id}
                                onClick={() => remove(item.id)}
                            >
                                ×
                            </button>
                        </div>
                    </div>
                ))}
            </div>}
            <input type="file" id="taskAttachmentsInput" className="hidden" multiple disabled={disabled || busy} ref={inputRef} onChange={onFilesPicked} />
        </div>
    );
}
