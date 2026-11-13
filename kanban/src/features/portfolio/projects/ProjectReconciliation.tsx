import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '@/features/portfolio/state/store';
import { closeDialog, openDialog } from '@/app/overlays/dialogs';
import { useI18n } from '@/shared/i18n';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import type { MergeDecisions, ProjectConflict } from '@/domain/projectMerge';
import { projectHasUnsavedChanges, resolveProjectConflicts, restoreProjectRecovery } from '@/infrastructure/persistence/projectFiles';
import { isInConflict, type ProjectSaveState } from '@/infrastructure/persistence/projectSaveLifecycle';
import { listProjectRecovery, removeProjectRecovery, type ProjectRecovery } from '@/infrastructure/persistence/projectRecovery';
import { checkPortfolioFiles } from './projectCommands';

export function ProjectFileNotices() {
    const boards = useAppStore((state) => state.portfolioBoards);
    const states = useAppStore((state) => state.projectSaveStateById);
    const [recoveries, setRecoveries] = useState<ProjectRecovery[]>([]);
    const [error, setError] = useState('');
    const [refusedId, setRefusedId] = useState('');
    const { t } = useI18n();
    const projectIds = JSON.stringify(boards.filter((board) => board.handle).map((board) => board.data.extensions.project!.id));
    useEffect(() => {
        let active = true;
        void Promise.all((JSON.parse(projectIds) as string[]).map(listProjectRecovery)).then((entries) => {
            if (active) setRecoveries(entries.flat());
        }).catch((error: unknown) => { if (active) setError(String(error)); });
        return () => { active = false; };
    }, [projectIds]);
    return <section className="project-file-notices" aria-live="polite">
        {error && <p role="alert">{t('conflict.recoveryError', { error })}</p>}
        {boards.map((board) => {
            const state = states.get(board.id);
            return <div key={board.id}>
                {isInConflict(state) && <aside className="project-conflict-notice">
                    <span>{t('conflict.paused', { project: board.title })}</span>
                    <button className="btn" onClick={() => { void checkPortfolioFiles(); openDialog('projectReconciliation', { boardId: board.id }); }}>{t('conflict.resolve')}</button>
                    <small>{t('conflict.recoveryHelp')}</small>
                </aside>}
                {state?.notice?.kind === 'merged' && state.notice.merge.changes.length > 0 && <details className="project-merge-notice">
                    <summary>{t('conflict.merged', { count: state.notice.merge.changes.length })} {t('conflict.details')}</summary>
                    <ul>{state.notice.merge.changes.map((path) => <li key={path}>{path}</li>)}</ul>
                </details>}
                {state?.recoveryError && <p role="alert">{t('conflict.recoveryError', { error: state.recoveryError })}</p>}
                {recoveries.filter((draft) => draft.projectId === board.data.extensions.project?.id).map((draft) => <aside className="project-conflict-notice" key={draft.id}>
                    <span>{t('conflict.recovery', { project: board.title, at: new Date(draft.at).toLocaleString() })}</span>
                    <button className="btn" disabled={projectHasUnsavedChanges(board.id)} onClick={() => {
                        if (!restoreProjectRecovery(board.id, draft)) { setRefusedId(draft.id); return; }
                        setRecoveries((current) => current.filter((entry) => entry.id !== draft.id));
                        void checkPortfolioFiles();
                    }}>{t('conflict.restore')}</button>
                    {refusedId === draft.id && <p role="alert">{t('conflict.recoveryRefused')}</p>}
                    <button className="btn" onClick={() => { void removeProjectRecovery(draft.id).then(() => setRecoveries((current) => current.filter((entry) => entry.id !== draft.id))).catch((error: unknown) => setError(String(error))); }}>{t('conflict.discard')}</button>
                </aside>)}
            </div>;
        })}
    </section>;
}

function conflictLabel(conflict: ProjectConflict, tasks: { permanentId?: string; id: number; title: string }[]): string {
    const task = tasks.find((item) => conflict.path.includes(`[${item.permanentId}]`));
    return task ? `${task.title} (#${task.id}) · ${conflict.path.split(']').slice(1).join(']') || conflict.path}` : conflict.path;
}

function saveError(state: ProjectSaveState | undefined): string {
    if (state?.phase.kind === 'conflict' || state?.phase.kind === 'failed') return state.phase.error;
    return '';
}

