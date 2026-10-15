import { useAppStore } from '@/features/portfolio/state/store';
import { getMaintenanceConfig, projectApplication } from '@/domain/applications';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { setPortfolioViewMode } from '@/features/portfolio/commands/portfolioControls';
import { useI18n } from '@/shared/i18n';

export function WorkContextBanner() {
    const { t } = useI18n(), actions = usePortfolioActions();
    const board = useAppStore((s) => s.portfolioBoards.find((board) => board.id === s.selectedPortfolioBoardId));
    const context = useAppStore((s) => s.selectedWorkContext);
    if (!board || !getMaintenanceConfig(board.data)?.enabled) return null;
    const app = projectApplication(board.data);
    return <div className="work-context-banner"><strong>{t(context === 'maintenance' ? 'maintenance.work' : 'maintenance.projectWork')} · {app?.name}</strong><span className="muted">{t('maintenance.storage')}: {board.fileName}</span>
        {context === 'maintenance' && <button className="btn-text" type="button" onClick={() => actions.openWorkContext(board.id, 'project')}>{t('maintenance.projectWork')}</button>}
        <button className="btn-text" type="button" onClick={() => { if (app) useAppStore.setState({ selectedApplicationId: app.id }); setPortfolioViewMode('maintenance'); }}>{t('maintenance.title')}</button>
    </div>;
}
