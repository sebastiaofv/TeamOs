import { createContext, useContext } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { clearPortfolioFilters, setPortfolioFilter } from '@/features/portfolio/commands/portfolioControls';
import type { PortfolioFilters } from '@/features/portfolio/types';

export type QueryFilterModel = {
    filters: PortfolioFilters;
    isBoard?: boolean;
    setFilter: (key: keyof PortfolioFilters, value: unknown) => void;
    clearPanel: () => void;
};
export const QueryFilterContext = createContext<QueryFilterModel | null>(null);

export function useQueryFilters(): QueryFilterModel {
    const local = useContext(QueryFilterContext);
    const filters = useAppStore(state => state.portfolioFilters);
    return local || { filters, isBoard: true, setFilter: setPortfolioFilter, clearPanel: clearPortfolioFilters };
}
