import type { Theme } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HelpDialog } from './components/dialogs/HelpDialog';
import { ShortcutsDialog } from './components/dialogs/ShortcutsDialog';
import { RoadmapEntityDialog } from './components/dialogs/RoadmapEntityDialog';
import { TaskDetailDialog } from './components/dialogs/TaskDetailDialog';
import { TaskEditorDialog } from './components/dialogs/TaskEditorDialog';
import { AppMessageDialog } from './components/dialogs/AppMessageDialog';
import { UndoToast } from './components/UndoToast';
import { PortfolioBulkActions, PortfolioChips, PortfolioToolbar } from './components/PortfolioControls';
import { PortfolioBoard } from './components/PortfolioBoard';
import { PortfolioTimeline } from './components/PortfolioTimeline';
import { PortfolioRoadmap } from './components/PortfolioRoadmap';
import { PortfolioCalendar } from './components/PortfolioCalendar';
import { usePortfolioRuntime } from './hooks/usePortfolioRuntime';
import { useTheme } from './hooks/useTheme';
import { usePortfolioFileIntegration } from './hooks/usePortfolioFileIntegration';
import { closeDialog, openDialog } from './actions/dialogs';
import { cancelAppMessages } from './actions/appMessages';
import { createNewProject, importPortfolioProjects } from './actions/portfolioFiles';
import type { PortfolioMutationActions } from './actions/portfolioMutations';
import { PortfolioActionsProvider, usePortfolioActions } from './application/PortfolioActionsContext';
import { useAppStore } from './state/store';

// A dialog that fails to render is closed so keyboard shortcuts are not left
// suppressed by a dialog nobody can see.
function closeAllDialogs(actions: Pick<PortfolioMutationActions, 'closeTaskEditor' | 'closeTaskDetail' | 'closeRoadmapEntity'>) {
    cancelAppMessages();
    actions.closeTaskEditor();
    actions.closeTaskDetail();
    actions.closeRoadmapEntity();
    closeDialog();
}

function AppHeader({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
    const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    return (
        <div className="header">
            <div className="app-title">TeamOS → Kanban</div>
            <div className="header-actions">
                <button
                    className="btn icon-btn theme-toggle-btn"
                    id="themeToggleBtn"
                    type="button"
                    aria-label={themeLabel}
                    title={themeLabel}
                    aria-pressed={theme === 'dark' ? 'true' : 'false'}
                    onClick={onToggleTheme}
                >
                    <svg className="theme-toggle-icon theme-toggle-icon-light" aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.8 6.8 0 0 0 9.8 9.8Z" />
                    </svg>
                    <svg className="theme-toggle-icon theme-toggle-icon-dark" aria-hidden="true" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2" />
                        <path d="M12 20v2" />
                        <path d="m4.93 4.93 1.41 1.41" />
                        <path d="m17.66 17.66 1.41 1.41" />
                        <path d="M2 12h2" />
                        <path d="M20 12h2" />
                        <path d="m6.34 17.66-1.41 1.41" />
                        <path d="m19.07 4.93-1.41 1.41" />
                    </svg>
                </button>
                <button className="btn" id="openShortcutsBtn" onClick={() => openDialog('shortcuts')}>Shortcuts</button>
                <button className="btn" id="openHelpBtn" onClick={() => openDialog('help')}>Help</button>
                <button className="btn" id="importProjectsBtn" onClick={() => { void importPortfolioProjects(); }}>Import Projects</button>
                <button className="btn btn-primary" id="newProjectBtn" onClick={() => { void createNewProject(); }}>+ New Project</button>
            </div>
        </div>
    );
}

function AppContent() {
    const actions = usePortfolioActions();
    usePortfolioRuntime();
    const { theme, toggleTheme } = useTheme();
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
                <div className="file-drop-overlay" id="portfolioDropOverlay" aria-hidden="true">Drop project files to import</div>
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
