import { useAppStore } from '@/features/portfolio/state/store';
import { DEFAULT_TABLE_FILTERS, type TableFilters } from './tableModel';

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

export function clearTableFilters(): void {
    const state = useAppStore.getState();
    const boardId = state.selectedPortfolioBoardId;
    if (!boardId) return;
    useAppStore.setState({
        portfolioTableFiltersByBoardId: {
            ...state.portfolioTableFiltersByBoardId,
            [boardId]: { ...DEFAULT_TABLE_FILTERS, statuses: [] }
        }
    });
}
