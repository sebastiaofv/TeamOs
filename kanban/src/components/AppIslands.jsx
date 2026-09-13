import { IslandErrorBoundary } from './IslandErrorBoundary.jsx';
import { HelpDialog } from './dialogs/HelpDialog.jsx';

// The single React root. Each island is wrapped in its own error boundary.
// Dialogs portal to document.body; later islands use createPortal into the
// legacy containers they replace.
export function AppIslands() {
    return (
        <>
            <IslandErrorBoundary island="HelpDialog">
                <HelpDialog />
            </IslandErrorBoundary>
        </>
    );
}
