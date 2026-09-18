import { createPortal } from 'react-dom';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

// The established markup and classes are rendered only while a toast is
// showing. A plain component rather than Radix Toast keeps the existing
// viewport and pointer behavior. pointer-events: auto keeps Undo clickable
// while a Radix modal has set pointer-events: none on body.
export function UndoToast() {
    const { performUndo } = usePortfolioActions();
    const toast = useAppStore((s) => s.undoToast);
    const { t } = useI18n();
    if (!toast) return null;

    return createPortal(
        <div className="undo-toast active" id="undoToast" role="status" aria-live="polite" aria-atomic="true" style={{ pointerEvents: 'auto' }}>
            <span className="undo-toast-text" id="undoToastText">{toast.message}</span>
            <button className="btn" id="undoBtn" type="button" onClick={() => performUndo()}>{t('common.undo')}</button>
        </div>,
        document.body
    );
}
