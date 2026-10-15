import { useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { buildPortfolioDashboard, type PortfolioDashboardFilters } from '@/features/portfolio/queries/portfolioDashboard';
import { PROJECT_STATES } from '@/domain/project';
import { setPortfolioViewMode, selectPortfolioBoard } from '@/features/portfolio/commands/portfolioControls';
import { todayLocalIsoDate } from '@/domain/util';
import { useI18n } from '@/shared/i18n';
import { formatPercent } from '@/shared/ui/format';
import { Pager, paginate } from './Pager';

const SORTS = ['criticality', 'deadline', 'name'] as const;

function openProjectDashboard(boardId: string) {
    useAppStore.setState({ portfolioDashboardReturn: true });
    selectPortfolioBoard(boardId);
    setPortfolioViewMode('dashboard');
}

export function PortfolioDashboard({ hidden }: { hidden: boolean }) {
    const { t } = useI18n();
    const boards = useAppStore((s) => s.portfolioBoards), saves = useAppStore((s) => s.projectSaveStateById);
    const filters = useAppStore((s) => s.portfolioDashboardFilters);
    const [page, setPage] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null), lastScroll = useRef(0);
    useLayoutEffect(() => { if (!hidden && scrollRef.current) scrollRef.current.scrollTop = lastScroll.current; }, [hidden]);
    if (hidden) return null;
    const model = buildPortfolioDashboard(boards, saves, filters, todayLocalIsoDate());
    const set = <K extends keyof PortfolioDashboardFilters>(key: K, value: PortfolioDashboardFilters[K]) => {
        useAppStore.setState({ portfolioDashboardFilters: { ...filters, [key]: value } });
        setPage(0);
    };
    const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
    const managers = distinct(model.allSummaries.map((row) => row.info.manager));
    const products = distinct(model.allSummaries.map((row) => row.info.product));
    const paged = paginate(model.rows, page);
    const na = t('plan.na');
    return (
        <div className="project-dashboard" id="portfolioDashboard" ref={scrollRef} onScroll={(event) => { lastScroll.current = event.currentTarget.scrollTop; }}>
            <h1>{t('portfolioDashboard.title')}</h1>
            <p className="muted">{t('portfolioDashboard.coverage', { loaded: model.loaded, unique: model.unique, duplicates: model.duplicates })}</p>
            <div className="dashboard-controls">
                <label>{t('project.state')}
                    <select aria-label={t('project.state')} value={filters.state} onChange={(e) => set('state', e.target.value as PortfolioDashboardFilters['state'])}>
                        <option value="all">{t('common.all')}</option>
                        {PROJECT_STATES.map((state) => <option key={state} value={state}>{t(`project.${state}`)}</option>)}
                    </select>
                </label>
                <label>{t('project.manager')}
                    <select aria-label={t('project.manager')} value={filters.manager} onChange={(e) => set('manager', e.target.value)}>
                        <option value="">{t('common.all')}</option>
                        {managers.map((name) => <option key={name}>{name}</option>)}
                    </select>
                </label>
                <label>{t('project.product')}
                    <select aria-label={t('project.product')} value={filters.product} onChange={(e) => set('product', e.target.value)}>
                        <option value="">{t('common.all')}</option>
                        {products.map((name) => <option key={name}>{name}</option>)}
                    </select>
                </label>
                <label><input type="checkbox" checked={filters.lateOnly} onChange={(e) => set('lateOnly', e.target.checked)} />{t('portfolioDashboard.lateOnly')}</label>
                <label>{t('toolbar.sort')}
                    <select aria-label={t('toolbar.sort')} value={filters.sort} onChange={(e) => set('sort', e.target.value as PortfolioDashboardFilters['sort'])}>
                        {SORTS.map((sort) => <option key={sort} value={sort}>{t(`portfolioDashboard.${sort}`)}</option>)}
                    </select>
                </label>
            </div>
            <p className="muted">{t('portfolioDashboard.orderRule')}</p>
            <section className="project-kpis" aria-label={t('portfolioDashboard.totals')}>
                <div className="project-progress"><span>{t('portfolioDashboard.projects')}</span><strong>{model.totals.projects}</strong></div>
                <div className="project-progress">
                    <span>{t('dashboard.execution')}</span>
                    <strong>{formatPercent(model.totals.percent, na)}</strong>
                    <span>{model.totals.completed}/{model.totals.eligible}</span>
                </div>
                <div className="project-progress"><span>{t('dashboard.overdue')}</span><strong>{model.totals.overdue}</strong></div>
                <div className="project-progress"><span>{t('dashboard.blocked')}</span><strong>{model.totals.blocked}</strong></div>
            </section>
            <p className="muted">{t('portfolioDashboard.aggregateRule')}</p>
            {!model.rows.length ? <p>{t('portfolioDashboard.empty')}</p> : (
                <div className="dashboard-table-scroll">
                    <table className="dashboard-table" id="portfolioProjectTable">
                        <thead>
                            <tr>
                                <th>{t('project.name')}</th><th>{t('project.product')}</th><th>{t('project.manager')}</th><th>{t('project.state')}</th>
                                <th>{t('project.forecast')}</th><th>{t('dashboard.execution')}</th><th>{t('dashboard.overdue')}</th><th>{t('portfolioDashboard.risks')}</th><th>FTE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paged.items.map(({ record, info, model: project, late }) => (
                                <tr key={info.id}>
                                    <th scope="row"><button className="btn-text" type="button" onClick={() => openProjectDashboard(record.id)}>{info.name}</button></th>
                                    <td>{info.product || na}</td>
                                    <td>{info.manager || na}</td>
                                    <td>{t(`project.${info.state}`)}</td>
                                    <td>{info.forecast.start || na} → {info.forecast.end || na}</td>
                                    <td>{formatPercent(project.progress.percent, na)} · {project.progress.completed.length}/{project.progress.eligible.length}</td>
                                    <td>{late ? t('common.yes') : t('common.no')} · {project.metrics.overdue.length}</td>
                                    <td>{na}</td>
                                    <td>{na}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <Pager current={paged.current} count={paged.count} setPage={setPage} />
            {model.excluded.length > 0 && (
                <section className="portfolio-exclusions">
                    <h2>{t('portfolioDashboard.excluded')}</h2>
                    <ul>{model.excluded.map((row) => <li key={row.id}>{row.title} · {t(row.reason === 'duplicate' ? 'portfolioDashboard.duplicate' : 'portfolioDashboard.unavailable')}</li>)}</ul>
                </section>
            )}
            <p className="muted">{t('portfolioDashboard.pendingMetrics')}</p>
        </div>
    );
}
