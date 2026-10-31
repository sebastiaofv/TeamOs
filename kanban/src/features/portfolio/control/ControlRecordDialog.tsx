import { navigateControlTabs } from './controlTabNavigation';
import { todayLocalIsoDate } from '@/domain/util';
import { useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CONTROL_STATUSES, ASSESSMENTS, controlRecords, newControlRecord, riskLevel, type ControlKind, type ControlRecord } from '@/domain/projectControl';
import type { BoardData } from '@/domain/types';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { lastCommentAuthor, rememberCommentAuthor } from '@/features/portfolio/task/conversationDrafts';
import { TaskConversation } from '@/features/portfolio/task/dialogs/TaskConversation';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries/portfolioTimelineViews';
import { closeDialog } from '@/app/overlays/dialogs';
import { ControlRelated } from './ControlRelated';

export function ProjectControlDialog() {
    const context = useAppStore((state) => state.activeDialog === 'projectControl' ? state.dialogProps as { boardId: string; recordId?: string; kind: ControlKind } : null);
    const board = useAppStore((state) => state.portfolioBoards.find((record) => record.id === context?.boardId));
    const state = useAppStore();
    const timeline = context && getSelectedPortfolioTimelineView(state);
    const data = timeline?.isPreview && timeline.boardRecord.id === board?.id ? timeline.projectedBoard : board?.data;
    if (!context || !board || !data) return null;
    return <ControlRecordDialog {...context} data={data} readOnly={!board.handle || Boolean(timeline?.isPreview)} onClose={() => closeDialog('projectControl')} />;
}

