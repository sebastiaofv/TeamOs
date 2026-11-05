import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/features/portfolio/state/store';
import { setPortfolioFilter, setPortfolioSort } from '@/features/portfolio/commands/portfolioControls';
import { setTableFilter, setTableSort } from '@/features/portfolio/table/tableControls';
import { DEFAULT_TABLE_SORT } from '@/features/portfolio/table/tableModel';
import { COLUMN_LABELS } from '@/features/portfolio/table/tableLabels';
import { portfolioSortSelectValueFromKey } from '@/domain/board';
import { useFocusTarget } from '@/shared/hooks/useFocusTarget';
import { useI18n } from '@/shared/i18n';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { PortfolioActiveFilters, PortfolioToolbarFilters } from './PortfolioFilters';

/** Reused fields inside the active view's existing toolbar. */
export function PortfolioQueryControls({ active = true }: { active?: boolean }) {
    return active ? <QueryControlsContent /> : null;
}

function QueryControlsContent() {
    const { t } = useI18n();
    const state = useAppStore(useShallow((s) => ({
        filters: s.portfolioFilters, sort: s.portfolioSortKey, view: s.selectedPortfolioViewMode,
        boardId: s.selectedPortfolioBoardId, tableSorts: s.portfolioTableSortByBoardId,
        count: s.portfolioVisibleRows.length
    })));
    const table = state.view === 'table';
    const tableSort = state.tableSorts[state.boardId] || DEFAULT_TABLE_SORT;
    const tableSortValue = tableSort.column === 'title' ? 'name'
        : ['priority', 'effort', 'score'].includes(tableSort.column) ? tableSort.column : 'custom';
    const sortValue = table ? tableSortValue : portfolioSortSelectValueFromKey(state.sort);
    const sortRef = useFocusTarget<HTMLSelectElement>('portfolioSort');
    const search = state.filters.search;
    return <div className="portfolio-query-fields" role="group" aria-label={t('toolbar.filters')}>
        <div className="portfolio-query-controls">
            <div className="section-search">
                <WorkspaceIcon name="search" />
                <input id="portfolioSearchInput" type="search" aria-label={t('toolbar.searchWorkitems')} placeholder={t('toolbar.searchWorkitems')}
                    value={search} onChange={(event) => table ? setTableFilter('search', event.target.value) : setPortfolioFilter('search', event.target.value)} />
                {search && <button className="section-search-clear" id="portfolioSearchClearBtn" type="button"
                    aria-label={table ? t('palette.cmdClearTableSearch', { query: search }) : t('palette.clearSearch')}
                    title={table ? t('palette.cmdClearTableSearch', { query: search }) : t('palette.clearSearch')}
                    onClick={() => table ? setTableFilter('search', '') : setPortfolioFilter('search', '')}>×</button>}
            </div>
            <PortfolioToolbarFilters />
            <div className="filter-group section-sort">
                <WorkspaceIcon name="sort" />
                <label htmlFor="portfolioSortSelect">{t('toolbar.sort')}</label>
                <select id="portfolioSortSelect" ref={sortRef} value={sortValue} onChange={(event) => {
                    const value = event.target.value;
                    if (!table) setPortfolioSort(value);
                    else if (value === 'name') setTableSort('title');
                    else if (value === 'priority' || value === 'effort' || value === 'score') setTableSort(value);
                }}>
                    {table && tableSortValue === 'custom' && <option value="custom">{tableSort.column === 'score' ? t('toolbar.score') : t(COLUMN_LABELS[tableSort.column])}</option>}
                    <option value="name">{t('toolbar.name')}</option>
                    <option value="priority">{t('toolbar.priority').replace(':', '')}</option>
                    <option value="effort">{t('toolbar.effort').replace(':', '')}</option>
                    <option value="score">{t('toolbar.score')}</option>
                </select>
            </div>
        </div>
        <PortfolioActiveFilters />
        {!table && <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{t('toolbar.resultsCount', { count: state.count })}</span>}
    </div>;
}
