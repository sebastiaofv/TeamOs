import { useState, type ClipboardEvent } from 'react';
import type { Attachment } from '@/domain/types';
import { COMMENT_MAX_LENGTH, getTaskComments, isSafeCommentImage } from '@/domain/comments';
import { safeWebUrl } from '@/domain/links';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { mergePickedAttachments } from '@/domain/taskDraft';
import { readFileAsDataUrl } from '@/infrastructure/browser/fileReader';
import { useI18n } from '@/shared/i18n';

function CommentText({ text }: { text: string }) {
    return <p className="comment-body">{text.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => {
        const url = /^https?:/.test(part) ? safeWebUrl(part) : null;
        return url ? <a key={index} href={url} target="_blank" rel="noopener noreferrer">{part}</a> : part;
    })}</p>;
}

export function TaskComments({ readOnly }: { readOnly: boolean }) {
    const { t, language } = useI18n();
    const actions = usePortfolioActions();
    const context = useAppStore((s) => s.portfolioDetailContext);
    const boards = useAppStore((s) => s.portfolioBoards);
    const portfolioTimelineSelection = useAppStore((s) => s.portfolioTimelineSelection);
    const selectedPortfolioBoardId = useAppStore((s) => s.selectedPortfolioBoardId);
    const preview = getSelectedPortfolioTimelineView({ portfolioBoards: boards, portfolioTimelineSelection, selectedPortfolioBoardId });
    const [body, setBody] = useState('');
    const [images, setImages] = useState<Attachment[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [limit, setLimit] = useState(50);
    const board = boards.find((board) => board.id === context?.boardId);
    if (!board || !context) return null;
    const data = preview?.isPreview && preview.boardRecord.id === board.id ? preview.projectedBoard || board.data : board.data;
    const comments = [...getTaskComments(data, context.taskId)].sort((a, b) => a.at.localeCompare(b.at));
    async function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
        const files = [...event.clipboardData.files];
        if (!files.length) return;
        event.preventDefault(); setBusy(true); setError('');
        try {
            if (files.some((file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) { setError(t('comments.imageFormats')); return; }
            const result = await mergePickedAttachments(images, files, { readFile: readFileAsDataUrl });
            setImages(result.attachments); setError(result.messages.map((m) => m.text).join(' · '));
        } finally { setBusy(false); }
    }
    return <section id="taskComments" aria-label={t('history.comments')}>
        <p className="muted">{t('comments.immutable')}</p>
        <ol className="workitem-comments">{comments.slice(0, limit).map((comment) => <li key={comment.id}>
            <div className="workitem-link-row"><strong>{comment.author?.name || t('assignment.unidentified')}</strong><span className="muted">{t('assignment.local')}</span><time dateTime={comment.at}>{new Date(comment.at).toLocaleString(language === 'pt' ? 'pt-PT' : 'en-GB')}</time></div>
            <CommentText text={comment.body} />
            <div className="comment-images">{comment.images.map((image) => isSafeCommentImage(image) && <a key={image.id} href={image.dataUrl} download={image.name}><img alt={image.name} src={image.dataUrl} loading="lazy" /></a>)}</div>
        </li>)}</ol>
        {!comments.length && <p>{t('comments.empty')}</p>}
        {comments.length > limit && <button className="btn" type="button" onClick={() => setLimit(limit + 50)}>{t('history.more')}</button>}
        {!readOnly && <form onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { if (await actions.addWorkitemComment(board.id, context.taskId, body, images)) { setBody(''); setImages([]); } } finally { setBusy(false); } }}>
            <label htmlFor="commentBody">{t('comments.write')}</label><textarea id="commentBody" value={body} maxLength={COMMENT_MAX_LENGTH} onPaste={(event) => void paste(event)} onChange={(e) => setBody(e.target.value)} disabled={busy} placeholder={t('comments.paste')} />
            <div className="comment-images">{images.map((image) => <div key={image.id}><img src={image.dataUrl} alt={image.name} /><button className="btn-text" type="button" disabled={busy} onClick={() => setImages(images.filter((i) => i.id !== image.id))}>{t('common.remove')}</button></div>)}</div>
            {error && <p role="alert">{error}</p>}<button className="btn btn-primary" type="submit" disabled={busy || !body.trim() && !images.length}>{t('comments.post')}</button>
        </form>}
    </section>;
}
