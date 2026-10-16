import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { DateAnalysis } from './DateAnalysis';
import { useI18n } from '@/shared/i18n';
import { ProjectMetrics } from './ProjectMetrics';
import { ProjectPlanTimeline } from '@/features/portfolio/roadmap/PortfolioRoadmap';
import { todayLocalIsoDate } from '@/domain/util';
import { formatLocalIsoDate } from '@/domain/calendar';
import { setPortfolioViewMode } from '@/features/portfolio/commands/portfolioControls';

export function ProjectDashboard({ hidden }: { hidden: boolean }) {
    const boards = useAppStore((s) => s.portfolioBoards), selected = useAppStore((s) => s.selectedPortfolioBoardId);
    const selection = useAppStore((s) => s.portfolioTimelineSelection);
    const canReturn = useAppStore((s) => s.portfolioDashboardReturn);
    const { t } = useI18n();
    const board = boards.find((board) => board.id === selected);
    if (hidden || !board) return null;
    const preview = getSelectedPortfolioTimelineView({ portfolioBoards: boards, selectedPortfolioBoardId: selected, portfolioTimelineSelection: selection });
    const data = preview?.isPreview ? preview.projectedBoard || board.data : board.data;
    return <div className="project-dashboard" id="projectDashboard">{canReturn && <button className="btn" type="button" onClick={() => { useAppStore.setState({ portfolioDashboardReturn: false }); setPortfolioViewMode('portfolio'); }}>{t('portfolioDashboard.back')}</button>}<h1>{t('dashboard.project')} · {board.title}</h1><p className="muted">{preview?.isPreview ? t('dashboard.historical') : t('dashboard.current')}</p>
        <ProjectMetrics key={board.id} boardId={board.id} data={data} loadedBoards={boards.map((b) => b.id === board.id ? data : b.data)} date={preview?.isPreview && preview.selectedEvent ? formatLocalIsoDate(new Date(preview.selectedEvent.at)) || todayLocalIsoDate() : todayLocalIsoDate()} historical={Boolean(preview?.isPreview)} />
        <details className="dashboard-plan" open><summary>{t('dashboard.plan')}</summary><ProjectPlanTimeline /></details>
        <DateAnalysis boardId={board.id} data={data} readOnly={!board.handle || Boolean(preview?.isPreview)} />
    </div>;
}
