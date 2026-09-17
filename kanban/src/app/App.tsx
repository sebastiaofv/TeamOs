import { ErrorBoundary } from '@/app/ErrorBoundary';
import { AppHeader } from '@/app/AppHeader';
import { HelpDialog } from '@/app/overlays/HelpDialog';
import { ShortcutsDialog } from '@/app/overlays/ShortcutsDialog';
import { RoadmapEntityDialog } from '@/features/portfolio/roadmap/RoadmapEntityDialog';
import { TaskDetailDialog } from '@/features/portfolio/task/dialogs/TaskDetailDialog';
import { TaskEditorDialog } from '@/features/portfolio/task/dialogs/TaskEditorDialog';
import { AppMessageDialog } from '@/app/overlays/AppMessageDialog';
import { UndoToast } from '@/features/portfolio/shell/UndoToast';
import { PortfolioBulkActions, PortfolioChips, PortfolioToolbar } from '@/features/portfolio/shell/PortfolioControls';
import { PortfolioBoard } from '@/features/portfolio/board/PortfolioBoard';
import { PortfolioTimeline } from '@/features/portfolio/timeline/PortfolioTimeline';
import { PortfolioRoadmap } from '@/features/portfolio/roadmap/PortfolioRoadmap';
import { PortfolioCalendar } from '@/features/portfolio/calendar/PortfolioCalendar';
import { usePortfolioRuntime } from '@/features/portfolio/hooks/usePortfolioRuntime';
import { useTheme } from '@/shared/hooks/useTheme';
import { usePortfolioFileIntegration } from '@/features/portfolio/hooks/usePortfolioFileIntegration';
import { closeDialog } from '@/app/overlays/dialogs';
import { cancelAppMessages } from '@/app/overlays/appMessages';
import type { PortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';
import { PortfolioActionsProvider, usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useAppStore } from '@/features/portfolio/state/store';
import { useInitializeLanguage, useI18n } from '@/shared/i18n';

// A dialog that fails to render is closed so keyboard shortcuts are not left
// suppressed by a dialog nobody can see.
function closeAllDialogs(actions: Pick<PortfolioMutationActions, 'closeTaskEditor' | 'closeTaskDetail' | 'closeRoadmapEntity'>) {
    cancelAppMessages();
    actions.closeTaskEditor();
    actions.closeTaskDetail();
    actions.closeRoadmapEntity();
    closeDialog();
}

function AppContent() {
    const actions = usePortfolioActions();
    usePortfolioRuntime();
    useInitializeLanguage();
    const { theme, toggleTheme } = useTheme();
    const { t } = useI18n();
    const fileDropActive = usePortfolioFileIntegration();

    const viewMode = useAppStore((state) => state.selectedPortfolioViewMode);
    const hasBoards = useAppStore((state) => state.portfolioBoards.length > 0);
    const selectedBoardId = useAppStore((state) => state.selectedPortfolioBoardId);
    const roadmapActive = Boolean(selectedBoardId) && viewMode === 'roadmap';
    const calendarActive = hasBoards && viewMode === 'calendar';

    return (
        <>
            <AppHeader theme={theme} onToggleTheme={toggleTheme} />
            <div className={`view${fileDropActive ? ' file-drop-active' : ''}`} id="portfolioView">
                <div className="view-main">
                    <PortfolioToolbar />
                    <PortfolioChips />
                    <div className="portfolio-board-wrap" id="portfolioBoardWrap">
                        <PortfolioTimeline />
                        <PortfolioBulkActions />
                        <PortfolioBoard hidden={roadmapActive || calendarActive} />
                        <PortfolioRoadmap hidden={!roadmapActive} />
                        <PortfolioCalendar hidden={!calendarActive} />
                    </div>
                </div>
                <div className="file-drop-overlay" id="portfolioDropOverlay" aria-hidden="true">{t('app.dropProjectFiles')}</div>
            </div>
            <ErrorBoundary name="Dialogs" onError={() => closeAllDialogs(actions)}>
                <ShortcutsDialog />
                <HelpDialog />
                <TaskDetailDialog />
                <RoadmapEntityDialog />
                <TaskEditorDialog />
                <AppMessageDialog />
                <UndoToast />
            </ErrorBoundary>
        </>
    );
}

export function App() {
    return (
        <PortfolioActionsProvider>
            <AppContent />
        </PortfolioActionsProvider>
    );
}
