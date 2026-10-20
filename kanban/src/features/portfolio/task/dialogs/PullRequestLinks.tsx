import { useId, useRef, useState } from 'react';
import { parsePullRequestLinks, PullRequestLinkError, safePullRequestHref, validatePullRequestUrl, type PullRequestErrorCode } from '@/domain/pullRequests';
import { areSerializableValuesEqual } from '@/domain/serializable';
import { showConfirm } from '@/app/overlays/appMessages';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

export function PullRequestLinks({ value, onChange, readOnly = false, draft = false }: {
    value: string[]; onChange: (links: string[]) => boolean | void | Promise<boolean | void>; readOnly?: boolean; draft?: boolean;
}) {
    const { t } = useI18n();
    const id = useId();
    const [editing, setEditing] = useState<number | null>(null);
    const [input, setInput] = useState('');
    const [error, setError] = useState<PullRequestErrorCode | null>(null);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const clear = () => { setEditing(null); setInput(''); setError(null); };
    const start = (index: number) => { setInput(index < 0 ? '' : value[index]); setEditing(index); setError(null); requestAnimationFrame(() => inputRef.current?.focus()); };
    async function confirm() {
        if (editing === null || readOnly || busyRef.current) return;
        let next: string[];
        try {
            const url = validatePullRequestUrl(input);
            next = editing < 0 ? [...value, url] : value.map((link, index) => index === editing ? url : link);
            next = parsePullRequestLinks(next);
        } catch (cause) { setError(cause instanceof PullRequestLinkError ? cause.code : 'invalid'); return; }
        if (areSerializableValuesEqual(value, next)) { clear(); return; }
        busyRef.current = true; setBusy(true);
        try { if (await onChange(next) !== false) clear(); }
        finally { busyRef.current = false; setBusy(false); }
    }
    async function remove(index: number) {
        if (readOnly || busyRef.current) return;
        busyRef.current = true; setBusy(true);
        try {
            if (!(await showConfirm(t('pullRequests.removeQuestion', { url: value[index] }), { title: t('pullRequests.title'), confirmLabel: t('common.remove'), danger: true }))) return;
            await onChange(value.filter((_, current) => current !== index));
        } finally { busyRef.current = false; setBusy(false); }
    }
    return <section className="pull-request-links" aria-labelledby={`${id}-heading`}>
        <h3 id={`${id}-heading`}>{t('pullRequests.title')}</h3>
        <p className="pull-request-note">{t('pullRequests.localOnly')}</p>
        {draft && !readOnly && <p className="pull-request-note">{t('pullRequests.draftNote')}</p>}
        {!value.length ? <p className="pull-request-empty">{t('pullRequests.empty')}</p> : <ul className="pull-request-list">{value.map((url, index) => {
            const href = safePullRequestHref(url);
            return <li key={`${url}:${index}`}>
                {href ? <a href={href} target="_blank" rel="noopener noreferrer">{url}</a> : <span>{url}</span>}
                {!readOnly && <div className="pull-request-actions">
                    <button type="button" className="btn" disabled={busy || editing !== null} aria-label={t('pullRequests.edit', { url })} onClick={() => start(index)}>{t('common.edit')}</button>
                    <button type="button" className="btn" disabled={busy || editing !== null} aria-label={t('pullRequests.remove', { url })} onClick={() => void remove(index)}>{t('common.remove')}</button>
                </div>}
            </li>;
        })}</ul>}
        {!readOnly && <>
            {editing === null ? <button type="button" className="btn" disabled={busy} onClick={() => start(-1)}>{t('pullRequests.add')}</button> : <div className="pull-request-form" role="group" aria-label={t('pullRequests.editing')}>
                <label htmlFor={`${id}-url`}>{t('pullRequests.url')}</label>
                <input ref={inputRef} id={`${id}-url`} type="text" inputMode="url" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={input} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => { setInput(event.target.value); setError(null); }} onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); event.stopPropagation(); void confirm(); }
                }} />
                {error && <p className="pull-request-error" role="alert" id={`${id}-error`}>{t(`pullRequests.error.${error}`)}</p>}
                <div className="pull-request-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void confirm()}>{t('pullRequests.confirm')}</button><button type="button" className="btn" disabled={busy} onClick={clear}>{t('common.cancel')}</button></div>
            </div>}
        </>}
    </section>;
}

export function TaskPullRequestLinks({ boardId, taskId, links, readOnly }: { boardId: string; taskId: number; links: string[]; readOnly: boolean }) {
    const { setPortfolioTaskPullRequests } = usePortfolioActions();
    return <PullRequestLinks value={links} readOnly={readOnly} onChange={(next) => setPortfolioTaskPullRequests(boardId, taskId, next)} />;
}
