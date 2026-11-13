import { useEffect, useRef, useState } from 'react';
import type { BurndownPoint } from '@/domain/sprintBurndown';
import { useI18n } from '@/shared/i18n';
import { formatSprintMetric as format } from './SprintExecutionCharts';

export function SprintBurndownChart({ points }: { points: BurndownPoint[] }) {
    const { t } = useI18n();
    const container = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(520);
    const [active, setActive] = useState<BurndownPoint | null>(null);
    useEffect(() => {
        if (!container.current) return;
        const observer = new ResizeObserver(entries => setWidth(Math.max(160, Math.floor(entries[0].contentRect.width))));
        observer.observe(container.current);
        return () => observer.disconnect();
    }, []);
    const left = 48, right = width - 18, top = 20, bottom = 202;
    const max = Math.max(1, ...points.flatMap(point => [point.ideal, point.actual ?? 0]));
    const x = (index: number) => points.length === 1 ? (left + right) / 2 : left + index / (points.length - 1) * (right - left);
    const y = (value: number) => bottom - value / max * (bottom - top);
    const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
    const description = (point: BurndownPoint) => `${shortDate(point.date)} · ${t('dashboard.analytics.ideal')}: ${format(point.ideal)} SP · ${t('dashboard.analytics.actual')}: ${format(point.actual)} SP`;
    return <>
        <div className="sprint-chart-legend"><span><i className="sprint-ideal-key" />{t('dashboard.analytics.ideal')}</span><span><i style={{ background: 'var(--sprint-blue)' }} />{t('dashboard.analytics.actual')}</span></div>
        <div className="sprint-chart-wrap" ref={container}>
            {active && <div className="sprint-chart-tooltip" role="status">{description(active)}</div>}
            {!points.length ? <p className="sprint-chart-empty">{t('dashboard.analytics.noBurndown')}</p> : <div className="sprint-chart-scroll"><svg width={width} height={244} viewBox={`0 0 ${width} 244`} role="group" aria-label={t('dashboard.analytics.burndown')}>
                <text x={8} y={12} className="sprint-axis">SP</text>
                {[0, .5, 1].map(fraction => <g key={fraction}><line x1={left} x2={right} y1={y(max * fraction)} y2={y(max * fraction)} className="sprint-gridline" /><text x={left - 8} y={y(max * fraction) + 4} textAnchor="end" className="sprint-axis">{format(max * fraction)}</text></g>)}
                <polyline data-burndown-ideal points={points.map((point, index) => `${x(index)},${y(point.ideal)}`).join(' ')} className="sprint-ideal-line" />
                <polyline data-burndown-actual points={points.flatMap((point, index) => point.actual === null ? [] : [`${x(index)},${y(point.actual)}`]).join(' ')} fill="none" stroke="var(--sprint-blue)" strokeWidth={2.5} />
                {points.map((point, index) => <g key={point.date} data-burndown-date={point.date} role="img" tabIndex={0} aria-label={description(point)} onMouseEnter={() => setActive(point)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(point)} onBlur={() => setActive(null)}>
                    <rect x={Math.max(left, x(index) - (right - left) / Math.max(1, points.length - 1) / 2)} y={top} width={Math.max(1, (right - left) / Math.max(1, points.length - 1))} height={bottom - top} fill="transparent" />
                    {point.actual !== null && <circle cx={x(index)} cy={y(point.actual)} r={active === point || points.length === 1 ? 4 : 0} fill="var(--sprint-blue)" />}
                    {(index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / Math.max(2, (width - left) / 65))) === 0) && <text x={x(index)} y={bottom + 24} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="sprint-axis">{shortDate(point.date)}</text>}
                </g>)}
            </svg></div>}
        </div>
    </>;
}
