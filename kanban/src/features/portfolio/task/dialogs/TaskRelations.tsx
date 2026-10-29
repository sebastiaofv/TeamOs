import { workitemId, workitemLabel, workitemLabelFor } from '@/domain/taskIdentity';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { TaskRelationKind } from '@/domain/types';
import type { TaskDetailViewModel, TaskRelationEntry } from '@/features/portfolio/types';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

const GROUPS: TaskRelationKind[] = ['blockedBy', 'blocks', 'related'];

export function TaskRelations({ vm }: { vm: TaskDetailViewModel }) {
    const { t } = useI18n();
    const { associatePortfolioTasks, removePortfolioTaskRelation, openPortfolioCreateRelatedTask, openPortfolioTaskDetails } = usePortfolioActions();
    const [mode, setMode] = useState<'link' | 'create' | 'edit' | null>(null);
    const [search, setSearch] = useState('');
    const [otherId, setOtherId] = useState('');
    const [kind, setKind] = useState<TaskRelationKind | ''>('');
    const [busy, setBusy] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const searchRef = useRef<HTMLInputElement>(null);
    const activeOptionRef = useRef<HTMLButtonElement>(null);
    const query = otherId ? '' : search.trim().toLowerCase().replace(/^#/, '');
    const candidates = vm.relationCandidates.filter((task) => workitemId(task).toLowerCase().includes(query) || task.title.toLowerCase().includes(query));
    const activeTask = pickerOpen ? candidates[activeIndex] : undefined;
    const existing = GROUPS.some((group) => vm.relations[group].some((task) => task.id === Number(otherId)));
    const label = (task: TaskRelationEntry) => `${workitemLabel(task)} ${task.title} · ${task.status}${task.archived ? ` · ${t('table.archived')}` : ''}`;
    const start = (nextMode: 'link' | 'create' | 'edit', task?: TaskRelationEntry) => {
        setMode(nextMode);
        setSearch(task ? label(task) : '');
        setOtherId(task ? String(task.id) : '');
        setPickerOpen(false);
        setActiveIndex(-1);
        // Replacement requires an explicit choice, including the direction.
        setKind('');
    };
    useEffect(() => {
        activeOptionRef.current?.scrollIntoView({ block: 'nearest' });
    }, [activeTask?.id]);
    useEffect(() => {
        if (!pickerOpen) return;
        // Radix handles Escape in document capture, before the input's handler.
        const keepDialogOpen = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape' && event.target === searchRef.current) event.preventDefault();
        };
        window.addEventListener('keydown', keepDialogOpen, true);
        return () => window.removeEventListener('keydown', keepDialogOpen, true);
    }, [pickerOpen]);

    const selectTask = (task: TaskRelationEntry) => {
        setOtherId(String(task.id));
        setSearch(label(task));
        setKind('');
        searchRef.current?.focus();
        setPickerOpen(false);
        setActiveIndex(-1);
    };
    const onPickerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setPickerOpen(true);
            if (!candidates.length) return;
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const firstIndex = step === 1 ? 0 : candidates.length - 1;
            setActiveIndex(activeIndex < 0 ? firstIndex : (activeIndex + step + candidates.length) % candidates.length);
        } else if (event.key === 'Enter' && pickerOpen) {
            event.preventDefault();
            if (activeTask) selectTask(activeTask);
        } else if (event.key === 'Escape' && pickerOpen) {
            event.preventDefault();
            event.stopPropagation();
            setPickerOpen(false);
            setActiveIndex(-1);
        } else if (event.key === 'Tab') {
            setPickerOpen(false);
            setActiveIndex(-1);
        }
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
    const remove = async (taskId: number) => {
        if (busy) return;
        setBusy(true);
        try {
            if (await removePortfolioTaskRelation(vm.boardId, vm.taskId, taskId)) setMode(null);
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
                                    <div className="relation-row">
                                        <button type="button" className="relation-item-link" aria-label={`${workitemLabel(task)} ${task.title}${task.archived ? ` · ${t('table.archived')}` : ''}`}
                                            onClick={() => openPortfolioTaskDetails(vm.boardId, task.id,
                                            vm.readOnly ? { readOnly: true, boardData: vm.sourceBoardData } : {})}>
                                            {workitemLabel(task)}
                                        </button>
                                        <span className="relation-item-name" title={task.title}>
                                            <span className="relation-item-title">{task.title}</span>
                                            {task.archived && <span className="relation-item-archived">{t('table.archived')}</span>}
                                        </span>
                                        <span className={`relation-item-status table-status-badge status-${task.statusKey}`} aria-label={t('task.status')} title={task.status}>{task.status}</span>
                                        <span className="relation-item-responsible" aria-label={t('task.responsible')} title={task.responsible || undefined}>{task.responsible || '—'}</span>
                                        {!vm.readOnly && <div className="relation-row-actions">
                                            <button type="button" className="task-action-btn" aria-label={t('relations.edit')} title={t('relations.edit')}
                                                aria-expanded={mode === 'edit' && otherId === String(task.id)} disabled={busy}
                                                onClick={() => start('edit', task)}><span aria-hidden="true">&#9998;</span></button>
                                            <button type="button" className="task-action-btn task-action-danger" aria-label={t('common.remove')} title={t('common.remove')}
                                                disabled={busy} onClick={() => void remove(task.id)}><span aria-hidden="true">🗑️</span></button>
                                        </div>}
                                    </div>
                                    {!vm.readOnly && mode === 'edit' && otherId === String(task.id) &&
                                        <form className="relation-form relation-inline-editor" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                                            <label htmlFor={`relationEditKind-${task.id}`}>{t('relations.kind')}</label>
                                            <select id={`relationEditKind-${task.id}`} value={kind} disabled={busy}
                                                onChange={(event) => setKind(event.target.value as TaskRelationKind | '')} required>
                                                <option value="">{t('common.choose')}</option>
                                                {GROUPS.filter((choice) => choice !== group).map((choice) =>
                                                    <option value={choice} key={choice}>{t(`relations.choice.${choice}`)}</option>)}
                                            </select>
                                            {kind && <p className="relation-preview" role="status">{t(`relations.sentence.${kind}`, { a: workitemLabelFor(vm.sourceBoardData, vm.taskId), b: workitemLabel(task) })}</p>}
                                            <div className="relation-actions">
                                                <button type="submit" className="btn btn-primary" disabled={busy || !kind}>{t('common.save')}</button>
                                                <button type="button" className="btn" disabled={busy} onClick={() => setMode(null)}>{t('common.cancel')}</button>
                                            </div>
                                        </form>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}
            {!vm.readOnly && <>
                <div className="relation-actions">
                    <button type="button" className="btn" disabled={busy} onClick={() => start('link')}>{t('relations.link')}</button>
                    <button type="button" className="btn" disabled={busy} onClick={() => start('create')}>{t('relations.create')}</button>
                </div>
                {(mode === 'link' || mode === 'create') && <form className="relation-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                    {mode === 'link' && <>
                        <label htmlFor="relationSearch">{t('relations.search')}</label>
                        <div className="relation-picker" onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) {
                                setPickerOpen(false);
                                setActiveIndex(-1);
                            }
                        }}>
                            <input id="relationSearch" ref={searchRef} type="search" role="combobox" autoComplete="off"
                                aria-expanded={pickerOpen} aria-controls={pickerOpen ? 'relationOptions' : undefined}
                                aria-autocomplete="list" aria-activedescendant={activeTask ? `relation-option-${activeTask.id}` : undefined}
                                value={search} onFocus={() => setPickerOpen(true)} onClick={() => setPickerOpen(true)}
                                onKeyDown={onPickerKeyDown} onChange={(event) => {
                                    setSearch(event.target.value);
                                    setOtherId('');
                                    setKind('');
                                    setActiveIndex(-1);
                                    setPickerOpen(true);
                                }} />
                            {pickerOpen && <div className="relation-picker-dropdown">
                                <div id="relationOptions" role="listbox" aria-label={t('relations.search')}>
                                    {candidates.map((task, index) => <button type="button" role="option" tabIndex={-1}
                                        id={`relation-option-${task.id}`} key={task.id} aria-selected={String(task.id) === otherId}
                                        className={`relation-picker-option${activeIndex === index ? ' is-active' : ''}`}
                                        ref={activeIndex === index ? activeOptionRef : undefined}
                                        onMouseDown={(event) => event.preventDefault()} onClick={() => selectTask(task)}>{label(task)}</button>)}
                                </div>
                                {candidates.length === 0 && <p className="relation-help" aria-live="polite">{t('relations.noResults')}</p>}
                            </div>}
                        </div>
                        {existing && <p className="relation-help">{t('relations.existing')}</p>}
                    </>}
                    <label htmlFor="relationKind">{t('relations.kind')}</label>
                    <select id="relationKind" value={kind} onChange={(event) => setKind(event.target.value as TaskRelationKind | '')} required>
                        <option value="">{t('common.choose')}</option>
                        {GROUPS.map((group) => <option value={group} key={group}>{t(`relations.choice.${group}`)}</option>)}
                    </select>
                    {kind && (mode === 'create' || otherId) && <p className="relation-preview" role="status">{t(`relations.sentence.${kind}`, {
                        a: workitemLabelFor(vm.sourceBoardData, vm.taskId), b: mode === 'create' ? t('relations.newItem') : workitemLabelFor(vm.sourceBoardData, Number(otherId))
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
