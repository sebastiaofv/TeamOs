import { useLayoutEffect } from 'react';
import { applyPortfolioUrlState } from '../actions/portfolioNavigation.js';
import { handleShortcutKeydown } from '../actions/portfolioShortcuts.js';
import {
    handleTimelineSliderPointerCommit,
    setSelectedPortfolioCard
} from '../actions/portfolioMutations.js';
import { useAppStore } from '../state/store.js';

function clearSelectionWhenClickingOutsideCards(event) {
    const state = useAppStore.getState();
    if (!state.selectedPortfolioCardRef) return;
    if (event.target?.closest?.('.portfolio-task-card')) return;
    setSelectedPortfolioCard(null, null);
}

// Document-level runtime: URL state, keyboard shortcuts, clearing the card
// selection on outside clicks, and ending timeline slider drags.
export function usePortfolioRuntime() {
    useLayoutEffect(() => {
        applyPortfolioUrlState();

        const handlePopState = () => applyPortfolioUrlState();

        document.addEventListener('keydown', handleShortcutKeydown);
        document.addEventListener('click', clearSelectionWhenClickingOutsideCards);
        document.addEventListener('pointerup', handleTimelineSliderPointerCommit);
        document.addEventListener('pointercancel', handleTimelineSliderPointerCommit);
        window.addEventListener('popstate', handlePopState);

        return () => {
            document.removeEventListener('keydown', handleShortcutKeydown);
            document.removeEventListener('click', clearSelectionWhenClickingOutsideCards);
            document.removeEventListener('pointerup', handleTimelineSliderPointerCommit);
            document.removeEventListener('pointercancel', handleTimelineSliderPointerCommit);
            window.removeEventListener('popstate', handlePopState);
        };
    }, []);
}
