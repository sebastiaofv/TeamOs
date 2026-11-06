import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/features/portfolio/state/store';
import { setPortfolioFilter } from '@/features/portfolio/commands/portfolioControls';
import { setTableFilter } from '@/features/portfolio/table/tableControls';
import { useI18n } from '@/shared/i18n';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { PortfolioActiveFilters, PortfolioToolbarFilters } from './PortfolioFilters';
import type { WorkflowKind } from '@/domain/types';

/** Reused fields inside the active view's existing toolbar. */
export function PortfolioQueryControls({ active = true, boardMode }: { active?: boolean; boardMode?: WorkflowKind }) {
    return active ? <QueryControlsContent boardMode={boardMode} /> : null;
}

function QueryControlsContent({ boardMode }: { boardMode?: WorkflowKind }) {
    const { t } = useI18n();
    const state = useAppStore(useShallow((s) => ({
        filters: s.portfolioFilters, view: s.selectedPortfolioViewMode,
        count: s.portfolioVisibleRows.length
    })));
    const table = state.view === 'table';
    const search = state.filters.search;
    return <div className="portfolio-query-fields" role="group" aria-label={t('toolbar.filters')}>
        <div className="portfolio-query-controls">
            <div className="section-search">
                <WorkspaceIcon name="search" />
                <input id="portfolioSearchInput" type="search" aria-label={t('toolbar.searchWorkitems')} placeholder={t(table ? 'toolbar.searchWorkitems' : 'toolbar.projectSearch')}
                    value={search} onChange={(event) => table ? setTableFilter('search', event.target.value) : setPortfolioFilter('search', event.target.value)} />
                {search && <button className="section-search-clear" id="portfolioSearchClearBtn" type="button"
                    aria-label={table ? t('palette.cmdClearTableSearch', { query: search }) : t('palette.clearSearch')}
                    title={table ? t('palette.cmdClearTableSearch', { query: search }) : t('palette.clearSearch')}
                    onClick={() => table ? setTableFilter('search', '') : setPortfolioFilter('search', '')}>×</button>}
            </div>
            <PortfolioToolbarFilters boardMode={boardMode} />
        </div>
        <PortfolioActiveFilters />
        {!table && <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{t('toolbar.resultsCount', { count: state.count })}</span>}
    </div>;
}
