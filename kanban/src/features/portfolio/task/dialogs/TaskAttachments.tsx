import type { TaskDetailAttachment } from '@/features/portfolio/types';
import { formatDateTime } from '@/domain/calendar';
import { useI18n } from '@/shared/i18n';

export function TaskAttachments({ attachments }: { attachments: TaskDetailAttachment[] }) {
    const { t, language } = useI18n();
    return <div className="detail-attachments" id="detailAttachments">
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
                    <td><a className="detail-attachment-download" href={item.dataUrl} download={item.name || 'attachment'} aria-label={`${t('common.download')} ${item.name}`}>{t('common.download')}</a></td>
                </tr>)}</tbody>
            </table>}
    </div>;
}