function ReconciliationForm({ boardId }: { boardId: string }) {
    const board = useAppStore((state) => state.portfolioBoards.find((board) => board.id === boardId));
    const state = useAppStore((state) => state.projectSaveStateById.get(boardId));
    const [decisions, setDecisions] = useState<MergeDecisions>({});
    // `stillConflicting`: the last confirmation found new or changed conflicts.
    const [submit, setSubmit] = useState<'idle' | 'submitting' | 'stillConflicting'>('idle');
    const busy = submit === 'submitting';
    const { t } = useI18n();
    const conflicts = state?.phase.kind === 'conflict' ? state.phase.merge?.conflicts || [] : [];
    const all = (choice: 'local' | 'external') => setDecisions((current) => ({ ...current, ...Object.fromEntries(conflicts.map((conflict) => [conflict.key, choice])) }));
    const value = (data: unknown) => data === undefined ? t('conflict.missing') : JSON.stringify(data, (key, item: unknown) => key === 'dataUrl' ? '(image / attachment)' : item, 2);
    return <>
        <div className="modal-header">
            <div><Dialog.Title className="modal-title">{t('conflict.title')} · {board?.title}</Dialog.Title>
                <Dialog.Description className="reconciliation-description">{t('conflict.help')}</Dialog.Description></div>
            <Dialog.Close className="modal-close" aria-label={t('common.close')}>×</Dialog.Close>
        </div>
        <div className="modal-body">
            {conflicts.some((conflict) => conflict.reason === 'regression') && <p role="note">{t('conflict.regression')}</p>}
            <div className="reconciliation-actions">
                <button className="btn" disabled={busy} onClick={() => all('local')}>{t('conflict.allLocal')}</button>
                <button className="btn" disabled={busy} onClick={() => all('external')}>{t('conflict.allExternal')}</button>
            </div>
            {conflicts.map((conflict) => <fieldset className="reconciliation-conflict" key={conflict.key} disabled={busy}>
                <legend>{conflictLabel(conflict, board?.data.board.tasks || [])}</legend>
                {conflict.reason === 'integrity' && <p>{t('conflict.integrity', { error: conflict.message || '' })}</p>}
                <div className="reconciliation-values">
                    <div><strong>{t('conflict.base')}</strong><pre>{value(conflict.base)}</pre></div>
                    {(['local', 'external'] as const).map((side) => <label key={side}>
                        <input type="radio" name={conflict.key} checked={decisions[conflict.key] === side} onChange={() => setDecisions((current) => ({ ...current, [conflict.key]: side }))} />
                        {t(side === 'local' ? 'conflict.local' : 'conflict.external')}
                        <pre>{value(conflict[side])}</pre>
                    </label>)}
                </div>
            </fieldset>)}
        </div>
        {submit === 'stillConflicting' && <p className="reconciliation-description reconciliation-error" role="status">{saveError(state) || t('conflict.changed')}</p>}
        <div className="modal-footer">
            <button className="btn" disabled={busy} onClick={() => closeDialog('projectReconciliation')}>{t('conflict.defer')}</button>
            <button className="btn btn-primary" disabled={busy || conflicts.some((conflict) => !decisions[conflict.key])} onClick={async () => {
                setSubmit('submitting');
                let resolved = false;
                try { resolved = await resolveProjectConflicts(boardId, decisions); }
                finally { setSubmit(resolved ? 'idle' : 'stillConflicting'); }
                if (resolved) closeDialog('projectReconciliation');
            }}>{t('conflict.confirm')}</button>
        </div>
    </>;
}

export function ProjectReconciliationDialog() {
    const boardId = useAppStore((state) => state.activeDialog === 'projectReconciliation' ? (state.dialogProps as { boardId: string }).boardId : '');
    const focus = useReturnFocus();
    return <Dialog.Root open={Boolean(boardId)} onOpenChange={(open) => { if (!open) closeDialog('projectReconciliation'); }}>
        <Dialog.Portal><Dialog.Overlay className="modal active" id="projectReconciliationModal">
            <Dialog.Content className="modal-content reconciliation-dialog" {...focus}>
                {boardId && <ReconciliationForm key={boardId} boardId={boardId} />}
            </Dialog.Content>
        </Dialog.Overlay></Dialog.Portal>
    </Dialog.Root>;
}
