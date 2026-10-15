import { useState } from 'react';
import { getPullRequests, type PullRequestLink } from '@/domain/pullRequests';
import { safeWebUrl } from '@/domain/links';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

const EMPTY = { id: '', number: '', repository: '', url: '', notes: '' };
export function TaskPullRequests({ readOnly }: { readOnly: boolean }) {
    const { t } = useI18n();
    const actions = usePortfolioActions();
    const boards = useAppStore((s) => s.portfolioBoards);
    const context = useAppStore((s) => s.portfolioDetailContext);
    const selection = useAppStore((s) => s.portfolioTimelineSelection);
    const selected = useAppStore((s) => s.selectedPortfolioBoardId);
    const [draft, setDraft] = useState(EMPTY), [busy, setBusy] = useState(false);
    const board = boards.find((board) => board.id === context?.boardId);
    if (!board || !context) return null;
    const preview = getSelectedPortfolioTimelineView({ portfolioBoards: boards, selectedPortfolioBoardId: selected, portfolioTimelineSelection: selection });
    const data = preview?.isPreview && preview.boardRecord.id === board.id ? preview.projectedBoard || board.data : board.data;
    const links = getPullRequests(data).byTaskId[context.taskId] || [];
    const edit = (link: PullRequestLink) => setDraft({ id: link.id, number: link.number, repository: link.repository, url: link.url, notes: link.notes });
    return <section id="taskPullRequests"><p className="muted">{t('pr.offline')}</p>
        {links.map((link) => <article className="pr-reference" key={link.id}><strong>GitHub · {link.repository || t('pr.unknownRepository')} · #{link.number}</strong>
            {link.url && safeWebUrl(link.url, true) && <a href={link.url} target="_blank" rel="noopener noreferrer">{t('pr.open')}</a>}
            {link.notes && <p className="comment-body">{link.notes}</p>}
            {!readOnly && <div className="project-actions"><button className="btn-text" type="button" onClick={() => edit(link)}>{t('common.edit')}</button><button className="btn-text" type="button" onClick={() => actions.removeWorkitemPullRequest(board.id, context.taskId, link.id)}>{t('common.remove')}</button></div>}
        </article>)}
        {!links.length && <p>{t('pr.empty')}</p>}
        {!readOnly && <form className="pr-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { if (await actions.saveWorkitemPullRequest(board.id, context.taskId, { ...draft, id: draft.id || undefined })) setDraft(EMPTY); } finally { setBusy(false); } }}>
            <fieldset disabled={busy}><label>{t('pr.number')}<input id="prNumber" required inputMode="numeric" value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} /></label>
                <label>{t('pr.repository')}<input id="prRepository" placeholder="owner/repository" value={draft.repository} onChange={(e) => setDraft({ ...draft, repository: e.target.value })} /></label>
                <label>{t('pr.url')}<input id="prUrl" type="url" placeholder="https://github.com/…/pull/123" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></label>
                <label>{t('pr.notes')}<textarea id="prNotes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
                <div className="project-actions"><button className="btn" type="button" onClick={() => setDraft(EMPTY)}>{t('common.cancel')}</button><button className="btn btn-primary" type="submit">{t('pr.save')}</button></div>
            </fieldset>
        </form>}
    </section>;
}
