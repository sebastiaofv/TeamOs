import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useSubmission } from '@/shared/hooks/useSubmission';
import { parsePullRequestLinks, PullRequestLinkError, safePullRequestHref, validatePullRequestUrl, type PullRequestErrorCode } from '@/domain/pullRequests';
import { areSerializableValuesEqual } from '@/domain/serializable';
import { showConfirm } from '@/app/overlays/appMessages';
import { portfolioActions } from '@/features/portfolio/commands/portfolioCommands';
import { useI18n } from '@/shared/i18n';

export function PullRequestLinks({ value, onChange, readOnly = false, draft = false }: {
    value: string[]; onChange: (links: string[]) => boolean | void | Promise<boolean | void>; readOnly?: boolean; draft?: boolean;
}) {
    const { t } = useI18n();
    const id = useId();
    // Not editing, or editing one link: a new one or the one at an index.
    const [form, setForm] = useState<{ target: 'new' | number; input: string; error: PullRequestErrorCode | null } | null>(null);
    const { busy, run, isRunning } = useSubmission();
    const editing = form === null ? null : form.target === 'new' ? -1 : form.target;
    const input = form?.input ?? '';
    const error = form?.error ?? null;
    const inputRef = useRef<HTMLInputElement>(null);
    const addButtonRef = useRef<HTMLButtonElement>(null);
    const editButtonRefs = useRef(new Map<number, HTMLButtonElement>());
    const returnFocusIndex = useRef<number | null>(null);
    useLayoutEffect(() => {
        if (editing !== null) inputRef.current?.focus();
    }, [editing]);
    useLayoutEffect(() => {
        if (editing !== null || busy || returnFocusIndex.current === null) return;
        const index = returnFocusIndex.current;
        returnFocusIndex.current = null;
        (index < 0 ? addButtonRef.current : editButtonRefs.current.get(index))?.focus();
    }, [editing, busy]);
    const clear = () => setForm(null);
    const start = (index: number) => { returnFocusIndex.current = index; setForm({ target: index < 0 ? 'new' : index, input: index < 0 ? '' : value[index], error: null }); };
    async function confirm() {
        if (!form || editing === null || readOnly || isRunning()) return;
        let next: string[];
        try {
            const url = validatePullRequestUrl(input);
            next = editing < 0 ? [...value, url] : value.map((link, index) => index === editing ? url : link);
            next = parsePullRequestLinks(next);
        } catch (cause) { setForm({ ...form, error: cause instanceof PullRequestLinkError ? cause.code : 'invalid' }); return; }
        if (areSerializableValuesEqual(value, next)) { clear(); return; }
        if (await run(async () => await onChange(next) !== false)) clear();
    }
    async function remove(index: number) {
        if (readOnly) return;
        await run(async () => {
            if (!(await showConfirm(t('pullRequests.removeQuestion', { url: value[index] }), { title: t('pullRequests.title'), confirmLabel: t('common.remove'), danger: true }))) return;
            await onChange(value.filter((_, current) => current !== index));
        });
    }
    return <section className="pull-request-links" aria-label={t('pullRequests.title')}>
        <p className="pull-request-note">{t('pullRequests.localOnly')}</p>
        {draft && !readOnly && <p className="pull-request-note">{t('pullRequests.draftNote')}</p>}
        {!value.length ? <p className="pull-request-empty">{t('pullRequests.empty')}</p> : <ul className="pull-request-list">{value.map((url, index) => {
            const href = safePullRequestHref(url);
            return <li key={`${url}:${index}`}>
                {href ? <a href={href} target="_blank" rel="noopener noreferrer">{url}</a> : <span>{url}</span>}
                {!readOnly && <div className="pull-request-actions">
                    <button type="button" className="btn" ref={(button) => { if (button) editButtonRefs.current.set(index, button); else editButtonRefs.current.delete(index); }} disabled={busy || editing !== null} aria-label={t('pullRequests.edit', { url })} onClick={() => start(index)}>{t('common.edit')}</button>
                    <button type="button" className="btn" disabled={busy || editing !== null} aria-label={t('pullRequests.remove', { url })} onClick={() => void remove(index)}>{t('common.remove')}</button>
                </div>}
            </li>;
        })}</ul>}
        {!readOnly && <>
            {editing === null ? <button type="button" className="btn" ref={addButtonRef} disabled={busy} onClick={() => start(-1)}>{t('pullRequests.add')}</button> : <div className="pull-request-form" role="group" aria-label={t('pullRequests.editing')}>
                <label htmlFor={`${id}-url`}>{t('pullRequests.url')}</label>
                <input ref={inputRef} id={`${id}-url`} type="text" inputMode="url" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={input} disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => { const next = event.target.value; setForm((current) => current && { ...current, input: next, error: null }); }} onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); event.stopPropagation(); void confirm(); }
                }} />
                {error && <p className="pull-request-error" role="alert" id={`${id}-error`}>{t(`pullRequests.error.${error}`)}</p>}
                <div className="pull-request-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void confirm()}>{t('pullRequests.confirm')}</button><button type="button" className="btn" disabled={busy} onClick={clear}>{t('common.cancel')}</button></div>
            </div>}
        </>}
    </section>;
}

export function TaskPullRequestLinks({ boardId, taskId, links, readOnly }: { boardId: string; taskId: number; links: string[]; readOnly: boolean }) {
    const { setPortfolioTaskPullRequests } = portfolioActions;
    return <PullRequestLinks value={links} readOnly={readOnly} onChange={(next) => setPortfolioTaskPullRequests(boardId, taskId, next)} />;
}
