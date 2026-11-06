import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/features/portfolio/state/store';
import { setPortfolioFilter } from '@/features/portfolio/commands/portfolioControls';
import { setTableFilter } from '@/features/portfolio/table/tableControls';
import { useI18n } from '@/shared/i18n';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { PortfolioActiveFilters, PortfolioToolbarFilters, type AdditionalPortfolioFilter } from './PortfolioFilters';
import type { WorkflowKind } from '@/domain/types';

/** Reused fields inside the active view's existing toolbar. */
type QueryProps = { boardMode?: WorkflowKind; scope?: string; additionalFields?: AdditionalPortfolioFilter[]; iconOnlyFilters?: boolean };
export function PortfolioQueryControls({ active = true, ...props }: QueryProps & { active?: boolean }) {
    return active ? <QueryControlsContent {...props} /> : null;
}

function QueryControlsContent({ boardMode, scope = '', additionalFields = [], iconOnlyFilters = false }: QueryProps) {
    const scopedId = (id: string) => scope ? `${id}-${scope}` : id;
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
                <input id={scopedId('portfolioSearchInput')} type="search" aria-label={t('toolbar.searchWorkitems')} placeholder={t(table ? 'toolbar.searchWorkitems' : 'toolbar.projectSearch')}
                    value={search} onChange={(event) => table ? setTableFilter('search', event.target.value) : setPortfolioFilter('search', event.target.value)} />
                {search && <button className="section-search-clear" id={scopedId('portfolioSearchClearBtn')} type="button"
                    aria-label={table ? t('palette.cmdClearTableSearch', { query: search }) : t('palette.clearSearch')}
                    title={table ? t('palette.cmdClearTableSearch', { query: search }) : t('palette.clearSearch')}
                    onClick={() => table ? setTableFilter('search', '') : setPortfolioFilter('search', '')}>×</button>}
            </div>
            <PortfolioToolbarFilters boardMode={boardMode} scope={scope} additionalFields={additionalFields} iconOnly={iconOnlyFilters} />
        </div>
        <PortfolioActiveFilters scope={scope} additionalFields={additionalFields} />
        {!table && <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{t('toolbar.resultsCount', { count: state.count })}</span>}
    </div>;
}
