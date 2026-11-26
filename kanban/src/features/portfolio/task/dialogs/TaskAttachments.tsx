import { AttachmentImage, AttachmentDownload } from './AttachmentMedia';
import { useRef, useState } from 'react';
import { calculateBoardAttachmentBytes, getAttachmentPreviewMime, getTaskAttachments, normalizeAttachmentList } from '@/domain/attachments';
import type { Attachment } from '@/domain/types';
import { formatFileSize } from '@/domain/util';
import { portfolioActions } from '@/features/portfolio/commands/portfolioCommands';
import { showConfirm } from '@/app/overlays/appMessages';
import { AttachmentOpenLink } from './AttachmentOpenLink';
import { AttachmentsEditor, useAttachmentDropZone } from './editor/AttachmentsEditor';
import type { TaskDetailAttachment, TaskDetailViewModel } from '@/features/portfolio/types';
import { formatDateTime } from '@/domain/calendar';
import { useI18n } from '@/shared/i18n';

export function buildAttachmentDisplayItems(attachments: readonly Attachment[]): TaskDetailAttachment[] {
    return normalizeAttachmentList(attachments)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((item) => ({
            id: item.id,
            name: item.name,
            createdAt: item.createdAt,
            uploadedBy: item.uploadedBy,
            isImage: item.kind === 'image',
            dataUrl: item.dataUrl,
            mime: item.mime,
            previewMime: getAttachmentPreviewMime(item),
            subLabel: `${formatFileSize(item.sizeBytes)}${item.mime ? ` • ${item.mime}` : ''}`
        }));
}

export function AttachmentPanel({
    boardId,
    attachments,
    rawAttachments,
    readOnly,
    otherAttachmentBytes,
    beforePick,
    onChange,
    onRemove
}: {
    boardId: string;
    attachments: TaskDetailAttachment[];
    rawAttachments: Attachment[];
    readOnly: boolean;
    otherAttachmentBytes: number;
    beforePick: () => Promise<boolean>;
    onChange: (next: Attachment[], uploadedBy?: string) => void | boolean | Promise<void | boolean>;
    onRemove: (next: Attachment[]) => void | boolean | Promise<void | boolean>;
}) {
    const { t, language } = useI18n();
    const [busy, setBusy] = useState(false);
    const [picking, setPicking] = useState(false);
    const busyRef = useRef(false);
    const dropFilesRef = useRef<((files: File[]) => Promise<void>) | null>(null);
    const { dropActive, dropZoneProps } = useAttachmentDropZone({
        enabled: !readOnly,
        blocked: busy || picking,
        onDropFiles: (files) => { void dropFilesRef.current?.(files); }
    });

    async function remove(id: string, name: string) {
        if (readOnly || picking || busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try {
            if (await showConfirm(t('attachments.removeQuestion', { name }), { title: t('task.attachments'), confirmLabel: t('common.remove'), danger: true })) {
                await onRemove(rawAttachments.filter((item) => item.id !== id));
            }
        } finally { busyRef.current = false; setBusy(false); }
    }

    return <div className={`detail-attachments${dropActive ? ' is-drop-active' : ''}`} id="detailAttachments" {...dropZoneProps}>
        {!readOnly && <AttachmentsEditor
            boardId={boardId}
            value={rawAttachments}
            showList={false}
            disabled={busy}
            onBusyChange={setPicking}
            beforePick={beforePick}
            onChange={onChange}
            otherAttachmentBytes={otherAttachmentBytes}
            dropTarget={false}
            dropActive={dropActive}
            dropFilesRef={dropFilesRef}
        />}
        {attachments.length === 0 ? <p className="detail-attachments-empty">{t('editor.noAttachmentsYet')}</p>
            : <table className="attachment-table" aria-label={t('task.attachments')}>
                <thead><tr>
                    <th scope="col">{t('attachments.uploadedAt')}</th>
                    <th scope="col">{t('attachments.name')}</th>
                    <th scope="col">{t('attachments.uploadedBy')}</th>
                    <th scope="col">{t('attachments.actions')}</th>
                </tr></thead>
                <tbody>{attachments.map((item) => <tr className="detail-attachment-item" key={item.id}>
                    <td><time dateTime={item.createdAt}>{formatDateTime(item.createdAt, language === 'pt' ? 'pt-PT' : undefined)}</time></td>
                    <td><div className="attachment-table-file">
                        {item.isImage ? <AttachmentImage className="detail-attachment-thumb" alt="" src={item.dataUrl} mime={item.mime} /> : <span className="attachment-editor-icon">{t('common.file')}</span>}
                        <div className="detail-attachment-meta"><div className="detail-attachment-name">{item.name}</div><div className="detail-attachment-sub">{item.subLabel}</div></div>
                    </div></td>
                    <td>{item.uploadedBy || t('attachments.unknownAuthor')}</td>
                    <td><div className="attachment-table-actions"><div className="attachment-preview-actions"><AttachmentOpenLink className="detail-attachment-open attachment-open" dataUrl={item.dataUrl} previewMime={item.previewMime} /><AttachmentDownload className="detail-attachment-download attachment-download" href={item.dataUrl} download={item.name || 'attachment'} aria-label={`${t('common.download')} ${item.name}`}>{t('common.download')}</AttachmentDownload></div>{!readOnly && <button type="button" className="attachment-remove-btn" disabled={busy || picking} aria-label={t('editor.removeAttachment', { name: item.name })} onClick={() => void remove(item.id, item.name)}>×</button>}</div></td>
                </tr>)}</tbody>
            </table>}
    </div>;
}

export function TaskAttachments({ vm }: { vm: TaskDetailViewModel }) {
    const { setPortfolioTaskAttachments, preparePortfolioTaskAttachmentWrite } = portfolioActions;
    const value = getTaskAttachments(vm.sourceBoardData, vm.taskId);
    return <AttachmentPanel
        boardId={vm.boardId}
        attachments={vm.attachments}
        rawAttachments={value}
        readOnly={vm.readOnly}
        otherAttachmentBytes={calculateBoardAttachmentBytes(vm.sourceBoardData, { excludeTaskId: vm.taskId })}
        beforePick={() => preparePortfolioTaskAttachmentWrite(vm.boardId, vm.taskId)}
        onChange={(next) => setPortfolioTaskAttachments(vm.boardId, vm.taskId, next, value)}
        onRemove={(next) => setPortfolioTaskAttachments(vm.boardId, vm.taskId, next, value)}
    />;
}
