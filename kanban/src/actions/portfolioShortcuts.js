import { selectPortfolioBoard } from './portfolioControls.js';
import { notifyAppStateChanged, useAppStore } from '../state/store.js';

function sameCard(left, right) {
    return Boolean(left && right)
        && left.boardId === right.boardId
        && Number(left.taskId) === Number(right.taskId);
}

function getSelectedPortfolioRow(state) {
    return (state.portfolioVisibleRows || []).find((row) => sameCard(row, state.selectedPortfolioCardRef)) || null;
}

function getHoveredPortfolioRow(state) {
    return (state.portfolioVisibleRows || []).find((row) => sameCard(row, state.hoveredPortfolioCardRef)) || null;
}

function escapeCssSelectorValue(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(value));
    return String(value).replace(/([\\"])/g, '\\$1');
}

export function getShortcutTargetPortfolioRow(state = useAppStore.getState()) {
    return getHoveredPortfolioRow(state) || getSelectedPortfolioRow(state);
}

export function selectAdjacentPortfolioCard(step) {
    const state = useAppStore.getState();
    const rows = Array.isArray(state.portfolioVisibleRows) ? state.portfolioVisibleRows : [];
    if (rows.length === 0) {
        useAppStore.setState({ selectedPortfolioCardRef: null });
        notifyAppStateChanged();
        return;
    }

    const currentIndex = state.selectedPortfolioCardRef
        ? rows.findIndex((row) => sameCard(row, state.selectedPortfolioCardRef))
        : -1;
    const nextIndex = currentIndex < 0
        ? (step > 0 ? 0 : rows.length - 1)
        : Math.min(rows.length - 1, Math.max(0, currentIndex + step));
    const row = rows[nextIndex];
    if (!row) return;
    useAppStore.setState({ selectedPortfolioCardRef: { boardId: row.boardId, taskId: Number(row.taskId) } });
    notifyAppStateChanged();
    requestAnimationFrame(() => {
        const selector = `.portfolio-task-card[data-board-id="${escapeCssSelectorValue(row.boardId)}"][data-task-id="${escapeCssSelectorValue(row.taskId)}"]`;
        document.querySelector(selector)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
}

export function focusPortfolioSearch() {
    document.getElementById('portfolioSearchInput')?.focus();
}

export function focusPortfolioSortControl() {
    document.getElementById('portfolioSortSelect')?.focus();
}

export function cyclePortfolioProjectChip(step) {
    const state = useAppStore.getState();
    const ids = [''].concat((state.portfolioBoards || []).map((board) => board.id));
    if (ids.length === 0) return;
    const currentIndex = Math.max(0, ids.indexOf(state.selectedPortfolioBoardId || ''));
    const next = (currentIndex + step + ids.length) % ids.length;
    selectPortfolioBoard(ids[next]);
}
