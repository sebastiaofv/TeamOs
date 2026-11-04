import { useRef, useState } from 'react';
import { calculateBoardAttachmentBytes, getTaskAttachments } from '@/domain/attachments';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { showConfirm } from '@/app/overlays/appMessages';
import { AttachmentOpenLink } from './AttachmentOpenLink';
import { AttachmentsEditor } from './editor/AttachmentsEditor';
import type { TaskDetailViewModel } from '@/features/portfolio/types';
import { formatDateTime } from '@/domain/calendar';
import { useI18n } from '@/shared/i18n';

export function TaskAttachments({ vm }: { vm: TaskDetailViewModel }) {
    const { attachments } = vm;
    const { t, language } = useI18n();
    const { setPortfolioTaskAttachments, preparePortfolioTaskAttachmentWrite } = usePortfolioActions();
    const [busy, setBusy] = useState(false);
    const [picking, setPicking] = useState(false);
    const busyRef = useRef(false);
    const value = getTaskAttachments(vm.sourceBoardData, vm.taskId);
    async function remove(id: string, name: string) {
        if (vm.readOnly || picking || busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try {
            if (await showConfirm(t('attachments.removeQuestion', { name }), { title: t('task.attachments'), confirmLabel: t('common.remove'), danger: true })) {
                await setPortfolioTaskAttachments(vm.boardId, vm.taskId, value.filter((item) => item.id !== id), value);
            }
        } finally { busyRef.current = false; setBusy(false); }
    }
    return <div className="detail-attachments" id="detailAttachments">
        {!vm.readOnly && <AttachmentsEditor boardId={vm.boardId} value={value} showList={false} disabled={busy} onBusyChange={setPicking}
            beforePick={() => preparePortfolioTaskAttachmentWrite(vm.boardId, vm.taskId)}
            onChange={(next) => setPortfolioTaskAttachments(vm.boardId, vm.taskId, next, value)}
            otherAttachmentBytes={calculateBoardAttachmentBytes(vm.sourceBoardData, { excludeTaskId: vm.taskId })} />}
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
                        {item.isImage ? <img className="detail-attachment-thumb" alt="" src={item.dataUrl} /> : <span className="attachment-editor-icon">{t('common.file')}</span>}
                        <div className="detail-attachment-meta"><div className="detail-attachment-name">{item.name}</div><div className="detail-attachment-sub">{item.subLabel}</div></div>
                    </div></td>
                    <td>{item.uploadedBy || t('attachments.unknownAuthor')}</td>
                    <td><div className="attachment-table-actions"><div className="attachment-preview-actions"><AttachmentOpenLink className="detail-attachment-open attachment-open" dataUrl={item.dataUrl} previewMime={item.previewMime} /><a className="detail-attachment-download attachment-download" href={item.dataUrl} download={item.name || 'attachment'} aria-label={`${t('common.download')} ${item.name}`}>{t('common.download')}</a></div>{!vm.readOnly && <button type="button" className="attachment-remove-btn" disabled={busy || picking} aria-label={t('editor.removeAttachment', { name: item.name })} onClick={() => void remove(item.id, item.name)}>×</button>}</div></td>
                </tr>)}</tbody>
            </table>}
    </div>;
}
