import { useLayoutEffect } from 'react';
import { applyPortfolioUrlState } from '../actions/portfolioNavigation';
import { handleShortcutKeydown } from '../actions/portfolioShortcuts';
import { setSelectedPortfolioCard } from '../actions/portfolioMutations';
import { useAppStore } from '../state/store';

function clearSelectionWhenClickingOutsideCards(event: MouseEvent) {
    const state = useAppStore.getState();
    if (!state.selectedPortfolioCardRef) return;
    if ((event.target as Element | null)?.closest?.('.portfolio-task-card')) return;
    setSelectedPortfolioCard(null, null);
}

// Document-level runtime: URL state, keyboard shortcuts, clearing the card
// selection on outside clicks.
export function usePortfolioRuntime(): void {
    useLayoutEffect(() => {
        applyPortfolioUrlState();

        const handlePopState = () => applyPortfolioUrlState();

        document.addEventListener('keydown', handleShortcutKeydown);
        document.addEventListener('click', clearSelectionWhenClickingOutsideCards);
        window.addEventListener('popstate', handlePopState);

        return () => {
            document.removeEventListener('keydown', handleShortcutKeydown);
            document.removeEventListener('click', clearSelectionWhenClickingOutsideCards);
            window.removeEventListener('popstate', handlePopState);
        };
    }, []);
}
