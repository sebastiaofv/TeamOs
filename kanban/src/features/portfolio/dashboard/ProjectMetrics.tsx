import { useState } from 'react';
import type { BoardData } from '@/domain/types';
import { buildProjectDashboard, type ProjectMetric } from '@/features/portfolio/queries/projectDashboard';
import { useI18n } from '@/shared/i18n';
import { DashboardTaskList } from './DashboardTaskList';

export function ProjectMetrics({ boardId, data, loadedBoards, date, historical }: { boardId: string; data: BoardData; loadedBoards: BoardData[]; date: string; historical: boolean }) {
    const { t } = useI18n();
    const model = buildProjectDashboard(data, loadedBoards, date);
    const [selection, setSelection] = useState<{ metric?: ProjectMetric; group?: string }>({ metric: 'open' });
    const group = model.groups.find((group) => `${group.kind}:${group.item.id}` === selection.group);
    const tasks = group?.eligible || model.metrics[selection.metric || 'open'];
    const title = group?.item.title || t(`dashboard.${selection.metric || 'open'}`);
    return <><section className="project-kpis" aria-label={t('dashboard.indicators')}>
        <div className="project-progress"><span>{t('dashboard.execution')}</span><strong>{model.progress.percent == null ? t('plan.na') : `${Math.round(model.progress.percent)}%`}</strong><span>{model.progress.completed.length}/{model.progress.eligible.length} {t('dashboard.leaves')}</span></div>
        {(Object.keys(model.metrics) as ProjectMetric[]).map((metric) => <button key={metric} className={`kpi-card${selection.metric === metric ? ' active' : ''}`} type="button" data-metric={metric} aria-pressed={selection.metric === metric} onClick={() => setSelection({ metric })}><span>{t(`dashboard.${metric}`)}</span><strong>{model.metrics[metric].length}</strong></button>)}
    </section>
        <p className="muted">{t('dashboard.metricRule')} · {date}</p>
        <section className="project-group-progress" aria-label={t('dashboard.groupProgress')}>{model.groups.map((group) => <button key={`${group.kind}:${group.item.id}`} className="group-progress-card" type="button" onClick={() => setSelection({ group: `${group.kind}:${group.item.id}` })}><span>{group.item.title}{group.current ? ` · ${t('dashboard.currentPhase')}` : ''}</span><strong>{group.percent == null ? t('plan.na') : `${Math.round(group.percent)}%`} · {group.completed.length}/{group.eligible.length}</strong>{group.eligible.length > 0 && <progress value={group.completed.length} max={group.eligible.length} aria-label={group.item.title} />}</button>)}</section>
        <DashboardTaskList key={selection.group || selection.metric} tasks={tasks} boardId={boardId} data={data} historical={historical} title={title} />
    </>;
}
