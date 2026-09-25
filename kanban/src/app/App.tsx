import { ErrorBoundary } from '@/app/ErrorBoundary';
import { AppHeader } from '@/app/AppHeader';
import { HelpDialog } from '@/app/overlays/HelpDialog';
import { ShortcutsDialog } from '@/app/overlays/ShortcutsDialog';
import { RoadmapEntityDialog } from '@/features/portfolio/roadmap/RoadmapEntityDialog';
import { TaskDetailDialog } from '@/features/portfolio/task/dialogs/TaskDetailDialog';
import { TaskEditorDialog } from '@/features/portfolio/task/dialogs/TaskEditorDialog';
import { AppMessageDialog } from '@/app/overlays/AppMessageDialog';
import { UndoToast } from '@/features/portfolio/shell/UndoToast';
import { CommandPalette } from '@/features/portfolio/palette/CommandPalette';
import { PortfolioBulkActions, PortfolioChips, PortfolioToolbar } from '@/features/portfolio/shell/PortfolioControls';
import { PortfolioBoard } from '@/features/portfolio/board/PortfolioBoard';
import { PortfolioTimeline } from '@/features/portfolio/timeline/PortfolioTimeline';
import { PortfolioRoadmap } from '@/features/portfolio/roadmap/PortfolioRoadmap';
import { PortfolioCalendar } from '@/features/portfolio/calendar/PortfolioCalendar';
import { PortfolioPlanner } from '@/features/portfolio/planner/PortfolioPlanner';
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

function PortfolioReadOnlyNotice() {
    const board = useAppStore((state) => state.portfolioBoards.find((record) => record.id === state.selectedPortfolioBoardId));
    const { t } = useI18n();
    if (!board || board.handle) return null;
    return (
        <div className="portfolio-read-only-notice" role="note">
            <strong>{t('common.readOnlyProject')}</strong>
            <span>{board.title || board.fileName}: {t('messages.readOnlyProject')}</span>
        </div>
    );
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
    const plannerActive = hasBoards && viewMode === 'planner';

    return (
        <>
            <a className="skip-link" href="#portfolioMain">{t('common.skipToContent')}</a>
            <AppHeader theme={theme} onToggleTheme={toggleTheme} />
            <main className={`view${fileDropActive ? ' file-drop-active' : ''}`} id="portfolioView" aria-labelledby="appTitle">
                <div className="view-main" id="portfolioMain" tabIndex={-1}>
                    <PortfolioToolbar />
                    <PortfolioChips />
                    <div className="portfolio-board-wrap" id="portfolioBoardWrap">
                        <PortfolioReadOnlyNotice />
                        <PortfolioTimeline />
                        <PortfolioBulkActions />
                        <PortfolioBoard hidden={roadmapActive || calendarActive || plannerActive} />
                        <PortfolioRoadmap hidden={!roadmapActive} />
                        <PortfolioCalendar hidden={!calendarActive} />
                        <PortfolioPlanner hidden={!plannerActive} />
                    </div>
                </div>
                <div className="file-drop-overlay" id="portfolioDropOverlay" aria-hidden="true">{t('app.dropProjectFiles')}</div>
            </main>
            <ErrorBoundary name="Dialogs" onError={() => closeAllDialogs(actions)}>
                <ShortcutsDialog />
                <HelpDialog />
                <CommandPalette />
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
