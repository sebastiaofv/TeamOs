import { expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { approvePlanBaseline, calendarDateDifference, phaseDateVariance, revisePhaseBaseline, setPhaseActualDates } from '../../src/domain/dateVariance';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { getProjectPlan } from '../../src/domain/projectPlan';

it('keeps original baseline, revisions, forecast and actual separate across reopens', () => {
    const data = createEmptyProjectData('Dates');
    data.extensions.roadmap = { version: 1, milestones: [], sprints: [], phases: [{ id: 'p', title: 'Phase', startDate: '2026-01-01', endDate: '2026-01-10' }] };
    expect(phaseDateVariance(data, 'p').forecastDays).toBeNull();
    approvePlanBaseline(data, 'Approved plan');
    data.extensions.roadmap.phases[0].endDate = '2026-01-15';
    revisePhaseBaseline(data, 'p', 'Scope increase');
    setPhaseActualDates(data, 'p', { start: '2026-01-02', end: '2026-01-17' });
    const reopened = serializeBoardDataFromObject(data);
    expect(phaseDateVariance(reopened, 'p')).toMatchObject({ forecastDays: 5, actualDays: 7 });
    expect(phaseDateVariance(reopened, 'p', 'latest')).toMatchObject({ forecastDays: 0, actualDays: 2 });
    expect(getProjectPlan(reopened).phases.p.baseline?.end).toBe('2026-01-10');
    expect(getProjectPlan(reopened).phases.p.baselineRevisions).toHaveLength(2);
    expect(() => setPhaseActualDates(data, 'p', { start: '2026-02-01', end: '2026-01-01' })).toThrow();
    expect(() => revisePhaseBaseline(data, 'p', '')).toThrow();
});

it('uses signed calendar days including leap days and missing values', () => {
    expect(calendarDateDifference('2024-03-01', '2024-02-28')).toBe(2);
    expect(calendarDateDifference('2026-01-01', '2026-01-05')).toBe(-4);
    expect(calendarDateDifference('', '2026-01-05')).toBeNull();
});
