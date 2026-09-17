import { createPortal } from 'react-dom';
import { useAppStore } from '../state/store';
import { usePortfolioActions } from '../application/PortfolioActionsContext';

// The established markup and classes are rendered only while a toast is
// showing. A plain component rather than Radix Toast keeps the existing
// viewport and pointer behavior. pointer-events: auto keeps Undo clickable
// while a Radix modal has set pointer-events: none on body.
export function UndoToast() {
    const { performUndo } = usePortfolioActions();
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
