import type { BoardData } from './types';
import { getProjectPlan } from './projectPlan';
import { getRoadmapExtension, parseRoadmapIsoDate } from './roadmap';
import { validateDatePair, type ProjectDates } from './project';
import { nowIso } from './util';

export function calendarDateDifference(date: string | undefined, baseline: string | undefined): number | null {
    const end = parseRoadmapIsoDate(date), start = parseRoadmapIsoDate(baseline);
    return end && start ? Math.round((end.getTime() - start.getTime()) / 86400000) : null;
}
export function phaseDateVariance(data: BoardData, phaseId: string, reference: 'original' | 'latest' = 'original') {
    const phase = getRoadmapExtension(data)?.phases.find((phase) => phase.id === phaseId);
    const details = getProjectPlan(data).phases[phaseId];
    const latest = details?.baselineRevisions?.at(-1)?.dates;
    const baseline = reference === 'latest' ? latest || details?.baseline : details?.baseline;
    return { baseline, forecast: { start: phase?.startDate || '', end: phase?.endDate || '' }, actual: details?.actual,
        forecastDays: calendarDateDifference(phase?.endDate, baseline?.end), actualDays: calendarDateDifference(details?.actual?.end, baseline?.end) };
}
export function approvePlanBaseline(data: BoardData, reason: string): void {
    if (!reason.trim()) throw new Error('Provide the baseline approval reason.');
    const plan = getProjectPlan(data), phases = getRoadmapExtension(data)?.phases || [];
    if (!phases.length) throw new Error('Create a project plan first.');
    for (const phase of phases) {
        const detail = plan.phases[phase.id] || { parentId: '' };
        if (detail.baseline) continue;
        const dates = { start: phase.startDate || '', end: phase.endDate || '' };
        validateDatePair(dates);
        plan.phases[phase.id] = { ...detail, baseline: dates, baselineRevisions: [{ at: nowIso(), reason: reason.trim(), dates: { ...dates } }] };
    }
    data.extensions.projectPlan = plan;
}
export function revisePhaseBaseline(data: BoardData, phaseId: string, reason: string): void {
    if (!reason.trim()) throw new Error('Provide the baseline revision reason.');
    const plan = getProjectPlan(data), detail = plan.phases[phaseId];
    const phase = getRoadmapExtension(data)?.phases.find((phase) => phase.id === phaseId);
    if (!phase || !detail?.baseline) throw new Error('Approve an original baseline first.');
    const dates = { start: phase.startDate || '', end: phase.endDate || '' };
    validateDatePair(dates);
    plan.phases[phaseId] = { ...detail, baselineRevisions: [...(detail.baselineRevisions || []), { at: nowIso(), reason: reason.trim(), dates }] };
    data.extensions.projectPlan = plan;
}
export function setPhaseActualDates(data: BoardData, phaseId: string, dates: ProjectDates): void {
    validateDatePair(dates);
    if (dates.end && !dates.start) throw new Error('Actual completion requires an actual start date.');
    if (!getRoadmapExtension(data)?.phases.some((phase) => phase.id === phaseId)) throw new Error('Phase no longer exists.');
    const plan = getProjectPlan(data);
    plan.phases[phaseId] = { ...(plan.phases[phaseId] || { parentId: '' }), actual: dates };
    data.extensions.projectPlan = plan;
}