export function ControlRecordDialog({ boardId, recordId, kind, data, readOnly = false, onClose, onSaved }: { boardId: string; recordId?: string; kind: ControlKind; data: BoardData; readOnly?: boolean; onClose: () => void; onSaved?: (record: ControlRecord) => void }) {
    const record = controlRecords(data).find((item) => item.id === recordId);
    const { t, language } = useI18n();
    const { saveProjectControl } = usePortfolioActions();
    const [draft, setDraft] = useState(() => structuredClone(record || newControlRecord(kind)));
    const [author, setAuthor] = useState(() => lastCommentAuthor(boardId));
    const [tab, setTab] = useState<'details' | 'comments' | 'history'>('details');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    // The parent Radix layer may still own Escape briefly after a nested dialog opens.
    // Handle it before document listeners so closing the child preserves the parent draft.
    useLayoutEffect(() => {
        const onEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || (event.target instanceof Element && event.target.closest('.comment-image-viewer'))) return;
            escapeAnswersAppMessage(event);
            if (event.defaultPrevented) return;
            event.preventDefault(); event.stopPropagation();
            if (!busy) onClose();
        };
        window.addEventListener('keydown', onEscape, true);
        return () => window.removeEventListener('keydown', onEscape, true);
    }, [busy, onClose]);
    const titleRef = useRef<HTMLInputElement>(null);
    const focus = useReturnFocus({ initialFocus: readOnly ? undefined : titleRef });
    const field = (key: keyof ControlRecord, type: 'text' | 'date' | 'textarea' = 'text') => {
        const props = { id: `control-${key}`, 'aria-label': t(`control.${key}` as TranslationKey), value: String(draft[key]), disabled: readOnly || busy, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((current) => ({ ...current, [key]: event.target.value })) };
        return <label className="form-group" key={key} htmlFor={props.id}>{t(`control.${key}` as TranslationKey)}{type === 'textarea' ? <textarea {...props} rows={3} maxLength={10000} /> : <input {...props} type={type} maxLength={key === 'title' ? 200 : 500} required={key === 'title'} />}</label>;
    };
    const select = (key: 'status' | 'probability' | 'impact', values: readonly string[]) => <label className="form-group" key={key}>{t(`control.${key}`)}<select id={`control-${key}`} aria-label={t(`control.${key}`)} disabled={readOnly || busy} value={draft[key]} onChange={(event) => { const value = event.target.value; setDraft((current) => ({ ...current, [key]: value, ...(key === 'status' && ['delivered', 'accepted'].includes(value) && !current.deliveredDate ? { deliveredDate: todayLocalIsoDate() } : {}), ...(key === 'status' && value === 'accepted' && !current.acceptedDate ? { acceptedDate: todayLocalIsoDate() } : {}), ...(key === 'status' && value === 'materialized' && !current.materializedDate ? { materializedDate: todayLocalIsoDate() } : {}) })); }}>{values.map((value) => <option key={value} value={value}>{t(`control.${value}` as TranslationKey)}</option>)}</select></label>;
    const readonly = readOnly || Boolean(recordId && !record);
    return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><Dialog.Portal><Dialog.Overlay className="modal active control-modal">
        <Dialog.Content className="modal-content" aria-describedby={undefined} onPointerDownOutside={keepOpenOnUndoToast} onEscapeKeyDown={(event) => { escapeAnswersAppMessage(event); if (event.defaultPrevented) return; event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }} {...focus}>
            <div className="modal-header"><Dialog.Title className="modal-title">{record ? `${record.id} · ${record.title}` : `${t('control.new')} · ${t(`control.${kind}`)}`}</Dialog.Title><Dialog.Close className="modal-close" aria-label={t('common.close')} disabled={busy}>×</Dialog.Close></div>
            <div className="control-tabs" role="tablist" aria-label={t('control.view')}>{(['details', 'comments', 'history'] as const).map((value) => <button key={value} type="button" role="tab" id={`control-tab-${value}`} aria-controls={`control-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onKeyDown={(event) => navigateControlTabs(event, record ? ['details', 'comments', 'history'] as const : ['details'] as const, value, setTab)} className={`btn${tab === value ? ' active' : ''}`} disabled={value !== 'details' && !record} onClick={() => setTab(value)}>{t(`control.${value}`)}</button>)}</div>
            <div className="modal-body" role="tabpanel" id={`control-panel-${tab}`} aria-labelledby={`control-tab-${tab}`}>
                {readonly && <p role="note">{t('common.readOnlyProject')}</p>}
                {recordId && !record ? <p role="alert">{t('control.stale')}</p> : tab === 'details' ? <form onSubmit={async (event) => {
                    event.preventDefault(); if (busy || readonly) return;
                    if (!draft.title.trim() || !author.trim()) { setError(t('control.invalid')); return; }
                    setBusy(true); setError('');
                    rememberCommentAuthor(boardId, author);
                    try { await saveProjectControl(boardId, draft, author, (saved) => { onSaved?.(saved); onClose(); }); }
                    finally { setBusy(false); }
                }} id="control-record-form">
                    <div className="control-form-grid"><label className="form-group">{t('control.title')}<input ref={titleRef} id="control-title" maxLength={200} required value={draft.title} disabled={readonly || busy} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>{select('status', CONTROL_STATUSES[kind])}{field('owner')}{field('dueDate', 'date')}</div>
                    {field('description', 'textarea')}
                    {kind === 'risks' && <><div className="control-form-grid">{select('probability', ASSESSMENTS)}{select('impact', ASSESSMENTS)}<p className={`control-risk ${riskLevel(draft)}`}>{t('control.riskLevel')}: {t(`control.${riskLevel(draft)}`)}</p></div><p className="field-hint">{t('control.riskRule')}</p>{field('mitigationPlan', 'textarea')}{field('contingencyPlan', 'textarea')}<div className="control-form-grid">{field('materializedDate', 'date')}{field('actualImpact', 'textarea')}</div></>}
                    {kind === 'decisions' && <><div className="control-form-grid">{field('decisionMaker')}{field('decisionDate', 'date')}</div>{field('rationale', 'textarea')}</>}
                    {kind === 'deliverables' && <><p className="field-hint">{t('control.datesHelp')}</p><div className="control-form-grid">{field('validator')}{field('deliveredDate', 'date')}{field('acceptedDate', 'date')}</div></>}
                    <ControlRelated boardId={boardId} data={data} value={draft.related} onChange={readonly || busy ? undefined : (related) => setDraft({ ...draft, related })} onNavigate={onClose} />
                    {!readonly && <label className="form-group">{t('control.author')}<input id="control-author" required value={author} onChange={(event) => setAuthor(event.target.value)} /></label>}
                    {error && <p role="alert">{error}</p>}
                </form> : tab === 'comments' && record ? <TaskConversation context={{ boardId, controlId: record.id, controlRecord: record, readOnly: readonly }} /> : record && <section className="task-history"><p>{t('history.localRecord')}</p>{!record.history.length && <p>{t('control.noHistory')}</p>}<ol className="history-entries">{record.history.slice().reverse().map((entry) => <li key={entry.id}><details><summary>{entry.author} · {new Date(entry.at).toLocaleString(language === 'pt' ? 'pt-PT' : 'en')}</summary><dl>{Object.entries(entry.changes).map(([key, change]) => <div key={key}><dt>{t(`control.${key}` as TranslationKey)}</dt><dd>{display(change.before)} → {display(change.after)}</dd></div>)}</dl></details></li>)}</ol></section>}
            </div>
            <div className="modal-footer"><Dialog.Close className="btn" disabled={busy}>{t('common.close')}</Dialog.Close>{tab === 'details' && !readonly && <button className="btn btn-primary" type="submit" form="control-record-form" disabled={busy}>{t('control.save')}</button>}</div>
        </Dialog.Content>
    </Dialog.Overlay></Dialog.Portal></Dialog.Root>;
}
function display(value: unknown): string { return value === null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value); }
