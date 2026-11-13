import { useEffect, useRef, useState } from 'react';
import type { SprintCycle } from '@/domain/sprintExecution';
import { workitemLabel } from '@/domain/taskIdentity';
import { useI18n, type TranslationKey } from '@/shared/i18n';

export type AnalyticsLabel = Extract<TranslationKey, `dashboard.analytics.${string}`> extends `dashboard.analytics.${infer Label}` ? Label : never;

export const formatSprintMetric = (value: number | null, percent = false) => value === null ? 'N/A' : `${percent ? Math.round(value) : Number(value.toFixed(1))}${percent ? '%' : ''}`;

/** Both plots share SP buckets and weekday observations; missing estimates are not zero. */
export function CycleChart({ cycles, onOpen }: { cycles: SprintCycle[]; onOpen?: (cycle: SprintCycle) => void }) {
    const { t } = useI18n();
    const container = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(520);
    const [tooltip, setTooltip] = useState('');
    useEffect(() => {
        if (!container.current) return;
        const observer = new ResizeObserver(entries => setWidth(Math.max(160, Math.floor(entries[0].contentRect.width))));
        observer.observe(container.current);
        return () => observer.disconnect();
    }, []);
    const buckets = new Map<number, SprintCycle[]>();
    for (const cycle of cycles) if (cycle.points !== null) buckets.set(cycle.points, [...buckets.get(cycle.points) || [], cycle]);
    const groups = [...buckets].sort(([a], [b]) => a - b).map(([points, members]) => {
        const sorted = members.map(member => member.days).sort((a, b) => a - b);
        const quantile = (fraction: number) => {
            const index = (sorted.length - 1) * fraction, floor = Math.floor(index);
            return sorted[floor] + (sorted[Math.ceil(index)] - sorted[floor]) * (index - floor);
        };
        const q1 = quantile(.25), q3 = quantile(.75), iqr = q3 - q1;
        return { points, members, q1, q3, median: quantile(.5), low: sorted.find(value => value >= q1 - iqr * 1.5)!, high: sorted.findLast(value => value <= q3 + iqr * 1.5)!, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length };
    });
    const left = 48, right = width - 18, top = 20, bottom = 202;
    const max = Math.max(1, ...cycles.filter(cycle => cycle.points !== null).map(cycle => cycle.days));
    const y = (days: number) => bottom - days / max * (bottom - top);
    const minSP = groups[0]?.points ?? 0, maxSP = groups.at(-1)?.points ?? 0;
    const x = (points: number) => maxSP === minSP ? (left + right) / 2 : left + 26 + (points - minSP) / (maxSP - minSP) * Math.max(1, right - left - 52);
    const description = (cycle: SprintCycle) => `${workitemLabel(cycle.task)} · ${cycle.task.title} · ${cycle.points} SP · ${formatSprintMetric(cycle.days)} ${t('dashboard.analytics.businessDays')}`;
    const averageDescription = (group: typeof groups[number]) => `${group.points} SP · ${t('dashboard.analytics.mean')}: ${formatSprintMetric(group.mean)} ${t('dashboard.analytics.businessDays')} · ${group.members.length} ${t('dashboard.analytics.workitems')}`;
    const hover = (text: string) => ({ onMouseEnter: () => setTooltip(text), onMouseLeave: () => setTooltip(''), onFocus: () => setTooltip(text), onBlur: () => setTooltip('') });
    const label = t(onOpen ? 'dashboard.analytics.executionBySP' : 'dashboard.analytics.cycleBySP');
    return <>
        <div className="sprint-chart-legend"><span><i style={{ background: 'var(--sprint-blue)' }} />{t(onOpen ? 'dashboard.analytics.workitems' : 'dashboard.analytics.distribution')}</span>{onOpen && <span><i style={{ background: 'var(--sprint-amber)' }} />{t('dashboard.analytics.mean')}</span>}</div>
        <div className="sprint-chart-wrap" ref={container}>
            {tooltip && <div className="sprint-chart-tooltip" role="status">{tooltip}</div>}
            {!groups.length ? <p className="sprint-chart-empty">{t('dashboard.analytics.noCycles')}</p> : <div className="sprint-chart-scroll">
                <svg width={width} height={244} viewBox={`0 0 ${width} 244`} role="group" aria-label={label}>
                    <text x={8} y={12} className="sprint-axis">{t('dashboard.analytics.businessDays')}</text>
                    {[0, .5, 1].map(fraction => <g key={fraction}><line x1={left} x2={right} y1={y(max * fraction)} y2={y(max * fraction)} className="sprint-gridline" /><text x={left - 8} y={y(max * fraction) + 4} textAnchor="end" className="sprint-axis">{formatSprintMetric(max * fraction)}</text></g>)}
                    {onOpen && <polyline data-cycle-average="true" points={groups.map(group => `${x(group.points)},${y(group.mean)}`).join(' ')} fill="none" stroke="var(--sprint-amber)" strokeWidth={2.5} />}
                    {groups.map((group, index) => {
                        const cx = x(group.points), half = Math.min(22, (right - left) / Math.max(groups.length, 1) * .25);
                        const stats = `${group.points} SP · ${t('dashboard.analytics.median')}: ${formatSprintMetric(group.median)} · Q1: ${formatSprintMetric(group.q1)} · Q3: ${formatSprintMetric(group.q3)} · ${group.low}–${group.high} ${t('dashboard.analytics.businessDays')} · ${group.members.length} ${t('dashboard.analytics.workitems')}`;
                        const showLabel = index === 0 || cx - x(groups[index - 1].points) >= 28;
                        return <g key={group.points}>
                            {showLabel && <text x={cx} y={bottom + 22} className="sprint-axis" textAnchor="middle">{group.points}</text>}
                            {onOpen ? <>
                                {group.members.map((cycle, memberIndex) => {
                                    // Small symmetric jitter keeps equal observations selectable without changing the SP bucket.
                                    const jitter = Math.min(12, half) * ((memberIndex % 5) - Math.min(group.members.length - 1, 4) / 2) / 2;
                                    return <g key={cycle.key} data-cycle-workitem={cycle.task.id} role="button" tabIndex={0} aria-label={description(cycle)} {...hover(description(cycle))} onClick={() => onOpen(cycle)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(cycle); } }}>
                                        <title>{description(cycle)}</title><circle cx={cx + jitter} cy={y(cycle.days)} r={7} fill="transparent" /><circle cx={cx + jitter} cy={y(cycle.days)} r={4} fill="var(--sprint-blue)" />
                                    </g>;
                                })}
                                <circle data-cycle-mean={group.points} cx={cx} cy={y(group.mean)} r={7} fill="none" stroke="var(--sprint-amber)" strokeWidth={1.5} pointerEvents="stroke" tabIndex={0} role="img" aria-label={averageDescription(group)} {...hover(averageDescription(group))}><title>{averageDescription(group)}</title></circle>
                            </> : <g data-cycle-box={group.points} role="img" tabIndex={0} aria-label={stats} {...hover(stats)}>
                                <title>{stats}</title><rect x={cx - half - 4} y={top} width={half * 2 + 8} height={bottom - top + 1} fill="transparent" />
                                <line x1={cx} x2={cx} y1={y(group.low)} y2={y(group.high)} stroke="var(--sprint-blue)" />
                                {[group.low, group.high].map((value, i) => <line key={i} x1={cx - half / 2} x2={cx + half / 2} y1={y(value)} y2={y(value)} stroke="var(--sprint-blue)" />)}
                                <rect x={cx - half} y={y(group.q3)} width={half * 2} height={Math.max(1, y(group.q1) - y(group.q3))} fill="var(--sprint-blue)" fillOpacity={.2} stroke="var(--sprint-blue)" />
                                <line x1={cx - half} x2={cx + half} y1={y(group.median)} y2={y(group.median)} stroke="var(--sprint-blue)" strokeWidth={2} />
                                {group.members.filter(member => member.days < group.low || member.days > group.high).map(member => <circle key={member.key} cx={cx} cy={y(member.days)} r={3} fill="var(--sprint-blue)" />)}
                            </g>}
                        </g>;
                    })}
                    <text x={right} y={240} textAnchor="end" className="sprint-axis">SP</text>
                </svg>
            </div>}
        </div>
    </>;
}
