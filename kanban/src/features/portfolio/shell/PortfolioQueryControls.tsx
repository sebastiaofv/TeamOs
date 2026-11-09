import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/features/portfolio/state/store';
import { useQueryFilters } from './QueryFilterContext';
import { useI18n } from '@/shared/i18n';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { PortfolioToolbarFilters, type AdditionalPortfolioFilter } from './PortfolioFilters';
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
        count: s.portfolioVisibleRows.length
    })));
    const table = !boardMode;
    const { filters, setFilter } = useQueryFilters();
    const search = filters.search;
    return <div className="portfolio-query-fields" role="group" aria-label={t('toolbar.filters')}>
        <div className="portfolio-query-controls">
            <div className="section-search">
                <WorkspaceIcon name="search" />
                <input id={scopedId('portfolioSearchInput')} type="search" aria-label={t('toolbar.searchWorkitems')} placeholder={t(table ? 'toolbar.searchWorkitems' : 'toolbar.projectSearch')}
                    value={search} onChange={(event) => setFilter('search', event.target.value)} />
                {search && <button className="section-search-clear" id={scopedId('portfolioSearchClearBtn')} type="button"
                    aria-label={table ? t('palette.cmdClearTableSearch', { query: search }) : t('palette.clearSearch')}
                    title={table ? t('palette.cmdClearTableSearch', { query: search }) : t('palette.clearSearch')}
                    onClick={() => setFilter('search', '')}>×</button>}
            </div>
            <PortfolioToolbarFilters boardMode={boardMode} scope={scope} additionalFields={additionalFields} iconOnly={iconOnlyFilters} />
        </div>
        {!table && <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{t('toolbar.resultsCount', { count: state.count })}</span>}
    </div>;
}
