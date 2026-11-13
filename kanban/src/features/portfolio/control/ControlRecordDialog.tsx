import { useProjectHistory } from '@/features/portfolio/hooks/useProjectHistory';
import { DateInput } from '@/shared/ui/DateInput';
import { SaveButton, SaveIndicator } from '@/features/portfolio/projects/ProjectSaveStatus';
import { formatTimestamp } from '@/domain/dates';
import { projectActor } from '@/features/portfolio/projects/projectIdentity';
import { navigateControlTabs } from './controlTabNavigation';
import { getProjectData } from '@/domain/projectData';
import { setTaskResponsible, removeTaskParticipant } from '@/domain/taskAssignments';
import { AssigneeEditor } from '@/features/portfolio/task/dialogs/editor/AssigneeEditor';
import { TagEditor } from '@/features/portfolio/task/dialogs/editor/TagEditor';
import { todayLocalIsoDate } from '@/domain/util';
import { useLayoutEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CONTROL_KINDS, CONTROL_STATUSES, ASSESSMENTS, controlRecords, newControlRecord, riskLevel, type ControlKind, type ControlRecord } from '@/domain/projectControl';
import type { BoardData } from '@/domain/types';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import { portfolioActions } from '@/features/portfolio/commands/portfolioCommands';
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
    return <ControlRecordDialog key={`${context.boardId}:${context.recordId || 'new'}`} {...context} data={data} readOnly={!board.handle || Boolean(timeline?.isPreview)} onClose={() => closeDialog('projectControl')} />;
}

