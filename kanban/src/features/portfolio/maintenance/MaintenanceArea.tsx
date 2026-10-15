import { useState } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { getApplications, getMaintenanceConfig, projectApplication } from '@/domain/applications';
import { taskWorkContext } from '@/domain/maintenance';
import { executionProgress } from '@/domain/projectPlan';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { DashboardTaskList } from '@/features/portfolio/dashboard/DashboardTaskList';
import { selectPortfolioBoard, setPortfolioViewMode } from '@/features/portfolio/commands/portfolioControls';
import { useI18n } from '@/shared/i18n';

export function MaintenanceArea({ hidden }: { hidden: boolean }) {
    const { t } = useI18n(), actions = usePortfolioActions();
    const boards = useAppStore((s) => s.portfolioBoards), selected = useAppStore((s) => s.selectedPortfolioBoardId);
    const selectedApplication = useAppStore((s) => s.selectedApplicationId);
    const [sourceId, setSourceId] = useState(''), [combined, setCombined] = useState(false), [includeArchived, setIncludeArchived] = useState(false);
    if (hidden) return null;
    const applications = [...new Map(boards.flatMap((board) => [...getApplications(board.data), ...(projectApplication(board.data) ? [projectApplication(board.data)!] : [])]).map((app) => [app.id, app])).values()].sort((a, b) => a.name.localeCompare(b.name));
    const defaultBoard = boards.find((board) => board.id === selected) || boards[0];
    const applicationId = applications.some((app) => app.id === selectedApplication) ? selectedApplication : (defaultBoard ? projectApplication(defaultBoard.data)?.id : '') || applications[0]?.id || '';
    const sourceBoards = boards.filter((board) => getApplications(board.data).some((app) => app.id === applicationId) || projectApplication(board.data)?.id === applicationId);
    const source = sourceBoards.find((board) => board.id === sourceId) || sourceBoards.find((board) => board.id === selected) || sourceBoards[0];
    const groups = sourceBoards.map((board) => {
        const tasks = board.data.board.tasks.filter((task) => (includeArchived || !task.archived) && (taskWorkContext(task) === 'maintenance' ? (task.applicationId || projectApplication(board.data)?.id) === applicationId : combined && projectApplication(board.data)?.id === applicationId));
        return { board, tasks, progress: executionProgress(board.data, tasks, 'maintenance') };
    });
    return <div className="project-dashboard" id="applicationMaintenance"><h1>{t('maintenance.title')}</h1><p className="muted">{t('maintenance.coverage')}</p>
        {!applications.length ? <p>{t('maintenance.noApplication')}</p> : <>
            <div className="dashboard-controls"><label>{t('project.product')}<select aria-label={t('project.product')} value={applicationId} onChange={(event) => { useAppStore.setState({ selectedApplicationId: event.target.value }); setSourceId(''); }}>{applications.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
                <label>{t('maintenance.storage')}<select aria-label={t('maintenance.storage')} value={source?.id || ''} onChange={(event) => setSourceId(event.target.value)}>{sourceBoards.map((board) => <option key={board.id} value={board.id}>{board.title} · {board.fileName}</option>)}</select></label>
                <label><input type="checkbox" checked={combined} onChange={(event) => setCombined(event.target.checked)} />{t('maintenance.combined')}</label><label><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />{t('drilldown.includeArchived')}</label>
            </div>
            {source && <div className="dashboard-controls">{!getMaintenanceConfig(source.data)?.enabled ? <button className="btn btn-primary" type="button" disabled={!source.handle} onClick={() => actions.enableApplicationMaintenance(source.id)}>{t('maintenance.enable')}</button> : <>
                <button className="btn btn-primary" type="button" disabled={!source.handle} onClick={() => actions.openPortfolioCreateTaskModal(source.id, undefined, { workContext: 'maintenance', applicationId })}>{t('maintenance.create')}</button>
                <button className="btn" type="button" onClick={() => actions.openWorkContext(source.id, 'maintenance', 'board')}>{t('toolbar.board')}</button><button className="btn" type="button" onClick={() => actions.openWorkContext(source.id, 'maintenance', 'table')}>{t('table.view')}</button>
            </>}</div>}
            {groups.map(({ board, tasks, progress }) => <section key={board.id}><div className="workitem-link-row"><h2>{board.title}</h2><span className="muted">{board.fileName} · {t('maintenance.execution')} {progress.percent == null ? t('plan.na') : `${Math.round(progress.percent)}%`}</span><button className="btn-text" type="button" onClick={() => { selectPortfolioBoard(board.id); setPortfolioViewMode('dashboard'); }}>{t('maintenance.openProject')}</button></div><DashboardTaskList tasks={tasks} boardId={board.id} data={board.data} title={combined ? t('maintenance.combined') : t('maintenance.work')} /></section>)}
        </>}
    </div>;
}
