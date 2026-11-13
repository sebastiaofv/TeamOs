import { useEffect, useMemo, useRef, useState } from 'react';
import { sprintExecution } from '@/domain/sprintExecution';
import { CycleChart, formatSprintMetric, type AnalyticsLabel } from './SprintExecutionCharts';
import { SprintDetail } from './SprintDetail';
import type { BoardData } from '@/domain/types';
import { allSprintAnalytics, type SprintAnalyticsRow } from '@/domain/sprintAnalytics';
import { WorkspaceIcon, type WorkspaceIconName } from '@/shared/ui/WorkspaceIcon';
import { useI18n } from '@/shared/i18n';

type ChartKind = 'velocity' | 'predictability' | 'capacity' | 'carryover' | 'rework';
type PerformanceRow = SprintAnalyticsRow & { rework: number | null; reworkPercent: number | null };
const colors = { rework: 'var(--sprint-purple)', planned: 'var(--sprint-blue)', completed: 'var(--sprint-green)', capacity: 'var(--sprint-purple)', carryover: 'var(--sprint-amber)', average: 'var(--sprint-amber)', excess: 'var(--sprint-red)' };

function Trend({ kind, rows, velocity }: { kind: ChartKind; rows: PerformanceRow[]; velocity: number | null }) {
    const { t } = useI18n();
    const [active, setActive] = useState<string | null>(null);
    const container = useRef<HTMLDivElement>(null);
    const [availableWidth, setAvailableWidth] = useState(520);
    useEffect(() => {
        const element = container.current;
        if (!element) return;
        const observer = new ResizeObserver(entries => setAvailableWidth(Math.floor(entries[0].contentRect.width)));
        observer.observe(element);
        return () => observer.disconnect();
    }, [rows.length]);
    const series = kind === 'velocity' ? ['planned', 'completed'] as const : kind === 'capacity' ? ['capacity', 'planned'] as const : kind === 'carryover' ? ['carryover'] as const : kind === 'rework' ? ['rework'] as const : ['predictability'] as const;
    const percent = kind === 'predictability';
    const width = Math.max(availableWidth, 160), height = 244, top = 18, bottom = 202, left = 48;
    const maximum = Math.max(percent ? 100 : 1, ...rows.flatMap(row => series.map(key => row[key] ?? 0)), kind === 'velocity' || kind === 'rework' ? velocity ?? 0 : 0);
    const max = percent ? Math.ceil(maximum / 25) * 25 : kind === 'rework' ? Math.max(2, Math.ceil(maximum / 2) * 2) : Math.ceil(maximum / 5) * 5;
    const y = (value: number) => bottom - value / max * (bottom - top);
    const step = (width - left - 16) / Math.max(1, rows.length);
    const x = (index: number) => left + step * (index + .5);
    const selected = rows.find(row => row.id === active);
    const seriesLabel = (key: typeof series[number]) => t(`dashboard.analytics.${key}`);
    const description = (row: PerformanceRow) => `${row.title}: ${series.map(key => `${seriesLabel(key)} ${formatSprintMetric(row[key], percent)}`).join(', ')}${kind === 'rework' ? `, ${formatSprintMetric(row.reworkPercent, true)}` : ''}${kind === 'capacity' ? `, ${t('dashboard.analytics.utilization')} ${formatSprintMetric(row.utilization, true)}` : ''}`;
    return <>
        <div className="sprint-chart-legend">{series.map(key => <span key={key}><i style={{ background: key === 'predictability' ? colors.planned : colors[key] }} />{seriesLabel(key)}</span>)}
            {(kind === 'velocity' || kind === 'rework') && <span><i className="sprint-average-key" />{t(kind === 'rework' ? 'dashboard.analytics.median' : 'dashboard.analytics.averageVelocity')} · {formatSprintMetric(velocity)} {kind === 'rework' ? t('dashboard.analytics.workitems') : 'SP'}</span>}
            {kind === 'capacity' && <span><i style={{ background: colors.excess }} />{t('dashboard.analytics.overCapacity')}</span>}
        </div>
        {!rows.length ? <p className="sprint-chart-empty">{t('dashboard.analytics.noCompleted')}</p> : <div className="sprint-chart-wrap">
            {selected && <div className="sprint-chart-tooltip" role="status">{description(selected)}</div>}
            <div ref={container} className="sprint-chart-scroll" role="region" aria-label={t(`dashboard.analytics.${kind}Trend`)} tabIndex={0}>
                <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={t(`dashboard.analytics.${kind}Trend`)}>
                    <text x={8} y={12} className="sprint-axis">{percent ? '%' : kind === 'rework' ? t('dashboard.analytics.workitems') : 'SP'}</text>
                    {[0, .5, 1].map(fraction => <g key={fraction}><line x1={left} x2={width - 12} y1={y(max * fraction)} y2={y(max * fraction)} className="sprint-gridline" /><text x={left - 8} y={y(max * fraction) + 4} textAnchor="end" className="sprint-axis">{formatSprintMetric(max * fraction, percent)}</text></g>)}
                    {(kind === 'velocity' || kind === 'rework') && velocity !== null && <line data-average-velocity={kind === 'velocity' ? velocity : undefined} data-rework-median={kind === 'rework' ? velocity : undefined} x1={left} x2={width - 12} y1={y(velocity)} y2={y(velocity)} className="sprint-average-line" />}
                    {percent && rows.map((row, index) => index > 0 && row.predictability !== null && rows[index - 1].predictability !== null ? <line key={row.id} x1={x(index - 1)} y1={y(rows[index - 1].predictability!)} x2={x(index)} y2={y(row.predictability)} stroke={colors.planned} strokeWidth={2.5} /> : null)}
                    {rows.map((row, index) => <g key={row.id} data-sprint-chart-point={row.id} tabIndex={0} role="img" aria-label={description(row)} onMouseEnter={() => setActive(row.id)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(row.id)} onBlur={() => setActive(null)}>
                        <rect x={left + step * index} y={top} width={step} height={bottom - top + 35} fill="transparent" />
                        {series.map((key, seriesIndex) => {
                            const value = row[key];
                            if (value === null) return null;
                            if (percent) return <circle key={key} cx={x(index)} cy={y(value)} r={Math.min(4, step * .35)} fill={colors.planned} />;
                            const gap = Math.min(3, step * .06), barWidth = Math.min(25, step * .28), bx = x(index) + (series.length === 1 ? -barWidth / 2 : (seriesIndex - 1) * barWidth + (seriesIndex === 0 ? -gap / 2 : gap / 2));
                            const excess = kind === 'capacity' && key === 'planned' && row.capacity !== null && value > row.capacity;
                            return <g key={key}><rect x={bx} y={y(value)} width={barWidth} height={Math.max(value > 0 ? 1 : 0, bottom - y(value))} rx={2} fill={colors[key as keyof typeof colors]} />
                                {excess && <rect data-sprint-excess={row.id} x={bx} y={y(value)} width={barWidth} height={y(row.capacity!) - y(value)} rx={2} fill={colors.excess} />}</g>;
                        })}
                        {series.every(key => row[key] === null) && <text x={x(index)} y={bottom - 10} textAnchor="middle" className="sprint-axis">N/A</text>}
                        {index % Math.max(1, Math.ceil(80 / step)) === 0 && <text x={x(index)} y={bottom + 24} textAnchor="middle" className="sprint-axis"><title>{row.title}</title>{row.title.length > 12 ? `${row.title.slice(0, 11)}…` : row.title}</text>}
                    </g>)}
                </svg>
            </div>
        </div>}
    </>;
}

