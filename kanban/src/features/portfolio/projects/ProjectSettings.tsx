import { useState } from 'react';
import { getProjectInfo, newLocalId, PROJECT_STATES, type ProjectInfo } from '@/domain/project';
import { useAppStore } from '@/features/portfolio/state/store';
import { isBoardInHistoricalPreview } from '@/features/portfolio/queries';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';
import { WorkflowSettings } from './WorkflowSettings';

export function ProjectSettings() {
    const board = useAppStore((s) => s.portfolioBoards.find((b) => b.id === s.selectedPortfolioBoardId));
    const historical = useAppStore((s) => isBoardInHistoricalPreview(s, s.selectedPortfolioBoardId));
    if (!board) return null;
    const project = getProjectInfo(board.data);
    return <><ProjectSettingsForm key={`${board.id}:${JSON.stringify(project)}`} boardId={board.id} initial={project} readOnly={!board.handle || historical} />
        <WorkflowSettings key={`${board.id}:${JSON.stringify(board.data.extensions.workflow)}`} board={board} readOnly={!board.handle || historical} /></>;
}

function ProjectSettingsForm({ boardId, initial, readOnly }: { boardId: string; initial: ProjectInfo; readOnly: boolean }) {
    const { t } = useI18n();
    const { saveProjectSettings } = usePortfolioActions();
    const [info, setInfo] = useState(() => structuredClone(initial));
    const [saving, setSaving] = useState(false);
    const update = <K extends keyof ProjectInfo>(key: K, value: ProjectInfo[K]) => setInfo((current) => ({ ...current, [key]: value }));
    return <details className="project-settings" id="projectSettings">
        <summary>{t('project.settings')} · {initial.name}{initial.needsReview ? ` · ${t('project.review')}` : ''}</summary>
        <form onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { await saveProjectSettings(boardId, info); } finally { setSaving(false); } }}>
            <p className="muted">{t('project.localIdentity')} · ID: {info.id}</p>
            <fieldset disabled={readOnly || saving}>
                <div className="project-field-grid">
                    <label>{t('project.name')}<input required value={info.name} onChange={(e) => update('name', e.target.value)} /></label>
                    <label>{t('project.state')}<select value={info.state} onChange={(e) => update('state', e.target.value as ProjectInfo['state'])}>{PROJECT_STATES.map((state) => <option key={state} value={state}>{t(`project.${state}`)}</option>)}</select></label>
                    <label>{t('project.manager')}<input required value={info.manager} onChange={(e) => update('manager', e.target.value)} /></label>
                    <label>{t('project.product')}<input required value={info.product} onChange={(e) => update('product', e.target.value)} /></label>
                    <label>{t('task.description')}<textarea required value={info.description} onChange={(e) => update('description', e.target.value)} /></label>
                    <label>{t('task.tags')}<input required value={info.tags.join(', ')} onChange={(e) => update('tags', e.target.value.split(',').map((v) => v.trim()).filter(Boolean))} /></label>
                    {(['forecast', 'baseline', 'actual'] as const).map((kind) => <div key={kind} className="form-row">
                        <label>{t(`project.${kind}`)} · {t('project.start')}<input type="date" required={kind === 'forecast'} value={info[kind].start} onChange={(e) => update(kind, { ...info[kind], start: e.target.value })} /></label>
                        <label>{t('project.end')}<input type="date" required={kind === 'forecast'} min={info[kind].start} value={info[kind].end} onChange={(e) => update(kind, { ...info[kind], end: e.target.value })} /></label>
                    </div>)}
                </div>
                <h3>{t('project.team')}</h3>
                {info.team.map((member, index) => <div className="project-member-row" key={member.id}>
                    <label>{t('project.name')}<input required value={member.name} onChange={(e) => update('team', info.team.map((m, i) => i === index ? { ...m, name: e.target.value } : m))} /></label>
                    <label>{t('project.role')}<input value={member.role} onChange={(e) => update('team', info.team.map((m, i) => i === index ? { ...m, role: e.target.value } : m))} /></label>
                    <label>Email<input type="email" value={member.email} onChange={(e) => update('team', info.team.map((m, i) => i === index ? { ...m, email: e.target.value } : m))} /></label>
                    <label><input type="checkbox" checked={member.active} onChange={(e) => update('team', info.team.map((m, i) => i === index ? { ...m, active: e.target.checked } : m))} />{t('project.active')}</label>
                    {member.provisional && <span>{t('project.provisional')}</span>}
                </div>)}
                <div className="project-actions"><button className="btn" type="button" onClick={() => update('team', [...info.team, { id: newLocalId('member'), name: '', role: '', email: '', active: true }])}>{t('project.addMember')}</button>
                    <button className="btn" type="button" onClick={() => setInfo(structuredClone(initial))}>{t('common.cancel')}</button>
                    <button className="btn btn-primary" type="submit">{t('project.save')}</button></div>
            </fieldset>
        </form>
    </details>;
}
