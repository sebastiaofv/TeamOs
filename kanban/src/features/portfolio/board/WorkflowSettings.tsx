import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { BoardRecord } from '@/features/portfolio/types';
import type { Workflow } from '@/domain/types';
import { getWorkflow, WORKFLOW_CATEGORIES, workflowErrors } from '@/domain/workflow';
import { cloneSerializable } from '@/domain/serializable';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { showConfirm } from '@/app/overlays/appMessages';
import { useI18n } from '@/shared/i18n';
import { useAppStore } from '@/features/portfolio/state/store';
import { isBoardInHistoricalPreview } from '@/features/portfolio/queries';

export function WorkflowSettings() {
    const board = useAppStore((s) => s.portfolioBoards.find((b) => b.id === s.selectedPortfolioBoardId));
    const historical = useAppStore((s) => isBoardInHistoricalPreview(s, s.selectedPortfolioBoardId));
    const [open, setOpen] = useState(false);
    const { t } = useI18n();
    if (!board) return null;
    return <><button className="btn" onClick={() => setOpen(true)}>{t('workflow.settings')}</button>
        <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="modal active">
            <Dialog.Content className="modal-content workflow-dialog" aria-describedby={undefined} onKeyDown={(event) => event.stopPropagation()}>
                <div className="modal-header"><Dialog.Title>{t('workflow.settings')}</Dialog.Title><Dialog.Close className="modal-close" aria-label={t('common.close')}>×</Dialog.Close></div>
                {open && <WorkflowEditor board={board} readOnly={!board.handle || historical} close={() => setOpen(false)} />}
            </Dialog.Content>
        </Dialog.Overlay></Dialog.Portal></Dialog.Root></>;
}

function WorkflowEditor({ board, readOnly, close }: { board: BoardRecord; readOnly: boolean; close: () => void }) {
    const { t } = useI18n();
    const { saveWorkflow } = usePortfolioActions();
    const original = getWorkflow(board.data);
    const [draft, setDraft] = useState<Workflow>(() => cloneSerializable(original));
    const [relocations, setRelocations] = useState<Record<string, string>>({});
    const [error, setError] = useState('');
    const update = (fn: (value: Workflow) => void) => setDraft((value) => { const next = cloneSerializable(value); fn(next); return next; });
    const removed = original.states.filter((s) => !draft.states.some((d) => d.id === s.id));
    async function save() {
        const errors = workflowErrors(draft);
        if (errors.length) { setError(`${t('workflow.invalid')} ${errors.join(' ')}`); return; }
        const affected = board.data.board.tasks.filter((task) => original.states.find((s) => s.id === task.status)?.category !== draft.states.find((s) => s.id === task.status)?.category);
        if (affected.length && !(await showConfirm(t('workflow.impact', { count: affected.length }), { title: t('workflow.settings') }))) return;
        await saveWorkflow(board.id, draft, relocations, close);
    }
    return <><div className="modal-body workflow-editor">
        <p className="field-hint">{t('workflow.help')}</p>
        <fieldset disabled={readOnly}>
            {draft.states.map((state, index) => <section className="workflow-state" data-workflow-state={state.id} key={state.id}>
                <div className="workflow-state-fields">
                    <label>{t('task.title')}<input aria-label={`${t('task.title')} ${index + 1}`} value={state.name} onChange={(e) => update((d) => { d.states[index].name = e.target.value; })} /></label>
                    <label>{t('workflow.color')}<input type="color" value={state.color} onChange={(e) => update((d) => { d.states[index].color = e.target.value; })} /></label>
                    <label>{t('workflow.category')}<select value={state.category} disabled={state.id === 'backlog' || readOnly} onChange={(e) => update((d) => { d.states[index].category = e.target.value as typeof state.category; })}>{WORKFLOW_CATEGORIES.map((c) => <option key={c} value={c}>{t(`workflow.${c}`)}</option>)}</select></label>
                    <button type="button" className="btn" disabled={index === 0} aria-label={t('workflow.up')} onClick={() => update((d) => { [d.states[index - 1], d.states[index]] = [d.states[index], d.states[index - 1]]; })}>↑</button>
                    <button type="button" className="btn" disabled={state.id === 'backlog'} onClick={() => update((d) => { d.states.splice(index, 1); delete d.transitions[state.id]; Object.keys(d.transitions).forEach((id) => { d.transitions[id] = d.transitions[id].filter((target) => target !== state.id); }); })}>{t('common.remove')}</button>
                </div>
                <div className="workflow-transitions"><span>{t('workflow.destinations')}</span>{draft.states.filter((s) => s.id !== state.id).map((target) => <label key={target.id}><input type="checkbox" checked={(draft.transitions[state.id] || []).includes(target.id)} onChange={(e) => update((d) => { d.transitions[state.id] = e.target.checked ? [...(d.transitions[state.id] || []), target.id] : (d.transitions[state.id] || []).filter((id) => id !== target.id); })} />{target.name}</label>)}</div>
                {!['completed', 'cancelled'].includes(state.category) && !(draft.transitions[state.id] || []).length && <p className="workflow-warning" role="status">{t('workflow.noOutgoing', { name: state.name || state.id })}</p>}
            </section>)}
            <button className="btn" onClick={() => update((d) => { const id = `state-${crypto.randomUUID()}`; d.states.push({ id, name: '', category: 'to-do', color: '#60a5fa' }); d.transitions[id] = []; })}>{t('workflow.addState')}</button>
            <label>{t('workflow.entry')}<select value={draft.entryStateId} onChange={(e) => update((d) => { d.entryStateId = e.target.value; d.references['to-do'] = e.target.value; })}><option value="">—</option>{draft.states.filter((s) => s.category === 'to-do').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            {WORKFLOW_CATEGORIES.filter((c) => !['backlog', 'to-do'].includes(c) && draft.states.some((s) => s.category === c)).map((c) => <label key={c}>{t('workflow.reference')} · {t(`workflow.${c}`)}<select value={draft.references[c] || ''} onChange={(e) => update((d) => { d.references[c] = e.target.value; })}><option value="">—</option>{draft.states.filter((s) => s.category === c).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>)}
            {removed.map((s) => <label key={s.id}>{t('workflow.relocate', { name: s.name, count: board.data.board.tasks.filter((task) => task.status === s.id).length })}<select value={relocations[s.id] || ''} onChange={(e) => setRelocations({ ...relocations, [s.id]: e.target.value })}><option value="">—</option>{draft.states.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>)}
        </fieldset>
        {error && <p role="alert">{error}</p>}
    </div><div className="modal-footer"><button className="btn" onClick={close}>{t('common.cancel')}</button>{!readOnly && <button className="btn btn-primary" onClick={() => void save()}>{t('common.save')}</button>}</div></>;
}
