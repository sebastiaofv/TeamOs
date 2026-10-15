import { useState } from 'react';
import type { BoardRecord } from '@/features/portfolio/types';
import { getWorkflow, getTaskWorkflow, WORKFLOW_CATEGORIES, type Workflow, type WorkflowState } from '@/domain/workflow';
import { newLocalId } from '@/domain/project';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

export function WorkflowSettings({ board, readOnly, maintenance = false }: { board: BoardRecord; readOnly: boolean; maintenance?: boolean }) {
    const { t } = useI18n();
    const { saveProjectWorkflow } = usePortfolioActions();
    const original = maintenance ? getTaskWorkflow(board.data, { workContext: 'maintenance' }) : getWorkflow(board.data);
    const [workflow, setWorkflow] = useState<Workflow>(() => structuredClone(original));
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const updateState = (index: number, patch: Partial<WorkflowState>) => setWorkflow((current) => ({ ...current, states: current.states.map((state, i) => i === index ? { ...state, ...patch } : state) }));
    return <details className="project-settings" id={maintenance ? 'maintenanceWorkflowSettings' : 'workflowSettings'}><summary>{t(maintenance ? 'maintenance.workflow' : 'workflow.title')}</summary>
        <form onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { await saveProjectWorkflow(board.id, workflow, mapping, maintenance); } finally { setSaving(false); } }}>
            <fieldset disabled={readOnly || saving}>
                <p className="muted">{t('workflow.hint')}</p>
                {workflow.states.map((state, index) => <div className="project-member-row" key={state.id}>
                    <label>{t('project.name')}<input aria-label={`${t('project.name')} ${index + 1}`} required value={state.name} onChange={(e) => updateState(index, { name: e.target.value })} /></label>
                    <label>{t('workflow.category')}<select value={state.category} onChange={(e) => updateState(index, { category: e.target.value as WorkflowState['category'] })}>{WORKFLOW_CATEGORIES.map((category) => <option key={category} value={category}>{t(`workflow.${category}`)}</option>)}</select></label>
                    <label>{t('workflow.color')}<input type="color" value={state.color} onChange={(e) => updateState(index, { color: e.target.value })} /></label>
                    <button type="button" className="btn" disabled={index === 0} aria-label={`${t('workflow.up')} ${state.name}`} onClick={() => setWorkflow((current) => { const states = [...current.states]; [states[index - 1], states[index]] = [states[index], states[index - 1]]; return { ...current, states }; })}>↑</button>
                    <button type="button" className="btn" onClick={() => setWorkflow((current) => ({ ...current, states: current.states.filter((s) => s.id !== state.id), transitions: current.transitions.filter((tr) => tr.from !== state.id && tr.to !== state.id) }))}>{t('common.remove')}</button>
                </div>)}
                <button type="button" className="btn" disabled={workflow.states.length >= 20} onClick={() => setWorkflow((current) => ({ ...current, states: [...current.states, { id: newLocalId('wf'), name: '', color: '#6688aa', category: 'in-progress' }] }))}>{t('workflow.add')}</button>
                <label>{t('workflow.initial')}<select value={workflow.initialStateId} onChange={(e) => setWorkflow({ ...workflow, initialStateId: e.target.value })}>{workflow.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
                {original.states.filter((state) => !workflow.states.some((s) => s.id === state.id) && board.data.board.tasks.some((task) => task.status === state.id && (task.workContext === 'maintenance') === maintenance)).map((state) => <label key={state.id}>{t('workflow.map')} {state.name}<select required value={mapping[state.id] || ''} onChange={(e) => setMapping({ ...mapping, [state.id]: e.target.value })}><option value="">{t('common.choose')}</option>{workflow.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>)}
                <h3>{t('workflow.transitions')}</h3>
                {workflow.states.map((from) => <details key={from.id}><summary>{from.name} →</summary><div className="project-member-row">{workflow.states.filter((to) => to.id !== from.id).map((to) => {
                    const enabled = workflow.transitions.some((tr) => tr.from === from.id && tr.to === to.id);
                    return <label key={to.id}><input type="checkbox" aria-label={`${from.name} → ${to.name}`} checked={enabled} onChange={(e) => setWorkflow((current) => ({ ...current, transitions: e.target.checked ? [...current.transitions, { from: from.id, to: to.id }] : current.transitions.filter((tr) => tr.from !== from.id || tr.to !== to.id) }))} />{to.name}</label>;
                })}</div></details>)}
                <div className="project-actions"><button className="btn btn-primary" type="submit">{t('workflow.save')}</button></div>
            </fieldset>
        </form>
    </details>;
}
