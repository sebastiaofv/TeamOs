import { createPortal } from 'react-dom';
import { useAppStore } from '../state/store.js';
import { performUndo } from '../actions/portfolioMutations.js';

// Legacy markup and classes, rendered only while a toast is showing. A plain
// component rather than Radix Toast, which would add swipe, a viewport and
// aria-live that legacy never had. pointer-events: auto keeps Undo clickable
// while a Radix modal has set pointer-events: none on body.
export function UndoToast() {
    const toast = useAppStore((s) => s.undoToast);
    if (!toast) return null;

    return createPortal(
        <div className="undo-toast active" id="undoToast" style={{ pointerEvents: 'auto' }}>
            <span className="undo-toast-text" id="undoToastText">{toast.message}</span>
            <button className="btn" id="undoBtn" onClick={() => performUndo()}>Undo</button>
        </div>,
        document.body
    );
}
