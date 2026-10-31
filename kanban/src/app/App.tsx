import { ErrorBoundary } from '@/app/ErrorBoundary';
import { AppHeader } from '@/app/AppHeader';
import { HelpDialog } from '@/app/overlays/HelpDialog';
import { ShortcutsDialog } from '@/app/overlays/ShortcutsDialog';
import { RoadmapEntityDialog } from '@/features/portfolio/roadmap/RoadmapEntityDialog';
import { TaskDetailDialog } from '@/features/portfolio/task/dialogs/TaskDetailDialog';
import { TaskEditorDialog } from '@/features/portfolio/task/dialogs/TaskEditorDialog';
import { ProjectSettingsDialog } from '@/features/portfolio/projects/ProjectSettingsDialog';
import { ConversationDraftRecovery } from '@/features/portfolio/task/ConversationDraftRecovery';
import { AppMessageDialog } from '@/app/overlays/AppMessageDialog';
import { UndoToast } from '@/features/portfolio/shell/UndoToast';
import { CommandPalette } from '@/features/portfolio/palette/CommandPalette';
import { PortfolioBulkActions, PortfolioChips, PortfolioToolbar } from '@/features/portfolio/shell/PortfolioControls';
import { PortfolioBoard } from '@/features/portfolio/board/PortfolioBoard';
import { PortfolioTimeline } from '@/features/portfolio/timeline/PortfolioTimeline';
import { PortfolioRoadmap } from '@/features/portfolio/roadmap/PortfolioRoadmap';
import { PortfolioCalendar } from '@/features/portfolio/calendar/PortfolioCalendar';
import { PortfolioPlanner } from '@/features/portfolio/planner/PortfolioPlanner';
import { PortfolioDashboard } from '@/features/portfolio/dashboard/PortfolioDashboard';
import { PortfolioTable } from '@/features/portfolio/table/PortfolioTable';
import { usePortfolioRuntime } from '@/features/portfolio/hooks/usePortfolioRuntime';
import { AppSettingsDialog } from '@/app/overlays/AppSettingsDialog';
import { useAppSettings } from '@/shared/hooks/useAppSettings';
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
    const { showTimeline, setShowTimeline } = useAppSettings();
    const { t } = useI18n();
    const fileDropActive = usePortfolioFileIntegration();

    const viewMode = useAppStore((state) => state.selectedPortfolioViewMode);
    const hasBoards = useAppStore((state) => state.portfolioBoards.length > 0);
    const selectedBoardId = useAppStore((state) => state.selectedPortfolioBoardId);
    const roadmapActive = Boolean(selectedBoardId) && viewMode === 'roadmap';
    const calendarActive = hasBoards && viewMode === 'calendar';
    const plannerActive = hasBoards && viewMode === 'planner';
    const dashboardActive = Boolean(selectedBoardId) && viewMode === 'dashboard';
    const tableActive = Boolean(selectedBoardId) && viewMode === 'table';

    return (
        <>
            <a className="skip-link" href="#portfolioMain">{t('common.skipToContent')}</a>
            <AppHeader theme={theme} onToggleTheme={toggleTheme} />
            <main className={`view${fileDropActive ? ' file-drop-active' : ''}`} id="portfolioView" aria-labelledby="appTitle">
                <div className="view-main" id="portfolioMain" tabIndex={-1}>
                    <PortfolioToolbar />
                    <PortfolioChips />
                    <div className={`portfolio-board-wrap${hasBoards ? '' : ' is-empty'}${tableActive ? ' table-active' : ''}`} id="portfolioBoardWrap">
                        <PortfolioReadOnlyNotice />
                        <ConversationDraftRecovery />
                        {showTimeline && <PortfolioTimeline />}
                        <PortfolioBulkActions />
                        <PortfolioBoard hidden={roadmapActive || calendarActive || plannerActive || tableActive || dashboardActive} />
                        <PortfolioDashboard hidden={!dashboardActive} />
                        <PortfolioTable hidden={!tableActive} />
                        <PortfolioRoadmap hidden={!roadmapActive} />
                        <PortfolioCalendar hidden={!calendarActive} />
                        <PortfolioPlanner hidden={!plannerActive} />
                    </div>
                </div>
                <div className="file-drop-overlay" id="portfolioDropOverlay" aria-hidden="true">{t('app.dropProjectFiles')}</div>
            </main>
            <ErrorBoundary name="Dialogs" onError={() => closeAllDialogs(actions)}>
                <AppSettingsDialog showTimeline={showTimeline} onShowTimelineChange={(visible) => {
                    if (!visible) actions.clearPortfolioTimelineSelection({ keepModals: true });
                    setShowTimeline(visible);
                }} />
                <ShortcutsDialog />
                <HelpDialog />
                <CommandPalette />
                <TaskDetailDialog />
                <RoadmapEntityDialog />
                <TaskEditorDialog />
                <ProjectSettingsDialog />
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
