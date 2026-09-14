import { useLayoutEffect } from 'react';
import { applyPortfolioUrlState } from '../actions/portfolioNavigation.js';
import { handleShortcutKeydown } from '../actions/portfolioShortcuts.js';
import { openDialog } from '../actions/dialogs.js';
import {
    handleTimelineSliderPointerCommit,
    setSelectedPortfolioCard
} from '../actions/portfolioMutations.js';
import { useAppStore } from '../state/store.js';
import { applyPortfolioViewVisibility } from './portfolioViewVisibility.js';

function clearSelectionWhenClickingOutsideCards(event) {
    const state = useAppStore.getState();
    if (!state.selectedPortfolioCardRef) return;
    if (event.target?.closest?.('.portfolio-task-card')) return;
    setSelectedPortfolioCard(null, null);
}

export function usePortfolioRuntime() {
    useLayoutEffect(() => {
        document.title = 'TeamOS → Kanban';
        applyPortfolioUrlState();

        const handleShortcuts = () => openDialog('shortcuts');
        const handleHelp = () => openDialog('help');
        const handlePopState = () => applyPortfolioUrlState();
        const shortcutsButton = document.getElementById('openShortcutsBtn');
        const helpButton = document.getElementById('openHelpBtn');

        shortcutsButton?.addEventListener('click', handleShortcuts);
        helpButton?.addEventListener('click', handleHelp);
        document.addEventListener('keydown', handleShortcutKeydown);
        document.addEventListener('click', clearSelectionWhenClickingOutsideCards);
        document.addEventListener('pointerup', handleTimelineSliderPointerCommit);
        document.addEventListener('pointercancel', handleTimelineSliderPointerCommit);
        window.addEventListener('popstate', handlePopState);

        return () => {
            shortcutsButton?.removeEventListener('click', handleShortcuts);
            helpButton?.removeEventListener('click', handleHelp);
            document.removeEventListener('keydown', handleShortcutKeydown);
            document.removeEventListener('click', clearSelectionWhenClickingOutsideCards);
            document.removeEventListener('pointerup', handleTimelineSliderPointerCommit);
            document.removeEventListener('pointercancel', handleTimelineSliderPointerCommit);
            window.removeEventListener('popstate', handlePopState);
        };
    }, []);
}

export function PortfolioRuntime() {
    usePortfolioRuntime();
    return null;
}

export function PortfolioViewVisibility() {
    const viewMode = useAppStore((state) => state.selectedPortfolioViewMode);
    const boardCount = useAppStore((state) => state.portfolioBoards.length);
    const selectedBoardId = useAppStore((state) => state.selectedPortfolioBoardId);

    useLayoutEffect(() => {
        applyPortfolioViewVisibility({ viewMode, boardCount, selectedBoardId });
    }, [viewMode, boardCount, selectedBoardId]);

    return null;
}