export function ControlRecordDialog({ boardId, recordId, kind, data, readOnly = false, onClose, onSaved }: { boardId: string; recordId?: string; kind: ControlKind; data: BoardData; readOnly?: boolean; onClose: () => void; onSaved?: (record: ControlRecord) => void }) {
    const record = controlRecords(data).find((item) => item.id === recordId);
    const { t } = useI18n();
    const { saveProjectControl, confirmResponsibleParticipantRemoval } = portfolioActions;
    const project = getProjectData(data);
    const [draft, setDraft] = useState(() => structuredClone(record || newControlRecord(kind)));
    // A new record opens in the full editor; an existing one opens for viewing,
    // with inline fields saved on change, until Edit switches to the full editor.
    const [mode, setMode] = useState<'viewing' | 'editing' | 'savingToClose'>(recordId ? 'viewing' : 'editing');
    const editing = mode !== 'viewing';
    const busy = mode === 'savingToClose';
    const [author, setAuthor] = useState(() => lastCommentAuthor(boardId));
    const [tab, setTab] = useState<'details' | 'response' | 'comments' | 'history'>('details');
    const historyLoad = useProjectHistory(boardId, tab === 'history');
    const [acronym, setAcronym] = useState('');
    const activeKind = draft.kind;
    const tabs = activeKind === 'risks' ? ['details', 'response', 'comments', 'history'] as const : ['details', 'comments', 'history'] as const;
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
    const focus = useReturnFocus({ initialFocus: editing && !readonly ? titleRef : undefined });
    async function save(next: ControlRecord, closeAfterSave: boolean) {
        if (busy || readonly) return;
        if (!next.title.trim() || !author.trim()) { setTab('details'); setError(t('control.invalid')); return; }
        if (closeAfterSave) setMode('savingToClose');
        setError('');
        rememberCommentAuthor(boardId, author);
        try {
            await saveProjectControl(boardId, next, author, (saved) => {
                setDraft(structuredClone(saved));
                onSaved?.(saved);
                if (closeAfterSave) onClose();
            }, acronym);
        } finally { if (closeAfterSave) setMode('editing'); }
    }
    function edit() {
        if (readonly || busy || !record) return;
        setDraft(structuredClone(record)); setMode('editing'); setError(''); setTab('details');
    }
    useLayoutEffect(() => {
        if (editing && !readonly) titleRef.current?.focus();
    }, [editing, readonly]);
    const field = (key: keyof ControlRecord, type: 'text' | 'date' | 'textarea' = 'text') => {
        const mainField = ['title', 'description', 'rationale', 'mitigationPlan', 'contingencyPlan', 'actualImpact'].includes(key);
        if (mainField && !editing) return <section className="workitem-section" key={key}><h3>{t(`control.${key}` as TranslationKey)}</h3><p className="detail-value">{String(draft[key]) || '—'}</p></section>;
        const props = { id: `control-${key}`, 'aria-label': t(`control.${key}` as TranslationKey), value: String(draft[key]), disabled: readonly || busy, onBlur: () => { if (!editing && !mainField && draft[key] !== record?.[key]) void save(draft, false); }, onChange: (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [key]: event.target.value })) };
        return <div className="form-group" key={key}><label htmlFor={props.id}>{t(`control.${key}` as TranslationKey)}</label>{type === 'textarea' ? <textarea {...props} rows={3} maxLength={10000} /> : type === 'date' ? <DateInput {...props} /> : <input {...props} ref={key === 'title' ? titleRef : undefined} type={type} maxLength={key === 'title' ? 200 : 500} required={key === 'title' && tab === 'details'} />}</div>;
    };
    function update(next: ControlRecord) {
        setDraft(next);
        if (!editing) void save(next, false);
    }
    async function removeParticipant(index: number) {
        const assignments = { ...draft, responsible: draft.owner };
        const result = removeTaskParticipant(assignments, index);
        if (result.needsConfirmation && !(await confirmResponsibleParticipantRemoval(draft.assignees[index]))) return;
        const next = removeTaskParticipant(assignments, index, true).task;
        update({ ...draft, owner: next.responsible, assignees: next.assignees });
    }
    const select = (key: 'status' | 'probability' | 'impact', values: readonly string[]) => {
        const input = <select id={`control-${key}`} aria-label={t(`control.${key}`)} disabled={readonly || busy} value={draft[key]} onChange={(event) => { const value = event.target.value; update({ ...draft, [key]: value, ...(key === 'status' && ['delivered', 'accepted'].includes(value) && !draft.deliveredDate ? { deliveredDate: todayLocalIsoDate() } : {}), ...(key === 'status' && value === 'accepted' && !draft.acceptedDate ? { acceptedDate: todayLocalIsoDate() } : {}), ...(key === 'status' && value === 'materialized' && !draft.materializedDate ? { materializedDate: todayLocalIsoDate() } : {}) }); }}>{values.map((value) => <option key={value} value={value}>{t(`control.${value}` as TranslationKey)}</option>)}</select>;
        return <div className={`form-group${key === 'status' ? ' detail-status-editor' : ''}`} key={key}><label htmlFor={`control-${key}`}>{t(`control.${key}`)}</label>{key === 'status' ? <div className="detail-status-control"><ControlBadge value={draft.status} />{input}</div> : input}</div>;
    };
    return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><Dialog.Portal><Dialog.Overlay className="modal active control-modal">
        <Dialog.Content className="modal-content workitem-modal" aria-describedby={undefined} onPointerDownOutside={keepOpenOnUndoToast} onEscapeKeyDown={(event) => { escapeAnswersAppMessage(event); if (event.defaultPrevented) return; event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }} {...focus}>
            <div className="modal-header workitem-modal-header">
                <div className="workitem-heading">
                    <div className="workitem-eyebrow"><ControlTypeBadge kind={activeKind} />{record && <span>{record.id}</span>}<span className="workitem-project">{data.board.settings.title}</span></div>
                    <Dialog.Title className="workitem-title">{record?.title || `${t('control.new')} · ${t(`control.type.${activeKind}`)}`}</Dialog.Title>
                </div>
                <div className="workitem-header-actions"><SaveIndicator boardId={boardId} />{readonly && <span className="workitem-readonly">{t('toolbar.readOnly')}</span>}<Dialog.Close className="modal-close" aria-label={t('common.close')} disabled={busy}>×</Dialog.Close></div>
            </div>
            <div className="detail-tabs" role="tablist" aria-label={t('control.view')}>{tabs.map((value) => <button key={value} type="button" role="tab" id={`control-tab-${value}`} aria-controls={`control-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onKeyDown={(event) => navigateControlTabs(event, tabs.filter((entry) => record || entry === 'details' || entry === 'response'), value, setTab)} disabled={(value === 'comments' || value === 'history') && !record} onClick={() => setTab(value)}>{t(`control.${value}`)}</button>)}</div>
            <div className="modal-body">{historyLoad.error && <p role="alert">{historyLoad.error} <button type="button" className="btn" onClick={historyLoad.retry}>{t('common.retry')}</button></p>}
                {recordId && !record ? <p role="alert">{t('control.stale')}</p> : <>
                <form onSubmit={(event) => {
                    event.preventDefault(); if (editing) void save(draft, true);
                }} id="control-record-form" hidden={tab === 'comments' || tab === 'history'}>
                    <div role="tabpanel" id="control-panel-details" aria-labelledby="control-tab-details" hidden={tab !== 'details'}>
                        <div className="workitem-overview">
                            <div className="workitem-main">
                                {field('title')}
                                {field('description', 'textarea')}
                                {activeKind === 'decisions' && field('rationale', 'textarea')}
                                <ControlRelated boardId={boardId} data={data} value={draft.related} onChange={!editing || readonly || busy ? undefined : (related) => setDraft({ ...draft, related })} onNavigate={onClose} />
                            </div>
                            <aside className="workitem-sidebar" aria-label={t('workitems.properties')}>
                                {editing && <section className="workitem-property-group">
                                    <div className="form-group"><label htmlFor="control-kind">{t('control.kind')}</label><select id="control-kind" disabled={Boolean(recordId) || readonly || busy} value={activeKind} onChange={(event) => {
                                        const next = event.target.value as ControlKind;
                                        setDraft({ ...newControlRecord(next), title: draft.title, description: draft.description, owner: draft.owner, assignees: draft.assignees, tags: draft.tags, dueDate: draft.dueDate, related: draft.related });
                                    }}>{CONTROL_KINDS.map((value) => <option key={value} value={value}>{t(`control.type.${value}`)}</option>)}</select></div>
                                </section>}
                                <section className="workitem-property-group"><h3>{t('workitems.properties')}</h3>
                                    {select('status', CONTROL_STATUSES[activeKind])}
                                    {activeKind === 'risks' && <>{select('probability', ASSESSMENTS)}{select('impact', ASSESSMENTS)}<div className="form-group"><label id="control-riskLevel-label">{t('control.riskLevel')}</label><output aria-labelledby="control-riskLevel-label"><ControlBadge value={riskLevel(draft)} /></output></div><p className="field-hint">{t('control.riskRule')}</p></>}
                                    {field('dueDate', 'date')}
                                    {activeKind === 'risks' && field('materializedDate', 'date')}
                                    {activeKind === 'decisions' && field('decisionDate', 'date')}
                                    {activeKind === 'deliverables' && <>{field('deliveredDate', 'date')}{field('acceptedDate', 'date')}<p className="field-hint">{t('control.datesHelp')}</p></>}
                                </section>
                                <section className="workitem-property-group"><h3>{t('workitems.people')}</h3>
                                    <div className="form-group"><label htmlFor="control-owner">{t('task.responsible')}</label><select id="control-owner" disabled={readonly || busy} value={draft.owner} onChange={(event) => {
                                        const next = setTaskResponsible({ ...draft, responsible: draft.owner }, event.target.value);
                                        update({ ...draft, owner: next.responsible, assignees: next.assignees });
                                    }}><option value="">{t('task.noResponsible')}</option>{[...new Set([...project.members.map((member) => member.name), ...(draft.owner ? [draft.owner] : [])])].map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
                                    {activeKind === 'decisions' && field('decisionMaker')}{activeKind === 'deliverables' && field('validator')}
                                    <fieldset className="control-people-editors" disabled={readonly || busy}>
                                        <div className="form-group"><label id="taskAssigneesLabel">{t('task.assignees')}</label><AssigneeEditor value={draft.assignees} pool={project.members.map((member) => member.name)} onChange={(assignees) => update({ ...draft, assignees })} onRemove={removeParticipant} /></div>
                                        <div className="form-group"><label id="taskTagsLabel">{t('task.tags')}</label><TagEditor value={draft.tags} suggestions={project.tags} onChange={(tags) => update({ ...draft, tags })} /></div>
                                    </fieldset>
                                </section>
                                <section className="workitem-property-group"><h3>{t('control.history')}</h3>
                                    {record && <dl className="detail-list">{(['createdAt', 'updatedAt'] as const).map((key) => <div className="detail-item" key={key}><dt className="detail-label">{t(`control.${key}`)}</dt><dd className="detail-value">{formatTimestamp(record[key])}</dd></div>)}</dl>}
                                    {!readonly && <div className="form-group"><label htmlFor="control-author">{t('control.author')}</label><input id="control-author" required={tab === 'details'} disabled={busy} readOnly={Boolean(projectActor(boardId))} value={projectActor(boardId)?.name || author} onChange={(event) => setAuthor(event.target.value)} /></div>}
                                    {!record && !data.extensions.project?.acronym && <div className="form-group"><label htmlFor="control-acronym">{t('project.acronym')}</label><input id="control-acronym" required={tab === 'details'} pattern="[A-Z]{1,4}" maxLength={4} disabled={readonly || busy} value={acronym} onChange={(event) => setAcronym(event.target.value.toUpperCase())} /><span className="field-hint">{t('project.acronymHelp')}</span></div>}
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
            <div className="modal-footer"><Dialog.Close className="btn" disabled={busy}>{t(editing && !readonly ? 'common.cancel' : 'common.close')}</Dialog.Close>{!readonly && (editing ? <SaveButton boardId={boardId} busy={busy} key="save" className="btn btn-primary" type="submit" form="control-record-form" disabled={busy}>{t('common.save')}</SaveButton> : record && <button key="edit" className="btn btn-primary" type="button" disabled={busy} onClick={edit}>{t('common.edit')}</button>)}</div>
        </Dialog.Content>
    </Dialog.Overlay></Dialog.Portal></Dialog.Root>;
}
