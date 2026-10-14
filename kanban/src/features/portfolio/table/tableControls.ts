import { useAppStore } from '@/features/portfolio/state/store';
import { DEFAULT_TABLE_FILTERS, type TableFilters, type TableSort } from './tableModel';

// Session-only presentation state, shared by the table and command palette.
export function setTableFilter<K extends keyof TableFilters>(key: K, value: TableFilters[K]): void {
    const state = useAppStore.getState();
    const boardId = state.selectedPortfolioBoardId;
    if (!boardId) return;
    useAppStore.setState({
        portfolioTableFiltersByBoardId: {
            ...state.portfolioTableFiltersByBoardId,
            [boardId]: { ...DEFAULT_TABLE_FILTERS, ...state.portfolioTableFiltersByBoardId[boardId], [key]: value }
        }
    });
}

export function clearTableFilters(keepSearch = false): void {
    const state = useAppStore.getState();
    const boardId = state.selectedPortfolioBoardId;
    if (!boardId) return;
    useAppStore.setState({
        portfolioTableFiltersByBoardId: {
            ...state.portfolioTableFiltersByBoardId,
            [boardId]: { ...DEFAULT_TABLE_FILTERS, statuses: [], search: keepSearch ? state.portfolioTableFiltersByBoardId[boardId]?.search || '' : '' }
        }
    });
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
