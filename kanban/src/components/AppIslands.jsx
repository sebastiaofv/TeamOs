import { IslandErrorBoundary } from './IslandErrorBoundary.jsx';
import { HelpDialog } from './dialogs/HelpDialog.jsx';
import { ShortcutsDialog } from './dialogs/ShortcutsDialog.jsx';
import { RoadmapEntityDialog } from './dialogs/RoadmapEntityDialog.jsx';
import { TaskDetailDialog } from './dialogs/TaskDetailDialog.jsx';
import { TaskEditorDialog } from './dialogs/TaskEditorDialog.jsx';
import { UndoToast } from './UndoToast.jsx';
import { PortfolioControls } from './PortfolioControls.jsx';
import { PortfolioBoard } from './PortfolioBoard.jsx';
import { PortfolioTimeline } from './PortfolioTimeline.jsx';
import { PortfolioRoadmap } from './PortfolioRoadmap.jsx';
import { PortfolioCalendar } from './PortfolioCalendar.jsx';
import { PortfolioFileIntegration } from '../hooks/usePortfolioFileIntegration.js';
import { ThemeIntegration } from '../hooks/useTheme.js';
import { PortfolioRuntime, PortfolioViewVisibility } from '../hooks/usePortfolioRuntime.js';
import { closeDialog } from '../actions/dialogs.js';
import { closeRoadmapEntity, closeTaskDetail, closeTaskEditor } from '../actions/portfolioMutations.js';

// The single React root. Each island is wrapped in its own error boundary;
// `onError` clears the island's state if it fails to render.
export function AppIslands() {
    return (
        <>
            <IslandErrorBoundary island="PortfolioRuntime" onError={() => {}}>
                <PortfolioRuntime />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="PortfolioViewVisibility" onError={() => {}}>
                <PortfolioViewVisibility />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="ThemeIntegration" onError={() => {}}>
                <ThemeIntegration />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="PortfolioFileIntegration" onError={() => {}}>
                <PortfolioFileIntegration />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="ShortcutsDialog" onError={() => closeDialog('shortcuts')}>
                <ShortcutsDialog />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="HelpDialog" onError={() => closeDialog('help')}>
                <HelpDialog />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="TaskDetailDialog" onError={() => closeTaskDetail()}>
                <TaskDetailDialog />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="RoadmapEntityDialog" onError={() => closeRoadmapEntity()}>
                <RoadmapEntityDialog />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="TaskEditorDialog" onError={() => closeTaskEditor()}>
                <TaskEditorDialog />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="UndoToast">
                <UndoToast />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="PortfolioControls" onError={() => {}}>
                <PortfolioControls />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="PortfolioBoard" onError={() => {}}>
                <PortfolioBoard />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="PortfolioTimeline" onError={() => {}}>
                <PortfolioTimeline />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="PortfolioRoadmap" onError={() => {}}>
                <PortfolioRoadmap />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="PortfolioCalendar" onError={() => {}}>
                <PortfolioCalendar />
            </IslandErrorBoundary>
        </>
    );
}
