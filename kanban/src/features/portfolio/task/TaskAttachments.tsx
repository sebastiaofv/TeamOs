import type { TaskDetailViewModel } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { calculateBoardAttachmentBytes } from '@/domain/attachments';
import { AttachmentsEditor } from './dialogs/editor/AttachmentsEditor';
import { useI18n } from '@/shared/i18n';

export function TaskAttachments({ vm }: { vm: TaskDetailViewModel }) {
    const { t } = useI18n();
    const context = useAppStore((s) => s.portfolioDetailContext);
    const board = useAppStore((s) => s.portfolioBoards.find((b) => b.id === context?.boardId));
    const { replaceWorkitemAttachments } = usePortfolioActions();
    if (!board || !context) return null;
    return <section id="taskAttachmentManagement"><h3 id="taskAttachmentsLabel">{t('task.attachments')}</h3><p className="muted">{t('attachments.policy')}</p>
        {!vm.readOnly && <AttachmentsEditor value={vm.task?.attachments || []} otherAttachmentBytes={calculateBoardAttachmentBytes(board.data, { excludeTaskId: context.taskId })} onChange={(attachments) => replaceWorkitemAttachments(board.id, context.taskId, attachments)} />}
        {vm.readOnly && <div className="detail-attachments">{vm.attachments.map((item) => <div className="detail-attachment-item" key={item.id}>{item.isImage && <img className="detail-attachment-thumb" src={item.dataUrl} alt={item.name} loading="lazy" />}<span>{item.name}</span><a href={item.dataUrl} download={item.name}>{t('common.download')}</a></div>)}</div>}
    </section>;
}
