import { useAppStore } from '@/features/portfolio/state/store';
import { clearPortfolioFilters, setPortfolioFilter } from '@/features/portfolio/commands/portfolioControls';
import type { TableFilters, TableSort } from './tableModel';

// Compatibility entry points; every view uses the shared toolbar filters.
export function setTableFilter<K extends keyof TableFilters>(key: K, value: TableFilters[K]): void {
    setPortfolioFilter(key, value);
}

export function clearTableFilters(keepSearch = false): void {
    clearPortfolioFilters();
    if (!keepSearch) setPortfolioFilter('search', '');
}

export function setTableSort(column: TableSort['column'], direction: TableSort['direction'] = 'asc'): void {
    const state = useAppStore.getState();
    if (!state.selectedPortfolioBoardId) return;
    useAppStore.setState({
        portfolioTableSortByBoardId: {
            ...state.portfolioTableSortByBoardId,
            [state.selectedPortfolioBoardId]: { column, direction }
        }
    });
}
