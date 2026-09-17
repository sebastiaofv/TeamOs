import { useLayoutEffect } from 'react';
import { applyPortfolioUrlState } from '../actions/portfolioNavigation';
import { handleShortcutKeydown } from '../actions/portfolioShortcuts';
import { usePortfolioActions } from '../application/PortfolioActionsContext';
import { useAppStore } from '../state/store';

function clearSelectionWhenClickingOutsideCards(event: MouseEvent, clearSelection: () => void) {
    const state = useAppStore.getState();
    if (!state.selectedPortfolioCardRef) return;
    if ((event.target as Element | null)?.closest?.('.portfolio-task-card')) return;
    clearSelection();
}

// Document-level runtime: URL state, keyboard shortcuts, clearing the card
// selection on outside clicks.
export function usePortfolioRuntime(): void {
    const actions = usePortfolioActions();

    useLayoutEffect(() => {
        applyPortfolioUrlState();

        const handlePopState = () => applyPortfolioUrlState();
        const handleKeydown = (event: KeyboardEvent) => handleShortcutKeydown(event, actions);
        const handleDocumentClick = (event: MouseEvent) => clearSelectionWhenClickingOutsideCards(
            event,
            () => actions.setSelectedPortfolioCard(null, null)
        );

        document.addEventListener('keydown', handleKeydown);
        document.addEventListener('click', handleDocumentClick);
        window.addEventListener('popstate', handlePopState);

        return () => {
            document.removeEventListener('keydown', handleKeydown);
            document.removeEventListener('click', handleDocumentClick);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [actions]);
}
