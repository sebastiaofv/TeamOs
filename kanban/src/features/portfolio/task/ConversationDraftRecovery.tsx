import { useAppStore } from '@/features/portfolio/state/store';
import { conversationWorkitemKey } from '@/domain/comments';
import { downloadCommentRecovery } from '@/infrastructure/browser/commentRecovery';
import { useI18n } from '@/shared/i18n';
import { allConversationDrafts, discardConversationDraft, sessionDraftWorkitemKey, useConversationDraftRevision } from './conversationDrafts';

export function ConversationDraftRecovery() {
    const boards = useAppStore((state) => state.portfolioBoards);
    useConversationDraftRevision();
    const { t } = useI18n();
    const orphaned = allConversationDrafts().filter(([, draft]) => {
        if (!draft.text && !draft.images.length) return false;
        const board = boards.find((item) => item.id === draft.projectId);
        const task = board?.data.board.tasks.find((item) => item.id === draft.taskId);
        const identity = task && board && conversationWorkitemKey(board.data, task);
        return !task || !identity || sessionDraftWorkitemKey(identity, task) !== draft.workitemKey;
    });
    if (!orphaned.length) return null;
    return <aside className="conversation-recovery" aria-label={t('comments.recoverDrafts')}>
        {orphaned.map(([key, draft]) => <details key={key}><summary>{t('comments.orphanDraft', { title: draft.title })}</summary>
            <p>{t('comments.recoveryHelp')}</p><textarea aria-label={t('comments.recoveredText')} readOnly value={draft.text} rows={4} />
            <p>{draft.author} · {t('comments.localAuthor')}</p>
            {draft.images.map((image) => <a key={image.id} href={image.dataUrl} download={image.name}>{t('common.download')} · {image.name}</a>)}
            <div className="comment-actions"><button className="btn" onClick={() => downloadCommentRecovery(draft)}>{t('comments.downloadRecovery')}</button><button className="btn" onClick={() => discardConversationDraft(key)}>{t('comments.discard')}</button></div>
        </details>)}
    </aside>;
}
