import { useAppStore } from '@/features/portfolio/state/store';
import { DEFAULT_PORTFOLIO_FILTERS, normalizePortfolioFilterValue } from '@/domain/portfolioFilters';
import type { TableFilters, TableSort } from './tableModel';

export type TableFilterState = TableFilters & { type: string };
export const DEFAULT_TABLE_FILTER_STATE: TableFilterState = Object.freeze({ ...DEFAULT_PORTFOLIO_FILTERS, type: '' });

export function getTableFilters(scope = useAppStore.getState().activeTableFilterScope): TableFilterState {
    return useAppStore.getState().tableFiltersByScope[scope] || DEFAULT_TABLE_FILTER_STATE;
}

export function setTableFilter<K extends keyof TableFilterState>(key: K, value: unknown, scope = useAppStore.getState().activeTableFilterScope): void {
    if (!scope) return;
    useAppStore.setState(state => ({ tableFiltersByScope: { ...state.tableFiltersByScope,
        [scope]: { ...(state.tableFiltersByScope[scope] || DEFAULT_TABLE_FILTER_STATE), [key]: key === 'type' ? (typeof value === 'string' ? value : '') : normalizePortfolioFilterValue(key, value) }
    } }));
}

export function clearTableFilters(keepSearch = false, scope = useAppStore.getState().activeTableFilterScope): void {
    if (!scope) return;
    useAppStore.setState(state => ({ tableFiltersByScope: { ...state.tableFiltersByScope,
        [scope]: { ...DEFAULT_TABLE_FILTER_STATE, search: keepSearch ? (state.tableFiltersByScope[scope]?.search || '') : '' }
    } }));
}

export function clearTablePanelFilters(scope: string): void {
    clearTableFilters(true, scope);
}

export function setTableSort(column: TableSort['column'], direction: TableSort['direction'] = 'asc'): void {
    const state = useAppStore.getState();
    if (!state.selectedPortfolioBoardId) return;
    useAppStore.setState({ portfolioTableSortByBoardId: { ...state.portfolioTableSortByBoardId,
        [state.selectedPortfolioBoardId]: { column, direction }
    } });
}
