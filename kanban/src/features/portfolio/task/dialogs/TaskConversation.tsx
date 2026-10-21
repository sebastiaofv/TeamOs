import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Attachment, Task } from '@/domain/types';
import { conversationWorkitemKey, validateCommentInput, visibleComments } from '@/domain/comments';
import { CommentError } from '@/domain/commentImages';
import { calculateBoardAttachmentBytes } from '@/domain/attachments';
import { ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES } from '@/domain/constants';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { readCommentImage } from '@/infrastructure/browser/commentImages';
import { useI18n } from '@/shared/i18n';
import { discardConversationDraft, draftKey, getConversationDraft, lastCommentAuthor, rememberCommentAuthor, sessionDraftWorkitemKey, updateConversationDraft, useConversationDraftRevision } from '../conversationDrafts';

export type ConversationContext = { boardId: string; task: Task; readOnly: boolean; eventIndex?: number };

function PlainCommentText({ text }: { text: string }) {
    const pieces = text.split(/(https?:\/\/[^\s<>]+)/gi);
    return <p className="comment-text">{pieces.map((part, index) => {
        let safe = false;
        try { const url = new URL(part); safe = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { /* plain text */ }
        return safe ? <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a> : part;
    })}</p>;
}

export function TaskConversation({ context }: { context: ConversationContext }) {
    const { t, language } = useI18n();
    const board = useAppStore((state) => state.portfolioBoards.find((item) => item.id === context.boardId));
    const { publishPortfolioComment } = usePortfolioActions();
    useConversationDraftRevision();
    const [visible, setVisible] = useState(50);
    const [busy, setBusy] = useState(false);
    const [editingAuthor, setEditingAuthor] = useState(false);
    const authorInput = useRef<HTMLInputElement>(null);
    const busyRef = useRef(false);
    const [zoom, setZoom] = useState<Attachment | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const list = useRef<HTMLOListElement>(null);
    const anchor = useRef<{ id: string; top: number } | null>(null);
    const key = board && conversationWorkitemKey(board.data, context.task, context.eventIndex);
    const identity = key ? sessionDraftWorkitemKey(key, context.task) : '';
    const sessionKey = draftKey(context.boardId, identity);
    const stored = getConversationDraft(sessionKey);
    const draftContext = { projectId: context.boardId, taskId: context.task.id, workitemKey: identity, title: context.task.title };
    const draft = stored || { ...draftContext, id: '', text: '', author: lastCommentAuthor(context.boardId), images: [] };
    const comments = board ? visibleComments(board.data, context.task, context.eventIndex) : [];
    const shown = comments.slice(-visible).reverse();
    const people = [...new Set(board?.data.board.tasks.flatMap((task) => task.assignees) || [])];
    const update = (changes: Parameters<typeof updateConversationDraft>[2]) => updateConversationDraft(sessionKey, draftContext, changes);

    useEffect(() => {
        if (!zoom) return;
        // Native capture precedes both Radix and the app's document shortcuts.
        const isolateViewer = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); setZoom(null); }
            if (event.key !== 'Tab') event.stopPropagation();
        };
        window.addEventListener('keydown', isolateViewer, true);
        return () => window.removeEventListener('keydown', isolateViewer, true);
    }, [zoom]);

    useLayoutEffect(() => {
        if (!anchor.current) return;
        const element = Array.from(list.current?.children || []).find((item) => item.getAttribute('data-comment-id') === anchor.current!.id);
        const body = list.current?.closest('.modal-body');
        if (element && body) body.scrollTop += element.getBoundingClientRect().top - anchor.current.top;
        anchor.current = null;
    }, [visible]);

    async function addImages(files: File[]) {
        if (!files.length || draft.reading || busyRef.current) return;
        try {
            if (draft.images.length + files.length > 10) throw new CommentError('count');
            update({ reading: true, error: undefined });
            const added: Attachment[] = [];
            for (const file of files) added.push(await readCommentImage(file));
            const previous = getConversationDraft(sessionKey)?.images || [];
            if (previous.length + added.length > 10) throw new CommentError('count');
            update({ images: [...previous, ...added] });
        } catch (error) { update({ error: error instanceof CommentError ? error.code : 'format' }); }
        finally { update({ reading: false }); }
    }

    async function publish() {
        if (busyRef.current || draft.reading || context.readOnly || !key) return;
        if (!stored) { update({ error: 'body' }); return; }
        const input = { id: stored.id, author: draft.author, text: draft.text, images: draft.images };
        try { validateCommentInput(input); }
        catch (error) { update({ error: error instanceof CommentError ? error.code : 'record' }); return; }
        busyRef.current = true; setBusy(true);
        try {
            await publishPortfolioComment(context.boardId, context.task.id, input, () => {
                rememberCommentAuthor(context.boardId, input.author.trim()); discardConversationDraft(sessionKey);
            });
        } finally { busyRef.current = false; setBusy(false); }
    }

    const imageCard = (image: Attachment) => <div className="comment-image" key={image.id}>
        <button type="button" onClick={() => setZoom(image)} aria-label={t('comments.enlarge', { name: image.name })}><img src={image.dataUrl} alt={image.name} loading="lazy" /></button>
    </div>;
    const totalBytes = calculateBoardAttachmentBytes(board?.data) + draft.images.reduce((sum, image) => sum + image.sizeBytes, 0);
    return <section className="task-conversation" aria-labelledby="taskConversationHeading">
        {!key && <p role="note">{t('comments.error.identity')}</p>}
        {!context.readOnly && key && <div className="comment-composer" onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.length) { event.preventDefault(); void addImages(files); }
        }} onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void publish(); }
        }}>
            <div className="comment-composer-heading">
                <h3>{t('comments.addComment')}</h3>
                <div className="comment-posting-as">
                    <span>{t('comments.postingAs')} <strong>{draft.author || t('comments.author')}</strong></span><span aria-hidden="true">·</span>
                    <button type="button" className="comment-change-author" aria-expanded={editingAuthor} aria-controls="commentAuthorEditor" onClick={() => {
                        setEditingAuthor(true);
                        requestAnimationFrame(() => authorInput.current?.focus());
                    }}>{t('comments.changeAuthor')}</button>
                </div>
            </div>
            {editingAuthor && <div id="commentAuthorEditor" className="comment-author-editor">
                <label htmlFor="commentAuthor">{t('comments.author')}</label>
                <input ref={authorInput} id="commentAuthor" list="commentAuthorSuggestions" autoComplete="off" value={draft.author} onChange={(e) => { rememberCommentAuthor(context.boardId, e.target.value); update({ author: e.target.value, error: undefined }); }} onBlur={() => { if (draft.author.trim()) setEditingAuthor(false); }} onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); event.stopPropagation(); if (draft.author.trim()) { setEditingAuthor(false); document.getElementById('commentText')?.focus(); } }
                }} />
                <datalist id="commentAuthorSuggestions">{[...new Set(['Anonymous', ...people])].map((person) => <option key={person} value={person} />)}</datalist>
            </div>}
            <label className="sr-only" htmlFor="commentText">{t('comments.body')}</label>
            <textarea id="commentText" rows={3} placeholder={t('comments.placeholder')} value={draft.text} onChange={(e) => update({ text: e.target.value, error: undefined })} />
            <div className="comment-images">{draft.images.map((image) => <div className="comment-image" key={image.id}>
                <img src={image.dataUrl} alt={image.name} /><button type="button" className="btn" disabled={busy} aria-label={t('comments.removeImage', { name: image.name })} onClick={() => update({ images: draft.images.filter((item) => item.id !== image.id) })}>{t('common.remove')}</button>
            </div>)}</div>
            {draft.error && <p className="comment-error" role="alert">{t(`comments.error.${draft.error}`)}</p>}
            {totalBytes > ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES && <p className="comment-warning" role="status">{t('comments.sizeWarning')}</p>}
            <div className="comment-actions">
                <button type="button" className="btn" disabled={busy || draft.reading} onClick={() => fileInput.current?.click()}>{t('comments.addImages')}</button>
                <button type="button" className="btn" disabled={busy || draft.reading} onClick={() => discardConversationDraft(sessionKey)}>{t('comments.discard')}</button>
                <button type="button" className="btn btn-primary" disabled={busy || draft.reading} onClick={() => void publish()}>{t(draft.reading ? 'comments.reading' : 'comments.publish')}</button>
            </div>
            <p className="comment-note comment-input-help" aria-live="polite">{draft.text.length} / 10 000 · {t('comments.inputHelp')}</p>
            <p className="comment-note comment-image-limits">{t('comments.imageLimits', { count: draft.images.length })}</p>
            <input ref={fileInput} type="file" className="hidden" aria-label={t('comments.addImages')} accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; void addImages(files); }} />
        </div>}
        <div className="comment-list-heading"><h3 id="taskConversationHeading">{t('comments.title')} ({comments.length})</h3><span>{t('comments.newestFirst')}</span></div>
        {!comments.length && <p className="comment-empty">{t('comments.empty')}</p>}
        <ol className="comment-list" ref={list}>{shown.map((comment) => <li className="comment-publication" data-comment-id={comment.id} key={comment.id}>
            <header><strong>{comment.author.name}</strong><span>{t('comments.localAuthor')}</span><time dateTime={comment.at}>{new Date(comment.at).toLocaleString(language === 'pt' ? 'pt-PT' : 'en', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></header>
            {comment.text && <PlainCommentText text={comment.text} />}
            {comment.images.length > 0 && <div className="comment-images">{comment.images.map(imageCard)}</div>}
        </li>)}</ol>
        {comments.length > visible && <button className="btn comment-load-earlier" type="button" onClick={() => {
            const body = list.current?.closest('.modal-body');
            const bounds = body?.getBoundingClientRect();
            const reading = Array.from(list.current?.children || []).find((item) => bounds && item.getBoundingClientRect().bottom > bounds.top && item.getBoundingClientRect().top < bounds.bottom);
            if (reading) anchor.current = { id: reading.getAttribute('data-comment-id') || '', top: reading.getBoundingClientRect().top };
            setVisible((count) => count + 50);
        }}>{t('comments.loadEarlier')}</button>}
        <details className="comment-record-note"><summary>{t('comments.recordInfo')}</summary><p className="comment-note">{t('comments.localNote')}</p></details>
        <Dialog.Root open={Boolean(zoom)} onOpenChange={(open) => { if (!open) setZoom(null); }}><Dialog.Portal><Dialog.Overlay className="modal active comment-image-overlay">
            <Dialog.Content className="modal-content comment-image-viewer" aria-describedby={undefined} onEscapeKeyDown={(event) => { event.preventDefault(); event.stopPropagation(); setZoom(null); }}>
                <div className="modal-header"><Dialog.Title className="modal-title">{zoom?.name || t('comments.image')}</Dialog.Title><Dialog.Close className="modal-close" aria-label={t('common.close')}>×</Dialog.Close></div>
                {zoom && <div className="modal-body"><img src={zoom.dataUrl} alt={zoom.name} /><a className="btn" href={zoom.dataUrl} download={zoom.name}>{t('common.download')}</a></div>}
            </Dialog.Content>
        </Dialog.Overlay></Dialog.Portal></Dialog.Root>
    </section>;
}
