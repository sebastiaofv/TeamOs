import { useState } from 'react';
import type { BoardData } from '@/domain/types';
import { getProjectPlan, orderedPhases } from '@/domain/projectPlan';
import { phaseDateVariance } from '@/domain/dateVariance';
import { getRoadmapDayDiff, getRoadmapTimelinePlacement, getRoadmapTodayMarker, parseRoadmapIsoDate } from '@/domain/roadmap';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';
import type { ProjectDates } from '@/domain/project';

export function DateAnalysis({ boardId, data, readOnly }: { boardId: string; data: BoardData; readOnly: boolean }) {
    const { t } = useI18n();
    const actions = usePortfolioActions();
    const [reference, setReference] = useState<'original' | 'latest'>('original');
    const [approvalReason, setApprovalReason] = useState('');
    const [editingId, setEditingId] = useState('');
    const [from, setFrom] = useState(''), [to, setTo] = useState('');
    const phases = orderedPhases(data).filter((phase) => (!from || (phase.endDate || '') >= from) && (!to || (phase.startDate || '') <= to)), plan = getProjectPlan(data);
    const allDates = phases.flatMap((phase) => {
        const dates = phaseDateVariance(data, phase.id, reference);
        return [dates.baseline?.start, dates.baseline?.end, dates.forecast.start, dates.forecast.end, dates.actual?.start, dates.actual?.end];
    }).filter((value): value is string => Boolean(value)).map((value) => parseRoadmapIsoDate(value)!).filter(Boolean).sort((a, b) => a.getTime() - b.getTime());
    const start = allDates[0], end = allDates.at(-1);
    const range = start && end ? { start, end, totalDays: Math.max(1, getRoadmapDayDiff(start, end)) } : null;
    const todayMarker = getRoadmapTodayMarker(range);
    const displayDates = (dates?: ProjectDates) => dates?.start || dates?.end ? `${dates.start || t('plan.na')} → ${dates.end || t('plan.na')}` : t('plan.na');
    const days = (value: number | null) => value == null ? t('plan.na') : `${value > 0 ? '+' : ''}${value} ${t('dates.days')}`;
    return <section className="date-analysis" id="projectDateAnalysis"><h2>{t('dates.title')}</h2>
        <p className="muted">{t('dates.formula')}</p>
        <div className="dashboard-controls"><label>{t('dates.reference')}<select aria-label={t('dates.reference')} value={reference} onChange={(e) => setReference(e.target.value as typeof reference)}><option value="original">{t('dates.original')}</option><option value="latest">{t('dates.latest')}</option></select></label>
            <label>{t('dates.from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>{t('dates.to')}<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
            <div className="date-legend"><span className="baseline">{t('project.baseline')}</span><span className="forecast">{t('project.forecast')}</span><span className="actual">{t('project.actual')}</span></div>
        </div>
        {!phases.length ? <p>{t('dates.empty')}</p> : <div className="dashboard-table-scroll"><table className="dashboard-table"><thead><tr><th>{t('task.phase')}</th><th>{t('project.baseline')}</th><th>{t('project.forecast')}</th><th>{t('project.actual')}</th><th>{t('dates.forecastVariance')}</th><th>{t('dates.actualVariance')}</th><th>Gantt</th><th>{t('table.actions')}</th></tr></thead><tbody>
            {phases.map((phase) => {
                const dates = phaseDateVariance(data, phase.id, reference);
                return <tr key={phase.id}><th scope="row">{phase.title}</th><td>{displayDates(dates.baseline)}</td><td>{displayDates(dates.forecast)}</td><td>{displayDates(dates.actual)}</td><td>{days(dates.forecastDays)}</td><td>{days(dates.actualDays)}</td><td><div className="analysis-gantt" aria-hidden="true">
                    {range && ([['baseline', dates.baseline], ['forecast', dates.forecast], ['actual', dates.actual]] as const).map(([kind, dates]) => {
                        const placement = dates?.start && dates.end ? getRoadmapTimelinePlacement({ id: phase.id, title: phase.title, startDate: dates.start, endDate: dates.end }, range) : null;
                        return placement && <span key={kind} className={kind} style={{ left: `${placement.left}%`, width: `${Math.max(placement.width, 1)}%` }} />;
                    })}
                    {todayMarker && <i className="analysis-today" style={{ left: `${todayMarker.position}%` }} />}
                </div></td><td>{!readOnly && <><button type="button" className="btn-text" onClick={() => setEditingId(editingId === phase.id ? '' : phase.id)}>{t('dates.record')}</button><button type="button" className="btn-text" onClick={() => actions.openRoadmapEntityModal('phases', phase.id, { boardId })}>{t('project.forecast')}</button></>}</td></tr>;
            })}
        </tbody></table></div>}
        {!readOnly && phases.some((phase) => !plan.phases[phase.id]?.baseline) && <form className="dashboard-controls" onSubmit={async (e) => { e.preventDefault(); if (await actions.approveProjectBaseline(boardId, approvalReason)) setApprovalReason(''); }}><label>{t('dates.reason')}<input required value={approvalReason} onChange={(e) => setApprovalReason(e.target.value)} /></label><button type="submit" className="btn btn-primary">{t('dates.approve')}</button></form>}
        {!readOnly && editingId && <PhaseDatesForm key={`${editingId}:${JSON.stringify(plan.phases[editingId])}`} boardId={boardId} phaseId={editingId} data={data} />}
    </section>;
}

function PhaseDatesForm({ boardId, phaseId, data }: { boardId: string; phaseId: string; data: BoardData }) {
    const { t } = useI18n(); const actions = usePortfolioActions();
    const detail = getProjectPlan(data).phases[phaseId];
    const [actual, setActual] = useState(detail?.actual || { start: '', end: '' }), [reason, setReason] = useState('');
    return <div className="phase-dates-editor"><h3>{t('dates.record')}</h3><form className="dashboard-controls" onSubmit={(event) => { event.preventDefault(); void actions.saveProjectPhaseActual(boardId, phaseId, actual); }}>
        <label>{t('dates.actualStart')}<input type="date" value={actual.start} onChange={(e) => setActual({ ...actual, start: e.target.value })} /></label><label>{t('dates.actualEnd')}<input type="date" min={actual.start} value={actual.end} onChange={(e) => setActual({ ...actual, end: e.target.value })} /></label><button className="btn btn-primary" type="submit">{t('dates.saveActual')}</button>
    </form>{detail?.baseline && <form className="dashboard-controls" onSubmit={(event) => { event.preventDefault(); void actions.reviseProjectPhaseBaseline(boardId, phaseId, reason); }}><p className="muted">{t('dates.revisionHint')}</p><label>{t('dates.reason')}<input required value={reason} onChange={(e) => setReason(e.target.value)} /></label><button className="btn" type="submit">{t('dates.revise')}</button></form>}
        <ol>{detail?.baselineRevisions?.map((revision, index) => <li key={`${revision.at}:${index}`}>{index + 1} · {new Date(revision.at).toLocaleString()} · {revision.dates.start} → {revision.dates.end} · {revision.reason}</li>)}</ol>
    </div>;
}