export function SprintAnalytics({ data, selected, boardId }: { data: BoardData; selected: string; boardId: string }) {
    const { t } = useI18n();
    const analytics = useMemo(() => allSprintAnalytics(data), [data]);
    const execution = useMemo(() => sprintExecution(data), [data]);
    const summary = { ...analytics.summary, rework: execution.medianRework };
    const rows = analytics.rows.map(row => ({ ...row, rework: execution.sprints.get(row.id)?.rework?.length ?? null, reworkPercent: execution.sprints.get(row.id)?.reworkPercent ?? null }));
    if (selected) return <SprintDetail data={data} selected={selected} boardId={boardId} analytics={analytics} execution={execution} />;
    const metrics: { key: keyof typeof summary; title: AnalyticsLabel; icon: WorkspaceIconName; percent?: boolean }[] = [
        { key: 'velocity', title: 'averageVelocity', icon: 'gauge' }, { key: 'predictability', title: 'sprintPredictability', icon: 'progress', percent: true },
        { key: 'utilization', title: 'capacityUtilization', icon: 'user', percent: true }, { key: 'carryover', title: 'carryover', icon: 'move' },
        { key: 'rework', title: 'medianRework', icon: 'rework' }
    ];
    return <div className="sprint-analytics">
        <h2 className="dashboard-section-heading"><WorkspaceIcon name="dashboard" />{t('dashboard.analytics.summary')}</h2>
        <div className="sprint-summary-grid">{metrics.map(metric => <section className={`dashboard-panel sprint-summary${metric.key === 'utilization' && (summary.utilization ?? 0) > 100 ? ' sprint-over-capacity' : ''}`} data-sprint-summary={metric.key} key={metric.key}>
            <h3><WorkspaceIcon name={metric.icon} />{t(`dashboard.analytics.${metric.title}`)}</h3><div className="sprint-summary-value"><strong>{formatSprintMetric(summary[metric.key], metric.percent)}</strong>{!metric.percent && <span>{metric.key === 'rework' ? t('dashboard.analytics.workitems') : 'SP'} / {t('roadmap.sprint')}</span>}</div>
        </section>)}</div>
        {analytics.incomplete && <p className="dashboard-note" role="status">{t('dashboard.analytics.partial')}</p>}
        <h2 className="dashboard-section-heading"><WorkspaceIcon name="chart" />{t('dashboard.analytics.performance')}</h2>
        <div className="sprint-performance-grid">{(['velocity', 'predictability', 'capacity', 'carryover'] as const).map(kind => <section className="dashboard-panel sprint-trend" data-sprint-trend={kind} key={kind}>
            <h3><WorkspaceIcon name={kind === 'capacity' ? 'user' : kind === 'carryover' ? 'move' : 'chart'} />{t(`dashboard.analytics.${kind}Trend`)}</h3><Trend kind={kind} rows={rows} velocity={summary.velocity} />
        </section>)}
        <section className="dashboard-panel sprint-trend" data-sprint-trend="cycle"><h3><WorkspaceIcon name="chart" />{t('dashboard.analytics.cycleBySP')}</h3><CycleChart cycles={execution.cycles} /></section>
        <section className="dashboard-panel sprint-trend" data-sprint-trend="rework"><h3><WorkspaceIcon name="rework" />{t('dashboard.analytics.reworkTrend')}</h3><Trend kind="rework" rows={rows} velocity={summary.rework} /></section>
        </div>
    </div>;
}
