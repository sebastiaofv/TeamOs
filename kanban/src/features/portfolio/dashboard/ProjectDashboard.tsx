import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { DateAnalysis } from './DateAnalysis';
import { useI18n } from '@/shared/i18n';

export function ProjectDashboard({ hidden }: { hidden: boolean }) {
    const boards = useAppStore((s) => s.portfolioBoards), selected = useAppStore((s) => s.selectedPortfolioBoardId);
    const selection = useAppStore((s) => s.portfolioTimelineSelection);
    const { t } = useI18n();
    const board = boards.find((board) => board.id === selected);
    if (hidden || !board) return null;
    const preview = getSelectedPortfolioTimelineView({ portfolioBoards: boards, selectedPortfolioBoardId: selected, portfolioTimelineSelection: selection });
    const data = preview?.isPreview ? preview.projectedBoard || board.data : board.data;
    return <div className="project-dashboard" id="projectDashboard"><h1>{t('dashboard.project')} · {board.title}</h1><p className="muted">{preview?.isPreview ? t('dashboard.historical') : t('dashboard.current')}</p><DateAnalysis boardId={board.id} data={data} readOnly={!board.handle || Boolean(preview?.isPreview)} /></div>;
}
