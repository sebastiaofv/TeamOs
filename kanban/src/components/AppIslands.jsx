import { IslandErrorBoundary } from './IslandErrorBoundary.jsx';
import { HelpDialog } from './dialogs/HelpDialog.jsx';
import { ShortcutsDialog } from './dialogs/ShortcutsDialog.jsx';
import { RoadmapEntityDialog } from './dialogs/RoadmapEntityDialog.jsx';
import { UndoToast } from './UndoToast.jsx';
import { closeDialog } from '../actions/dialogs.js';
import { closeRoadmapEntity } from '../actions/legacyHost.js';

// The single React root. Each island is wrapped in its own error boundary;
// `onError` clears the island's state if it fails to render. Dialogs portal to
// document.body; later islands use createPortal into the legacy containers
// they replace.
export function AppIslands() {
    return (
        <>
            <IslandErrorBoundary island="ShortcutsDialog" onError={() => closeDialog('shortcuts')}>
                <ShortcutsDialog />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="HelpDialog" onError={() => closeDialog('help')}>
                <HelpDialog />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="RoadmapEntityDialog" onError={() => closeRoadmapEntity()}>
                <RoadmapEntityDialog />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="UndoToast">
                <UndoToast />
            </IslandErrorBoundary>
        </>
    );
}
