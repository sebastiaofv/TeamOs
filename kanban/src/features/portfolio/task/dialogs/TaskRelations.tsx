import { useState } from 'react';
import type { TaskRelationKind } from '@/domain/types';
import type { TaskDetailViewModel, TaskRelationEntry } from '@/features/portfolio/types';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

const GROUPS: TaskRelationKind[] = ['blockedBy', 'blocks', 'related'];

export function TaskRelations({ vm }: { vm: TaskDetailViewModel }) {
    const { t } = useI18n();
    const { associatePortfolioTasks, removePortfolioTaskRelation, openPortfolioCreateRelatedTask, openPortfolioTaskDetails } = usePortfolioActions();
    const [mode, setMode] = useState<'link' | 'create' | null>(null);
    const [search, setSearch] = useState('');
    const [otherId, setOtherId] = useState('');
    const [kind, setKind] = useState<TaskRelationKind | ''>('');
    const [busy, setBusy] = useState(false);
    const query = search.trim().toLowerCase().replace(/^#/, '');
    const candidates = vm.relationCandidates.filter((task) => `${task.id}`.includes(query) || task.title.toLowerCase().includes(query));
    const existing = GROUPS.some((group) => vm.relations[group].some((task) => task.id === Number(otherId)));
    const label = (task: TaskRelationEntry) => `#${task.id} ${task.title} · ${task.status}${task.archived ? ` · ${t('table.archived')}` : ''}`;
    const start = (nextMode: 'link' | 'create', task?: TaskRelationEntry) => {
        setMode(nextMode);
        setSearch('');
        setOtherId(task ? String(task.id) : '');
        // Replacement requires an explicit choice, including the direction.
        setKind('');
    };
    const submit = async () => {
        if (!kind || busy) return;
        if (mode === 'create') {
            openPortfolioCreateRelatedTask(vm.boardId, vm.taskId, kind);
            return;
        }
        if (!otherId) return;
        setBusy(true);
        try {
            if (await associatePortfolioTasks(vm.boardId, vm.taskId, Number(otherId), kind, existing)) setMode(null);
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="task-relations" aria-labelledby="taskRelationsHeading">
            <h3 id="taskRelationsHeading">{t('relations.title')}</h3>
            <p className="relation-help">{t('relations.informative')}</p>
            {GROUPS.map((group) => (
                <div className="relation-group" role="group" aria-label={t(`relations.${group}`)} key={group}>
                    <h4>{t(`relations.${group}`)}</h4>
                    {vm.relations[group].length === 0 ? <p className="relation-help">{t('relations.empty')}</p> : (
                        <ul className="relation-list">
                            {vm.relations[group].map((task) => (
                                <li key={task.id}>
                                    <button type="button" className="relation-item-link" onClick={() => openPortfolioTaskDetails(vm.boardId, task.id,
                                        vm.readOnly ? { readOnly: true, boardData: vm.sourceBoardData } : {})}>{label(task)}</button>
                                    {!vm.readOnly && <div className="relation-actions">
                                        <button type="button" className="btn" onClick={() => start('link', task)}>{t('relations.replace')}</button>
                                        <button type="button" className="btn" onClick={() => void removePortfolioTaskRelation(vm.boardId, vm.taskId, task.id)}>{t('common.remove')}</button>
                                    </div>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}
            {!vm.readOnly && <>
                <div className="relation-actions">
                    <button type="button" className="btn" onClick={() => start('link')}>{t('relations.link')}</button>
                    <button type="button" className="btn" onClick={() => start('create')}>{t('relations.create')}</button>
                </div>
                {mode && <form className="relation-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                    {mode === 'link' && <>
                        <label htmlFor="relationSearch">{t('relations.search')}</label>
                        <input id="relationSearch" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setOtherId(''); }} />
                        <label htmlFor="relationTarget">{t('relations.select')}</label>
                        <select id="relationTarget" value={otherId} onChange={(event) => { setOtherId(event.target.value); setKind(''); }} required>
                            <option value="">{t('common.choose')}</option>
                            {candidates.map((task) => <option value={task.id} key={task.id}>{label(task)}</option>)}
                        </select>
                        {candidates.length === 0 && <p>{t('relations.noResults')}</p>}
                        {existing && <p className="relation-help">{t('relations.existing')}</p>}
                    </>}
                    <label htmlFor="relationKind">{t('relations.kind')}</label>
                    <select id="relationKind" value={kind} onChange={(event) => setKind(event.target.value as TaskRelationKind | '')} required>
                        <option value="">{t('common.choose')}</option>
                        {GROUPS.map((group) => <option value={group} key={group}>{t(`relations.choice.${group}`)}</option>)}
                    </select>
                    {kind && (mode === 'create' || otherId) && <p className="relation-preview" role="status">{t(`relations.sentence.${kind}`, {
                        a: `#${vm.taskId}`, b: mode === 'create' ? t('relations.newItem') : `#${otherId}`
                    })}</p>}
                    <div className="relation-actions">
                        <button type="button" className="btn" onClick={() => setMode(null)} disabled={busy}>{t('common.cancel')}</button>
                        <button type="submit" className="btn btn-primary" disabled={busy || !kind || (mode === 'link' && !otherId)}>
                            {t(mode === 'create' ? 'relations.create' : existing ? 'relations.replace' : 'common.confirm')}
                        </button>
                    </div>
                </form>}
            </>}
        </section>
    );
}
