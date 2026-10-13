// URL state for the portfolio shell. This module only translates between the
// address bar and the store; React is responsible for rendering the result.

import {
    normalizePortfolioSortDir,
    normalizePortfolioSortKey,
    normalizePortfolioViewMode
} from '@/domain/board';
import { normalizePortfolioBlockedFilter } from '@/domain/task';
import { DEFAULT_PORTFOLIO_FILTERS, normalizePortfolioFilterSet } from '@/domain/portfolioFilters';
import { useAppStore, type AppState, type AppStore } from '@/features/portfolio/state/store';

export type UrlWindow = Pick<Window, 'location' | 'history'>;

function getDefaultWindow(): UrlWindow | null {
    return typeof window !== 'undefined' ? window : null;
}

function readQueryParam(key: string, fallback = '', windowRef: UrlWindow | null = getDefaultWindow()): string {
    if (!windowRef?.location) return fallback;
    const params = new URLSearchParams(windowRef.location.search);
    return params.get(key) ?? fallback;
}

export function updatePortfolioUrlState(windowRef: UrlWindow | null = getDefaultWindow(), state: AppState = useAppStore.getState()): void {
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
    const aggregateView = state.selectedPortfolioViewMode === 'calendar' || state.selectedPortfolioViewMode === 'planner';
    if (aggregateView && (state.portfolioBoards || []).length > 0) {
        params.set('pv', state.selectedPortfolioViewMode);
    } else if (state.selectedPortfolioBoardId && (state.selectedPortfolioViewMode === 'roadmap' || state.selectedPortfolioViewMode === 'table')) {
        params.set('pv', state.selectedPortfolioViewMode);
    }

    const query = params.toString();
    const nextUrl = `${windowRef.location.pathname}${query ? `?${query}` : ''}`;
    if (nextUrl !== `${windowRef.location.pathname}${windowRef.location.search}`) {
        windowRef.history.replaceState(null, '', nextUrl);
    }
}

export function applyPortfolioUrlState({ store = useAppStore, windowRef = getDefaultWindow() }: { store?: AppStore; windowRef?: UrlWindow | null } = {}): void {
    if (!windowRef?.location) return;
    const portfolioSort = readQueryParam('ps', 'priority', windowRef);
    const portfolioSortDir = readQueryParam('pd', 'asc', windowRef);
    const portfolioBoard = readQueryParam('pb', '', windowRef);
    const portfolioViewMode = readQueryParam('pv', 'board', windowRef);

    store.setState({
        portfolioFilters: normalizePortfolioFilterSet({
            search: readQueryParam('pq', '', windowRef),
            priority: readQueryParam('pp', '', windowRef),
            assignee: readQueryParam('pu', '', windowRef),
            blocked: readQueryParam('pbk', 'all', windowRef),
            effort: readQueryParam('pe', '', windowRef),
            archive: readQueryParam('pa', 'active', windowRef)
        }),
        portfolioSortKey: normalizePortfolioSortKey(portfolioSort),
        portfolioSortDir: normalizePortfolioSortDir(portfolioSortDir),
        selectedPortfolioBoardId: portfolioBoard,
        selectedPortfolioViewMode: normalizePortfolioViewMode(portfolioViewMode)
    });

    updatePortfolioUrlState(windowRef, store.getState());
}
