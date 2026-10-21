import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { BoardRecord } from '@/features/portfolio/types';
import type { Workflow, WorkflowCategory, WorkflowState } from '@/domain/types';
import { getWorkflow, WORKFLOW_CATEGORIES, workflowErrors, unreachableWorkflowStateIds } from '@/domain/workflow';
import { cloneSerializable } from '@/domain/serializable';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { showConfirm } from '@/app/overlays/appMessages';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { useI18n } from '@/shared/i18n';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { useShallow } from 'zustand/react/shallow';

function Chevron() {
    return <svg className="workflow-select-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>;
}

function WorkflowSelect({ value, onChange, disabled, label, children }: { value: string; onChange: (value: string) => void; disabled?: boolean; label: string; children: ReactNode }) {
    return <span className="workflow-select">
        <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{children}</select>
        <Chevron />
    </span>;
}

function StateDot({ state }: { state: WorkflowState }) {
    return <span className="workflow-state-dot" style={{ backgroundColor: state.color }} aria-hidden="true" />;
}

export function WorkflowSettings() {
    const state = useAppStore(useShallow((value) => ({ portfolioBoards: value.portfolioBoards, selectedPortfolioBoardId: value.selectedPortfolioBoardId, portfolioTimelineSelection: value.portfolioTimelineSelection })));
    const board = state.portfolioBoards.find((item) => item.id === state.selectedPortfolioBoardId);
    const preview = getSelectedPortfolioTimelineView(state);
    const [open, setOpen] = useState(false);
    const { t } = useI18n();
    if (!board) return null;
    const source = preview?.isPreview && preview.projectedBoard ? { ...board, data: preview.projectedBoard } : board;
    return <><button className="btn" aria-label={t('workflow.settings')} title={t('workflow.settings')} onClick={() => setOpen(true)}>Workflow</button>
        <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="modal active" id="workflowSettingsModal">
            <Dialog.Content className="modal-content workflow-dialog" aria-describedby="workflowSettingsDescription" onKeyDown={(event) => event.stopPropagation()} onEscapeKeyDown={escapeAnswersAppMessage}>
                <div className="modal-header workflow-modal-header"><div>
                    <Dialog.Title className="modal-title">{t('workflow.settings')}</Dialog.Title>
                    <Dialog.Description className="workflow-modal-description" id="workflowSettingsDescription">{board.title || board.fileName}</Dialog.Description>
                </div><Dialog.Close className="modal-close" aria-label={t('common.close')}>×</Dialog.Close></div>
                {open && <WorkflowEditor key={board.id} board={source} readOnly={!board.handle || Boolean(preview?.isPreview)} close={() => setOpen(false)} />}
            </Dialog.Content>
        </Dialog.Overlay></Dialog.Portal></Dialog.Root></>;
}

type Section = 'states' | 'references';

