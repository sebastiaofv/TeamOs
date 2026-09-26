// Opens the command palette for the task in front of the user: the task
// whose details are open (the palette replaces that dialog), else the hovered
// card, else the selected card.

import { openDialog } from '@/app/overlays/dialogs';
import { useAppStore } from '@/features/portfolio/state/store';

export function openCommandPalette(initialQuery = ''): void {
    const state = useAppStore.getState();
    const detail = state.activeDialog === 'taskDetail' ? state.portfolioDetailContext : null;
    if (detail) useAppStore.setState({ portfolioDetailContext: null });
    const ref = detail || state.hoveredPortfolioCardRef || state.selectedPortfolioCardRef;
    openDialog('commandPalette', { contextTask: ref ? { boardId: ref.boardId, taskId: Number(ref.taskId) } : null, initialQuery });
}

export const PALETTE_SHORTCUT_LABEL = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '⌘K'
    : 'Ctrl K';

// Event the Filters panel listens for, so the palette can open it.
export const OPEN_FILTERS_EVENT = 'teamOs:open-filters';

export function requestOpenFilters(): void {
    window.dispatchEvent(new Event(OPEN_FILTERS_EVENT));
}
