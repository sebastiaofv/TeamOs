import { ProjectIdentityDialog } from '@/features/portfolio/projects/ProjectIdentityDialog';
import { ProjectFileNotices, ProjectReconciliationDialog } from '@/features/portfolio/projects/ProjectReconciliation';
import { PortfolioControl } from '@/features/portfolio/control/PortfolioControl';
import { ProjectControlDialog } from '@/features/portfolio/control/ControlRecordDialog';
import { PendingProjectTransfers } from '@/features/portfolio/projects/PendingProjectTransfers';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { AppHeader } from '@/app/AppHeader';
import { DocsView } from '@/app/docs/DocsView';
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
import { PortfolioQueryToolbar } from '@/features/portfolio/shell/PortfolioQueryToolbar';
import { PortfolioEmptyState } from '@/features/portfolio/shell/PortfolioEmptyState';
import { PortfolioBoard } from '@/features/portfolio/board/PortfolioBoard';
import { PortfolioTimeline } from '@/features/portfolio/timeline/PortfolioTimeline';
import { PortfolioRoadmap } from '@/features/portfolio/roadmap/PortfolioRoadmap';
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
    const plannerActive = hasBoards && (viewMode === 'planner' || viewMode === 'calendar');
    const dashboardActive = Boolean(selectedBoardId) && viewMode === 'dashboard';
    const controlActive = Boolean(selectedBoardId) && viewMode === 'control';
    const tableActive = Boolean(selectedBoardId) && viewMode === 'table';
    const docsOpen = useAppStore((state) => state.appMode === 'docs');

    return (
        <>
            <a className="skip-link" href={docsOpen ? '#docsTopicTitle' : '#portfolioMain'}>{t('common.skipToContent')}</a>
            <AppHeader theme={theme} onToggleTheme={toggleTheme} />
            {/* Hidden, not unmounted, while the documentation is open: the
                workspace keeps its selection, view, filters and drafts. */}
            <main className={`view${fileDropActive ? ' file-drop-active' : ''}`} id="portfolioView" aria-labelledby="appTitle" hidden={docsOpen}>
                <div className="view-main" id="portfolioMain" tabIndex={-1}>
                    {hasBoards && <><PortfolioToolbar /><PortfolioChips /><PortfolioQueryToolbar /></>}
                    <div className={`portfolio-board-wrap${hasBoards ? '' : ' is-empty'}${tableActive || controlActive ? ' table-active' : ''}${dashboardActive ? ' dashboard-active' : ''}`} id="portfolioBoardWrap">
                        <PortfolioReadOnlyNotice />
                        <ConversationDraftRecovery />
                        <ProjectFileNotices />
                        <PendingProjectTransfers />
                        {!hasBoards ? <PortfolioEmptyState /> : <>
                        {showTimeline && <PortfolioTimeline />}
                        <PortfolioBulkActions />
                        <PortfolioBoard hidden={roadmapActive || plannerActive || tableActive || dashboardActive || controlActive} />
                        <PortfolioDashboard hidden={!dashboardActive} />
                        <PortfolioControl hidden={!controlActive} />
                        <PortfolioTable hidden={!tableActive} />
                        <PortfolioRoadmap hidden={!roadmapActive} />
                        <PortfolioPlanner hidden={!plannerActive} />
                        </>}
                    </div>
                </div>
                <div className="file-drop-overlay" id="portfolioDropOverlay" aria-hidden="true">{t('app.dropProjectFiles')}</div>
            </main>
            <DocsView />
            <ErrorBoundary name="Dialogs" onError={() => closeAllDialogs(actions)}>
                <AppSettingsDialog showTimeline={showTimeline} onShowTimelineChange={(visible) => {
                    if (!visible) actions.clearPortfolioTimelineSelection({ keepModals: true });
                    setShowTimeline(visible);
                }} />
                <ShortcutsDialog />
                <CommandPalette />
                <ProjectControlDialog />
                <TaskDetailDialog />
                <RoadmapEntityDialog />
                <TaskEditorDialog />
                <ProjectSettingsDialog />
                <ProjectIdentityDialog />
                <AppMessageDialog />
                <ProjectReconciliationDialog />
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