function WorkflowEditor({ board, readOnly, close }: { board: BoardRecord; readOnly: boolean; close: () => void }) {
    const { t } = useI18n();
    const { saveWorkflow } = usePortfolioActions();
    const original = getWorkflow(board.data);
    const [draft, setDraft] = useState<Workflow>(() => cloneSerializable(original));
    const [relocations, setRelocations] = useState<Record<string, string>>({});
    const [selectedId, setSelectedId] = useState(original.states[0].id);
    const [section, setSection] = useState<Section>('states');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const nextFocus = useRef(false);
    const formId = useId();
    const update = (fn: (value: Workflow) => void) => setDraft((value) => { const next = cloneSerializable(value); fn(next); return next; });
    const removed = original.states.filter((item) => !draft.states.some((current) => current.id === item.id));
    const selected = draft.states.find((item) => item.id === selectedId) || draft.states[0];
    const index = draft.states.findIndex((item) => item.id === selected.id);
    const targets = draft.transitions[selected.id] || [];
    const terminal = ['completed', 'cancelled'].includes(selected.category);
    const usedCount = board.data.board.tasks.filter((task) => task.status === selected.id).length;
    const protectedState = selected.id === 'backlog' || (['to-do', 'completed'].includes(selected.category) && draft.states.filter((item) => item.category === selected.category).length === 1);
    const unreachable = unreachableWorkflowStateIds(draft);

    async function save() {
        const errors = workflowErrors(draft);
        if (errors.length) { setError(`${t('workflow.invalid')} ${errors.join(' ')}`); return; }
        if (removed.some((item) => board.data.board.tasks.some((task) => task.status === item.id) && !draft.states.some((target) => target.id === relocations[item.id]))) {
            setSection('references'); setError(t('workflow.relocationRequired')); return;
        }
        const affected = board.data.board.tasks.filter((task) => original.states.find((item) => item.id === task.status)?.category !== draft.states.find((item) => item.id === task.status)?.category);
        if (affected.length && !(await showConfirm(t('workflow.impact', { count: affected.length }), { title: t('workflow.settings') }))) return;
        setBusy(true);
        try { await saveWorkflow(board.id, draft, relocations, close); }
        finally { setBusy(false); }
    }

    function addState() {
        const id = `state-${crypto.randomUUID()}`;
        update((value) => { value.states.push({ id, name: '', category: 'to-do', color: '#60a5fa' }); value.transitions[id] = []; });
        nextFocus.current = true; setSelectedId(id); setSection('states'); setError('');
    }

    function removeState() {
        if (protectedState || readOnly || busy) return;
        update((value) => {
            value.states.splice(index, 1); delete value.transitions[selected.id];
            Object.keys(value.transitions).forEach((id) => { value.transitions[id] = value.transitions[id].filter((target) => target !== selected.id); });
            if (!value.states.some((item) => item.category === selected.category)) delete value.references[selected.category];
        });
        setSelectedId(draft.states[index - 1]?.id || draft.states[index + 1].id);
    }

    function moveState(step: number) {
        update((value) => { [value.states[index], value.states[index + step]] = [value.states[index + step], value.states[index]]; });
    }

    function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next: Section = event.key === 'Home' ? 'states' : event.key === 'End' ? 'references' : section === 'states' ? 'references' : 'states';
        setSection(next);
        event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-section="${next}"]`)?.focus();
    }

    return <>
        <div className="workflow-tabs" role="tablist" aria-label={t('workflow.sections')}>
            {(['states', 'references'] as const).map((value) => <button key={value} type="button" role="tab" id={`${formId}-tab-${value}`} data-section={value} aria-controls={`${formId}-panel-${value}`} aria-selected={section === value} tabIndex={section === value ? 0 : -1} onClick={() => setSection(value)} onKeyDown={navigateTabs}>
                {t(value === 'states' ? 'workflow.statesAndTransitions' : 'workflow.generalSettings')}
                <span className="workflow-count" aria-hidden="true">{value === 'states' ? draft.states.length : removed.length || ''}</span>
            </button>)}
        </div>
        <div className="modal-body workflow-editor">
            {section === 'states' ? <div className="workflow-state-layout" role="tabpanel" id={`${formId}-panel-states`} aria-labelledby={`${formId}-tab-states`}>
                <aside className="workflow-state-sidebar"><div className="workflow-sidebar-heading"><h3>{t('workflow.states')}</h3><span>{draft.states.length}</span></div>
                    <nav className="workflow-state-list" aria-label={t('workflow.states')}>
                        {draft.states.map((item, position) => <button key={item.id} type="button" aria-pressed={selected.id === item.id} data-state-choice={item.id} onClick={() => { setSelectedId(item.id); setError(''); }}>
                            <span className="workflow-state-position">{String(position + 1).padStart(2, '0')}</span><StateDot state={item} />
                            <span className="workflow-state-list-text"><strong>{item.name || t('workflow.untitled')}</strong><span>{t(`workflow.${item.category}`)}</span></span>
                            {unreachable.has(item.id) ? <span className="workflow-state-issue" title={t('workflow.unreachable')}>!</span> : <span className="workflow-state-next-count" title={t('workflow.destinationCount', { count: (draft.transitions[item.id] || []).length })}>{(draft.transitions[item.id] || []).length} →</span>}
                        </button>)}
                    </nav>
                    {!readOnly && <button className="btn workflow-add-state" type="button" disabled={busy} onClick={addState}><span aria-hidden="true">＋</span> {t('workflow.addState')}</button>}
                </aside>
                <section className="workflow-state" data-workflow-state={selected.id} aria-labelledby={`${formId}-state-title`}>
                    <div className="workflow-state-heading"><div className="workflow-state-heading-name"><StateDot state={selected} /><h3 id={`${formId}-state-title`}>{selected.name || t('workflow.untitled')}</h3></div>
                        <div className="workflow-order-actions"><button className="btn" type="button" disabled={readOnly || busy || index === 0} aria-label={t('workflow.up')} title={t('workflow.up')} onClick={() => moveState(-1)}>↑</button>
                            <button className="btn" type="button" disabled={readOnly || busy || index === draft.states.length - 1} aria-label={t('workflow.down')} title={t('workflow.down')} onClick={() => moveState(1)}>↓</button></div>
                    </div>
                    <p className="workflow-state-description">{t('workflow.stateDescription')}</p>
                    <fieldset disabled={readOnly || busy} className="workflow-state-fields">
                        <label className="workflow-name-field" htmlFor={`${formId}-name`}>{t('task.title')}
                            <input id={`${formId}-name`} aria-label={`${t('task.title')} ${index + 1}`} ref={(input) => { if (input && nextFocus.current) { input.focus(); nextFocus.current = false; } }} key={selected.id} value={selected.name} onChange={(event) => update((value) => { value.states[index].name = event.target.value; })} />
                        </label>
                        <label>{t('workflow.category')}<WorkflowSelect label={t('workflow.category')} value={selected.category} disabled={selected.id === 'backlog' || readOnly || busy} onChange={(category) => update((value) => {
                            const previous = value.states[index].category;
                            value.states[index].category = category as WorkflowCategory;
                            if (!value.states.some((item) => item.category === previous)) delete value.references[previous];
                        })}>
                            {WORKFLOW_CATEGORIES.map((category) => <option key={category} value={category}>{t(`workflow.${category}`)}</option>)}
                        </WorkflowSelect></label>
                        <label className="workflow-color-field">{t('workflow.color')}<span className="workflow-color-control"><input type="color" aria-label={t('workflow.color')} value={selected.color} onChange={(event) => update((value) => { value.states[index].color = event.target.value; })} /><span>{selected.color.toUpperCase()}</span></span></label>
                    </fieldset>
                    <div className="workflow-transitions-heading"><div><h4>{t('workflow.destinations')}</h4><p>{t('workflow.transitionHint')}</p></div><span className="workflow-count">{targets.length}</span></div>
                    <fieldset className="workflow-transitions" disabled={readOnly || busy} aria-label={t('workflow.destinations')}>
                        {draft.states.filter((item) => item.id !== selected.id).map((target) => <label key={target.id} className={targets.includes(target.id) ? 'is-allowed' : ''}>
                            <input type="checkbox" checked={targets.includes(target.id)} aria-label={target.name || t('workflow.untitled')} onChange={(event) => update((value) => { value.transitions[selected.id] = event.target.checked ? [...(value.transitions[selected.id] || []), target.id] : (value.transitions[selected.id] || []).filter((id) => id !== target.id); })} />
                            <StateDot state={target} /><span><strong>{target.name || t('workflow.untitled')}</strong><span>{t(`workflow.${target.category}`)}</span></span>
                        </label>)}
                    </fieldset>
                    {!targets.length && <p className={`workflow-status-note${terminal ? '' : ' workflow-warning'}`}>{t(terminal ? 'workflow.terminalNote' : 'workflow.noOutgoing', { name: selected.name || selected.id })}</p>}
                    {unreachable.has(selected.id) && <p className="workflow-warning" role="status">{t('workflow.unreachable')}</p>}
                    <div className="workflow-state-bottom"><p>{t('workflow.stateUsage', { count: usedCount })}</p><button type="button" className="workflow-remove-state" disabled={readOnly || busy || protectedState} title={protectedState ? t('workflow.requiredState') : undefined} onClick={removeState}>{t('common.remove')}</button></div>
                    <details className="workflow-state-identity"><summary>{t('workflow.stableId')}</summary><code>{selected.id}</code></details>
                </section>
            </div> : <div role="tabpanel" id={`${formId}-panel-references`} aria-labelledby={`${formId}-tab-references`} className="workflow-general">
                <header><h3>{t('workflow.generalSettings')}</h3><p>{t('workflow.referencesHint')}</p></header>
                <fieldset disabled={readOnly || busy} className="workflow-reference-fields">
                    <label>{t('workflow.entry')}<WorkflowSelect label={t('workflow.entry')} value={draft.states.some((item) => item.id === draft.entryStateId && item.category === 'to-do') ? draft.entryStateId : ''} onChange={(id) => update((value) => { value.entryStateId = id; value.references['to-do'] = id; })}>
                        <option value="">{t('common.choose')}</option>{draft.states.filter((item) => item.category === 'to-do').map((item) => <option key={item.id} value={item.id}>{item.name || t('workflow.untitled')}</option>)}
                    </WorkflowSelect></label>
                    {WORKFLOW_CATEGORIES.filter((category) => !['backlog', 'to-do'].includes(category) && draft.states.some((item) => item.category === category)).map((category) => <label key={category}>{t('workflow.reference')} · {t(`workflow.${category}`)}
                        <WorkflowSelect label={`${t('workflow.reference')} · ${t(`workflow.${category}`)}`} value={draft.states.some((item) => item.id === draft.references[category] && item.category === category) ? draft.references[category]! : ''} onChange={(id) => update((value) => { value.references[category] = id; })}>
                            <option value="">{t('common.choose')}</option>{draft.states.filter((item) => item.category === category).map((item) => <option key={item.id} value={item.id}>{item.name || t('workflow.untitled')}</option>)}
                        </WorkflowSelect>
                    </label>)}
                </fieldset>
                {removed.length > 0 && <section className="workflow-relocations"><h4>{t('workflow.removedStates')}</h4>{removed.map((item) => <label key={item.id}>{t('workflow.relocate', { name: item.name, count: board.data.board.tasks.filter((task) => task.status === item.id).length })}
                    <WorkflowSelect label={t('workflow.relocate', { name: item.name, count: board.data.board.tasks.filter((task) => task.status === item.id).length })} disabled={readOnly || busy} value={relocations[item.id] || ''} onChange={(id) => setRelocations({ ...relocations, [item.id]: id })}>
                        <option value="">{t('common.choose')}</option>{draft.states.map((target) => <option key={target.id} value={target.id}>{target.name || t('workflow.untitled')}</option>)}
                    </WorkflowSelect></label>)}</section>}
                <div className="workflow-general-note"><span aria-hidden="true">ⓘ</span><p>{t('workflow.help')}</p></div>
            </div>}
        </div>
        {error && <div className="workflow-validation" role="alert">{error}</div>}
        <div className="modal-footer workflow-modal-footer"><span>{t(readOnly ? 'workflow.readOnlyNote' : 'workflow.draftNote')}</span><div><button className="btn" type="button" disabled={busy} onClick={close}>{t('common.cancel')}</button>{!readOnly && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void save()}>{t('common.save')}</button>}</div></div>
    </>;
}
