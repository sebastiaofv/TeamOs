import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { DialogPropsByName } from '@/features/portfolio/types';
import { closeDialog } from '@/app/overlays/dialogs';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { getProjectInfo, newLocalId, PROJECT_STATES, type ProjectInfo } from '@/domain/project';
import { useAppStore } from '@/features/portfolio/state/store';
import { isBoardInHistoricalPreview } from '@/features/portfolio/queries';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';
import { WorkflowSettings } from './WorkflowSettings';
import { getMaintenanceConfig } from '@/domain/applications';

export function ProjectWorkflowSettings() {
    const board = useAppStore((s) => s.portfolioBoards.find((b) => b.id === s.selectedPortfolioBoardId));
    const historical = useAppStore((s) => isBoardInHistoricalPreview(s, s.selectedPortfolioBoardId));
    if (!board) return null;
    return <><WorkflowSettings key={`${board.id}:${JSON.stringify(board.data.extensions.workflow)}`} board={board} readOnly={!board.handle || historical} />
        {getMaintenanceConfig(board.data)?.enabled && <WorkflowSettings key={`${board.id}:${JSON.stringify(board.data.extensions.maintenance)}`} board={board} readOnly={!board.handle || historical} maintenance />}</>;
}

export function ProjectSettingsDialog() {
    const props = useAppStore((s) => s.activeDialog === 'projectSettings' ? s.dialogProps as DialogPropsByName['projectSettings'] : null);
    const board = useAppStore((s) => s.portfolioBoards.find((b) => b.id === props?.boardId));
    const historical = useAppStore((s) => isBoardInHistoricalPreview(s, props?.boardId || ''));
    const returnFocus = useReturnFocus();
    const { t } = useI18n();
    return <Dialog.Root open={Boolean(props && board)} onOpenChange={(next) => { if (!next) closeDialog('projectSettings'); }}>
        <Dialog.Portal>
            <Dialog.Overlay className="modal active" id="projectSettingsModal">
                <Dialog.Content className="modal-content project-settings project-settings-dialog" id="projectSettings" aria-describedby={undefined}
                    onPointerDownOutside={keepOpenOnUndoToast} onEscapeKeyDown={escapeAnswersAppMessage} {...returnFocus}>
                    <div className="modal-header">
                        <div><Dialog.Title className="modal-title">{t('project.settings')}</Dialog.Title>
                            <p className="project-settings-name">{board?.title || board?.fileName}</p></div>
                        <Dialog.Close className="modal-close" aria-label={t('common.close')} title={t('common.close')}>&times;</Dialog.Close>
                    </div>
                    {board && <ProjectSettingsForm key={board.id} boardId={board.id} initial={getProjectInfo(board.data)} readOnly={!board.handle || historical} />}
                </Dialog.Content>
            </Dialog.Overlay>
        </Dialog.Portal>
    </Dialog.Root>;
}

function ProjectSettingsForm({ boardId, initial, readOnly }: { boardId: string; initial: ProjectInfo; readOnly: boolean }) {
    const { t } = useI18n();
    const { saveProjectSettings } = usePortfolioActions();
    const [info, setInfo] = useState(() => structuredClone(initial));
    const [saving, setSaving] = useState(false);
    const update = <K extends keyof ProjectInfo>(key: K, value: ProjectInfo[K]) => setInfo((current) => ({ ...current, [key]: value }));
    return <form onSubmit={async (event) => { event.preventDefault(); if (readOnly || saving) return; setSaving(true); try { if (await saveProjectSettings(boardId, info)) closeDialog('projectSettings'); } finally { setSaving(false); } }}>
        <div className="modal-body">
            {readOnly && <p className="project-review-notice">{t('common.readOnlyProject')}</p>}
            <fieldset disabled={readOnly || saving}>
                <div className="project-field-grid">
                    <label>{t('project.name')}<input required value={info.name} onChange={(e) => update('name', e.target.value)} /></label>
                    <label>{t('project.state')}<select value={info.state} onChange={(e) => update('state', e.target.value as ProjectInfo['state'])}>{PROJECT_STATES.map((state) => <option key={state} value={state}>{t(`project.${state}`)}</option>)}</select></label>
                    <label>{t('project.manager')}<input value={info.manager} onChange={(e) => update('manager', e.target.value)} /></label>
                    <label>{t('project.product')}<input value={info.product} onChange={(e) => update('product', e.target.value)} /></label>
                    <label>{t('task.description')}<textarea value={info.description} onChange={(e) => update('description', e.target.value)} /></label>
                    <label>{t('task.tags')}<input value={info.tags.join(', ')} onChange={(e) => update('tags', e.target.value.split(',').map((v) => v.trim()).filter(Boolean))} /></label>
                    {(['forecast', 'baseline', 'actual'] as const).map((kind) => <div key={kind} className="form-row">
                        <label>{t(`project.${kind}`)} · {t('project.start')}<input type="date" value={info[kind].start} onChange={(e) => update(kind, { ...info[kind], start: e.target.value })} /></label>
                        <label>{t('project.end')}<input type="date" min={info[kind].start} value={info[kind].end} onChange={(e) => update(kind, { ...info[kind], end: e.target.value })} /></label>
                    </div>)}
                </div>
                <h3>{t('project.team')}</h3>
                {info.team.map((member, index) => <div className="project-member-row" key={member.id}>
                    <label>{t('project.name')}<input value={member.name} onChange={(e) => update('team', info.team.map((m, i) => i === index ? { ...m, name: e.target.value } : m))} /></label>
                    <label>{t('project.role')}<input value={member.role} onChange={(e) => update('team', info.team.map((m, i) => i === index ? { ...m, role: e.target.value } : m))} /></label>
                    <label>Email<input type="email" value={member.email} onChange={(e) => update('team', info.team.map((m, i) => i === index ? { ...m, email: e.target.value } : m))} /></label>
                    <label><input type="checkbox" checked={member.active} onChange={(e) => update('team', info.team.map((m, i) => i === index ? { ...m, active: e.target.checked } : m))} />{t('project.active')}</label>
                    {member.provisional && <span>{t('project.provisional')}</span>}
                </div>)}
                <div className="project-actions"><button className="btn" type="button" onClick={() => update('team', [...info.team, { id: newLocalId('member'), name: '', role: '', email: '', active: true }])}>{t('project.addMember')}</button>
                    </div>
            </fieldset>
        </div>
        <div className="modal-footer">
            <Dialog.Close className="btn" disabled={saving}>{t(readOnly ? 'common.close' : 'common.cancel')}</Dialog.Close>
            {!readOnly && <button className="btn btn-primary" type="submit" disabled={saving}>{t('project.save')}</button>}
        </div>
    </form>;
}
