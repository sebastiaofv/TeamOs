// URL state for the portfolio shell. This module only translates between the
// address bar and the store; React is responsible for rendering the result.

import { EFFORT_BUCKETS } from '../domain/constants.js';
import {
    normalizePortfolioSortDir,
    normalizePortfolioSortKey,
    normalizePortfolioViewMode
} from '../domain/board.js';
import { normalizeAssignee, normalizePortfolioBlockedFilter } from '../domain/task.js';
import { notifyAppStateChanged, useAppStore } from '../state/store.js';
import { refreshPortfolioState } from '../state/portfolioViewState.js';
import { DEFAULT_PORTFOLIO_FILTERS } from '../selectors/portfolioViews.js';

function getDefaultWindow() {
    return typeof window !== 'undefined' ? window : null;
}

function readQueryParam(key, fallback = '', windowRef = getDefaultWindow()) {
    if (!windowRef?.location) return fallback;
    const params = new URLSearchParams(windowRef.location.search);
    return params.get(key) ?? fallback;
}

export function updatePortfolioUrlState(windowRef = getDefaultWindow(), state = useAppStore.getState()) {
    if (!windowRef?.history || !windowRef.location) return;
    const params = new URLSearchParams();
    const filters = { ...DEFAULT_PORTFOLIO_FILTERS, ...(state.portfolioFilters || {}) };
    const portfolioSearch = filters.search || '';
    const portfolioPriority = filters.priority || '';
    const portfolioAssignee = filters.assignee || '';
    const portfolioBlocked = normalizePortfolioBlockedFilter(filters.blocked || 'all');
    const portfolioEffort = filters.effort || '';
    const portfolioArchive = filters.archive || 'active';

    if (portfolioSearch) params.set('pq', portfolioSearch);
    if (portfolioPriority) params.set('pp', portfolioPriority);
    if (portfolioAssignee) params.set('pu', portfolioAssignee);
    if (portfolioBlocked !== 'all') params.set('pbk', portfolioBlocked);
    if (portfolioEffort) params.set('pe', portfolioEffort);
    if (portfolioArchive !== 'active') params.set('pa', portfolioArchive);
    if (state.portfolioSortKey !== 'priority') params.set('ps', state.portfolioSortKey);
    if (state.portfolioSortDir === 'desc') params.set('pd', state.portfolioSortDir);
    if (state.selectedPortfolioBoardId) params.set('pb', state.selectedPortfolioBoardId);
    if (state.selectedPortfolioViewMode === 'calendar' && (state.portfolioBoards || []).length > 0) {
        params.set('pv', state.selectedPortfolioViewMode);
    } else if (state.selectedPortfolioBoardId && state.selectedPortfolioViewMode === 'roadmap') {
        params.set('pv', state.selectedPortfolioViewMode);
    }

    const query = params.toString();
    const nextUrl = `${windowRef.location.pathname}${query ? `?${query}` : ''}`;
    if (nextUrl !== `${windowRef.location.pathname}${windowRef.location.search}`) {
        windowRef.history.replaceState(null, '', nextUrl);
    }
}

export function applyPortfolioUrlState({ store = useAppStore, windowRef = getDefaultWindow(), notify = store === useAppStore ? notifyAppStateChanged : () => {} } = {}) {
    if (!windowRef?.location) return;
    const portfolioSearch = readQueryParam('pq', '', windowRef);
    const portfolioPriority = readQueryParam('pp', '', windowRef);
    const portfolioAssignee = readQueryParam('pu', '', windowRef);
    const portfolioBlocked = readQueryParam('pbk', 'all', windowRef);
    const portfolioEffort = readQueryParam('pe', '', windowRef);
    const portfolioArchive = readQueryParam('pa', 'active', windowRef);
    const portfolioSort = readQueryParam('ps', 'priority', windowRef);
    const portfolioSortDir = readQueryParam('pd', 'asc', windowRef);
    const portfolioBoard = readQueryParam('pb', '', windowRef);
    const portfolioViewMode = readQueryParam('pv', 'board', windowRef);

    store.setState({
        portfolioFilters: {
            search: portfolioSearch,
            priority: ['', 'high', 'medium', 'low'].includes(portfolioPriority) ? portfolioPriority : '',
            assignee: normalizeAssignee(portfolioAssignee),
            blocked: normalizePortfolioBlockedFilter(portfolioBlocked),
            effort: ['', ...EFFORT_BUCKETS].includes(portfolioEffort) ? portfolioEffort : '',
            archive: ['active', 'all', 'archived'].includes(portfolioArchive) ? portfolioArchive : 'active'
        },
        portfolioSortKey: normalizePortfolioSortKey(portfolioSort),
        portfolioSortDir: normalizePortfolioSortDir(portfolioSortDir),
        selectedPortfolioBoardId: portfolioBoard,
        selectedPortfolioViewMode: normalizePortfolioViewMode(portfolioViewMode)
    });
    refreshPortfolioState({ store, notify });
    updatePortfolioUrlState(windowRef, store.getState());
}
