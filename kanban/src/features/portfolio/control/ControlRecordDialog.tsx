import { navigateControlTabs } from './controlTabNavigation';
import { todayLocalIsoDate } from '@/domain/util';
import { useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CONTROL_KINDS, CONTROL_STATUSES, ASSESSMENTS, controlRecords, newControlRecord, riskLevel, type ControlKind, type ControlRecord } from '@/domain/projectControl';
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
import { ControlBadge, ControlTypeBadge } from './ControlBadge';
import { ControlRecordHistory } from './ControlRecordHistory';

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
    const [tab, setTab] = useState<'details' | 'response' | 'comments' | 'history'>('details');
    const [acronym, setAcronym] = useState('');
    const activeKind = draft.kind;
    const tabs = activeKind === 'risks' ? ['details', 'response', 'comments', 'history'] as const : ['details', 'comments', 'history'] as const;
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
    const readonly = readOnly || Boolean(recordId && !record);
    const focus = useReturnFocus({ initialFocus: readonly ? undefined : titleRef });
    const field = (key: keyof ControlRecord, type: 'text' | 'date' | 'textarea' = 'text') => {
        const props = { id: `control-${key}`, 'aria-label': t(`control.${key}` as TranslationKey), value: String(draft[key]), disabled: readonly || busy, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((current) => ({ ...current, [key]: event.target.value })) };
        return <label className="form-group" key={key} htmlFor={props.id}>{t(`control.${key}` as TranslationKey)}{type === 'textarea' ? <textarea {...props} rows={3} maxLength={10000} /> : <input {...props} type={type} maxLength={key === 'title' ? 200 : 500} required={key === 'title'} />}</label>;
    };
    const select = (key: 'status' | 'probability' | 'impact', values: readonly string[]) => <label className="form-group" key={key}>{t(`control.${key}`)}<select id={`control-${key}`} aria-label={t(`control.${key}`)} disabled={readonly || busy} value={draft[key]} onChange={(event) => { const value = event.target.value; setDraft((current) => ({ ...current, [key]: value, ...(key === 'status' && ['delivered', 'accepted'].includes(value) && !current.deliveredDate ? { deliveredDate: todayLocalIsoDate() } : {}), ...(key === 'status' && value === 'accepted' && !current.acceptedDate ? { acceptedDate: todayLocalIsoDate() } : {}), ...(key === 'status' && value === 'materialized' && !current.materializedDate ? { materializedDate: todayLocalIsoDate() } : {}) })); }}>{values.map((value) => <option key={value} value={value}>{t(`control.${value}` as TranslationKey)}</option>)}</select></label>;
    return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><Dialog.Portal><Dialog.Overlay className="modal active control-modal">
        <Dialog.Content className="modal-content workitem-modal" aria-describedby={undefined} onPointerDownOutside={keepOpenOnUndoToast} onEscapeKeyDown={(event) => { escapeAnswersAppMessage(event); if (event.defaultPrevented) return; event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }} {...focus}>
            <div className="modal-header workitem-modal-header">
                <div className="workitem-heading">
                    <div className="workitem-eyebrow"><ControlTypeBadge kind={activeKind} />{record && <span>{record.id}</span>}<span className="workitem-project">{data.board.settings.title}</span></div>
                    <Dialog.Title className="workitem-title">{record?.title || `${t('control.new')} · ${t(`control.type.${activeKind}`)}`}</Dialog.Title>
                </div>
                <div className="workitem-header-actions">{readonly && <span className="workitem-readonly">{t('toolbar.readOnly')}</span>}<Dialog.Close className="modal-close" aria-label={t('common.close')} disabled={busy}>×</Dialog.Close></div>
            </div>
            <div className="detail-tabs" role="tablist" aria-label={t('control.view')}>{tabs.map((value) => <button key={value} type="button" role="tab" id={`control-tab-${value}`} aria-controls={`control-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onKeyDown={(event) => navigateControlTabs(event, tabs.filter((entry) => record || entry === 'details' || entry === 'response'), value, setTab)} disabled={(value === 'comments' || value === 'history') && !record} onClick={() => setTab(value)}>{t(`control.${value}`)}</button>)}</div>
            <div className="modal-body">
                {recordId && !record ? <p role="alert">{t('control.stale')}</p> : <>
                <form onSubmit={async (event) => {
                    event.preventDefault(); if (busy || readonly) return;
                    if (!draft.title.trim() || !author.trim()) { setTab('details'); setError(t('control.invalid')); return; }
                    setBusy(true); setError('');
                    rememberCommentAuthor(boardId, author);
                    try { await saveProjectControl(boardId, draft, author, (saved) => { onSaved?.(saved); onClose(); }, acronym); }
                    finally { setBusy(false); }
                }} id="control-record-form" hidden={tab === 'comments' || tab === 'history'}>
                    <div role="tabpanel" id="control-panel-details" aria-labelledby="control-tab-details" hidden={tab !== 'details'}>
                        <div className="workitem-overview">
                            <div className="workitem-main">
                                <label className="form-group">{t('control.title')}<input ref={titleRef} id="control-title" maxLength={200} required={tab === 'details'} value={draft.title} disabled={readonly || busy} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
                                {field('description', 'textarea')}
                                {activeKind === 'decisions' && field('rationale', 'textarea')}
                                <ControlRelated boardId={boardId} data={data} value={draft.related} onChange={readonly || busy ? undefined : (related) => setDraft({ ...draft, related })} onNavigate={onClose} />
                            </div>
                            <aside className="workitem-sidebar" aria-label={t('workitems.properties')}>
                                <section className="workitem-property-group"><h3>{t('workitems.properties')}</h3>
                                    <label className="form-group">{t('control.kind')}<select aria-label={t('control.kind')} disabled={Boolean(record) || readonly || busy} value={activeKind} onChange={(event) => { const next = event.target.value as ControlKind; setDraft({ ...newControlRecord(next), title: draft.title, description: draft.description, owner: draft.owner, dueDate: draft.dueDate, related: draft.related }); }}>{CONTROL_KINDS.map((value) => <option key={value} value={value}>{t(`control.type.${value}`)}</option>)}</select></label>
                                    {select('status', CONTROL_STATUSES[activeKind])}<ControlBadge value={draft.status} />
                                    {field('dueDate', 'date')}
                                    {activeKind === 'risks' && <>{select('probability', ASSESSMENTS)}{select('impact', ASSESSMENTS)}<p className={`control-risk ${riskLevel(draft)}`}>{t('control.riskLevel')}: <ControlBadge value={riskLevel(draft)} /></p><p className="field-hint">{t('control.riskRule')}</p>{field('materializedDate', 'date')}</>}
                                    {activeKind === 'decisions' && field('decisionDate', 'date')}
                                    {activeKind === 'deliverables' && <>{field('deliveredDate', 'date')}{field('acceptedDate', 'date')}<p className="field-hint">{t('control.datesHelp')}</p></>}
                                </section>
                                <section className="workitem-property-group"><h3>{t('workitems.people')}</h3>{field('owner')}{activeKind === 'decisions' && field('decisionMaker')}{activeKind === 'deliverables' && field('validator')}</section>
                                <section className="workitem-property-group"><h3>{t('control.history')}</h3>
                                    {record && <dl className="detail-list">{(['createdAt', 'updatedAt'] as const).map((key) => <div className="detail-item" key={key}><dt className="detail-label">{t(`control.${key}`)}</dt><dd className="detail-value">{new Date(record[key]).toLocaleString(language === 'pt' ? 'pt-PT' : 'en')}</dd></div>)}</dl>}
                                    {!readonly && <label className="form-group">{t('control.author')}<input id="control-author" required={tab === 'details'} disabled={busy} value={author} onChange={(event) => setAuthor(event.target.value)} /></label>}
                                    {!record && !data.extensions.project?.acronym && <label className="form-group">{t('project.acronym')}<input aria-label={t('project.acronym')} required={tab === 'details'} pattern="[A-Z]{1,3}" maxLength={3} disabled={readonly || busy} value={acronym} onChange={(event) => setAcronym(event.target.value.toUpperCase())} /><span className="field-hint">{t('project.acronymHelp')}</span></label>}
                                </section>
                            </aside>
                        </div>
                    </div>
                    {activeKind === 'risks' && <div role="tabpanel" id="control-panel-response" aria-labelledby="control-tab-response" hidden={tab !== 'response'} className="control-response">{field('mitigationPlan', 'textarea')}{field('contingencyPlan', 'textarea')}{field('actualImpact', 'textarea')}</div>}
                    {error && <p role="alert">{error}</p>}
                </form>
                {tab === 'comments' && record && <div role="tabpanel" id="control-panel-comments" aria-labelledby="control-tab-comments" className="control-tab-panel"><TaskConversation context={{ boardId, controlId: record.id, controlRecord: record, readOnly: readonly }} /></div>}
                {tab === 'history' && record && <div role="tabpanel" id="control-panel-history" aria-labelledby="control-tab-history" tabIndex={0} className="control-tab-panel"><ControlRecordHistory record={record} /></div>}
                </>}
            </div>
            <div className="modal-footer"><Dialog.Close className="btn" disabled={busy}>{t('common.close')}</Dialog.Close>{(tab === 'details' || tab === 'response') && !readonly && <button className="btn btn-primary" type="submit" form="control-record-form" disabled={busy}>{t('control.save')}</button>}</div>
        </Dialog.Content>
    </Dialog.Overlay></Dialog.Portal></Dialog.Root>;
}
