import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Attachment, DraftMessage } from '../../../types';
import { ATTACHMENT_MAX_COUNT } from '../../../domain/constants';
import { formatFileSize } from '../../../domain/util';
import { buildAttachmentWarnings, mergePickedAttachments } from '../../../domain/taskDraft';
import { readFileAsDataUrl } from '../../../adapters/browser/fileReader';

export function AttachmentsEditor({ value, onChange, otherAttachmentBytes }: {
    value: Attachment[];
    onChange: (next: Attachment[]) => void;
    otherAttachmentBytes: number;
}) {
    const [pickerMessages, setPickerMessages] = useState<DraftMessage[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const mountedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const onFilesPicked = async (event: ChangeEvent<HTMLInputElement>) => {
        const input = event.target;
        const files = Array.from(input.files || []);
        input.value = '';
        if (files.length === 0) return;
        const result = await mergePickedAttachments(value, files, { readFile: readFileAsDataUrl });
        // The dialog may have closed while files were being read.
        if (!mountedRef.current) return;
        onChange(result.attachments);
        setPickerMessages(result.messages);
    };

    const remove = (attachmentId: string) => {
        onChange(value.filter((item) => item.id !== attachmentId));
        setPickerMessages([]);
    };

    const totalBytes = value.reduce((sum, item) => sum + (Number(item.sizeBytes) || 0), 0);
    const summary = value.length === 0
        ? 'No attachments'
        : `${value.length} / ${ATTACHMENT_MAX_COUNT} • ${formatFileSize(totalBytes)}`;
    const messages = [...pickerMessages, ...buildAttachmentWarnings(value, otherAttachmentBytes)]
        .filter((message) => message && typeof message.text === 'string' && message.text.trim());

    return (
        <div className="attachment-editor" id="taskAttachmentsEditor">
            <div className="attachment-editor-toolbar">
                <button type="button" className="btn" id="taskAttachmentsAddBtn" onClick={() => inputRef.current?.click()}>Add Files</button>
                <span className="attachment-editor-summary" id="taskAttachmentsSummary">{summary}</span>
            </div>
            <div className="attachment-editor-warnings" id="taskAttachmentsWarnings">
                {messages.map((message, index) => (
                    <div key={index} className={message.type === 'error' ? 'attachment-editor-error' : 'attachment-editor-warning'}>
                        {message.text}
                    </div>
                ))}
            </div>
            <div className="attachment-editor-list" id="taskAttachmentsList">
                {value.length === 0 ? (
                    <div className="attachment-editor-empty">No attachments yet.</div>
                ) : value.map((item) => (
                    <div className="attachment-editor-item" key={item.id}>
                        {item.kind === 'image'
                            ? <img className="attachment-editor-thumb" alt="" src={item.dataUrl} />
                            : <span className="attachment-editor-icon">FILE</span>}
                        <div className="attachment-editor-meta">
                            <div className="attachment-editor-name">{item.name}</div>
                            <div className="attachment-editor-sub">
                                {`${formatFileSize(item.sizeBytes)}${item.mime ? ` • ${item.mime}` : ''}`}
                            </div>
                        </div>
                        <div className="attachment-editor-actions">
                            <a className="attachment-editor-download" href={item.dataUrl} download={item.name || 'attachment'}>Download</a>
                            <button
                                type="button"
                                className="attachment-remove-btn"
                                aria-label={`Remove attachment ${item.name}`}
                                title="Remove"
                                data-attachment-id={item.id}
                                onClick={() => remove(item.id)}
                            >
                                ×
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <input type="file" id="taskAttachmentsInput" className="hidden" multiple ref={inputRef} onChange={onFilesPicked} />
        </div>
    );
}
