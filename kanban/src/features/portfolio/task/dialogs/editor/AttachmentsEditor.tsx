import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { DraftMessage } from '@/features/portfolio/types';
import type { Attachment } from '@/domain/types';
import { ATTACHMENT_MAX_COUNT } from '@/domain/constants';
import { formatFileSize } from '@/domain/util';
import { buildAttachmentWarnings, mergePickedAttachments } from '@/domain/taskDraft';
import { readFileAsDataUrl } from '@/infrastructure/browser/fileReader';
import { useI18n } from '@/shared/i18n';
import { lastCommentAuthor, rememberCommentAuthor } from '../../conversationDrafts';

export function AttachmentsEditor({ boardId, value, onChange, otherAttachmentBytes, showList = true, disabled = false, onBusyChange, beforePick }: {
    boardId: string;
    value: Attachment[];
    onChange: (next: Attachment[]) => void | boolean | Promise<void | boolean>;
    showList?: boolean;
    disabled?: boolean;
    onBusyChange?: (busy: boolean) => void;
    beforePick?: () => Promise<boolean>;
    otherAttachmentBytes: number;
}) {
    const { t } = useI18n();
    const [pickerMessages, setPickerMessages] = useState<DraftMessage[]>([]);
    const [uploadedBy, setUploadedBy] = useState(() => lastCommentAuthor(boardId));
    const inputRef = useRef<HTMLInputElement>(null);
    const busyRef = useRef(false);
    const preparingRef = useRef(false);
    const [busy, setBusy] = useState(false);
    const mountedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    async function pickFiles() {
        if (disabled || busyRef.current || preparingRef.current) return;
        preparingRef.current = true;
        try {
            if (beforePick && !await beforePick()) return;
            if (mountedRef.current) inputRef.current?.click();
        } finally { preparingRef.current = false; }
    }

    const onFilesPicked = async (event: ChangeEvent<HTMLInputElement>) => {
        const input = event.target;
        const files = Array.from(input.files || []);
        input.value = '';
        if (files.length === 0 || disabled || busyRef.current) return;
        if (!uploadedBy.trim()) {
            setPickerMessages([{ type: 'error', text: t('attachments.authorRequired') }]);
            return;
        }
        rememberCommentAuthor(boardId, uploadedBy.trim());
        busyRef.current = true;
        setBusy(true);
        onBusyChange?.(true);
        try {
            const result = await mergePickedAttachments(value, files, { readFile: readFileAsDataUrl, uploadedBy });
            // The dialog may have closed while files were being read.
            if (!mountedRef.current) return;
            await onChange(result.attachments);
            if (mountedRef.current) setPickerMessages(result.messages);
        } finally {
            busyRef.current = false;
            if (mountedRef.current) { setBusy(false); onBusyChange?.(false); }
        }
    };

    const remove = (attachmentId: string) => {
        onChange(value.filter((item) => item.id !== attachmentId));
        setPickerMessages([]);
    };

    const totalBytes = value.reduce((sum, item) => sum + (Number(item.sizeBytes) || 0), 0);
    const summary = value.length === 0
        ? t('editor.noAttachments')
        : `${value.length} / ${ATTACHMENT_MAX_COUNT} • ${formatFileSize(totalBytes)}`;
    const messages = [...pickerMessages, ...buildAttachmentWarnings(value, otherAttachmentBytes)]
        .filter((message) => message && typeof message.text === 'string' && message.text.trim());

    return (
        <div className="attachment-editor" id="taskAttachmentsEditor" aria-label={t('task.attachments')} aria-busy={busy}>
            <div className="attachment-uploader form-group">
                <label htmlFor="taskAttachmentUploader">{t('attachments.uploadedBy')}</label>
                <input id="taskAttachmentUploader" disabled={disabled || busy} type="text" autoComplete="off" value={uploadedBy} onChange={(event) => setUploadedBy(event.target.value)} />
            </div>
            <div className="attachment-editor-toolbar">
                <button type="button" className="btn" id="taskAttachmentsAddBtn" disabled={disabled || busy} onClick={() => void pickFiles()}>{t('editor.addFiles')}</button>
                <span className="attachment-editor-summary" id="taskAttachmentsSummary">{summary}</span>
            </div>
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
                            ? <img className="attachment-editor-thumb" alt="" src={item.dataUrl} />
                            : <span className="attachment-editor-icon">{t('common.file')}</span>}
                        <div className="attachment-editor-meta">
                            <div className="attachment-editor-name">{item.name}</div>
                            <div className="attachment-editor-sub">
                                {`${formatFileSize(item.sizeBytes)}${item.mime ? ` • ${item.mime}` : ''}`}
                            </div>
                            <div className="attachment-editor-sub">{t('attachments.uploadedBy')}: {item.uploadedBy || t('attachments.unknownAuthor')}</div>
                        </div>
                        <div className="attachment-editor-actions">
                            <a className="attachment-editor-download" href={item.dataUrl} download={item.name || 'attachment'}>{t('common.download')}</a>
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
