import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { useI18n } from '@/shared/i18n';
import { formatDate } from '@/domain/dates';
import type { FilterMenuField } from './PortfolioFilterMenu';

export function ActiveFilterTags({ fields, onClear, scope = '' }: {
    fields: (FilterMenuField & { key: string; reset: () => void })[]; onClear: () => void; scope?: string;
}) {
    const { t } = useI18n();
    if (!fields.length) return null;
    return <div className="portfolio-active-filters" id={scope ? `portfolioActiveFilters-${scope}` : 'portfolioActiveFilters'} role="group" aria-label={t('toolbar.activeFilters')}>
        {fields.map(field => {
            const values = Array.isArray(field.value) ? field.value : [field.value];
            const label = field.inputType === 'date' ? formatDate(String(field.value))
                : field.options.filter(option => values.includes(option.value)).map(option => option.label).join(', ') || values.join(', ');
            return <span className="portfolio-active-filter" key={field.id} data-filter={field.key}>
                <span className="portfolio-active-filter-name">{field.label}</span><span>{label}</span>
                <button type="button" aria-label={t('toolbar.removeFilter', { label: field.label, value: label })} onClick={field.reset}><WorkspaceIcon name="close" /></button>
            </span>;
        })}
        <button className="btn-text" id={scope ? `portfolioClearFilters-${scope}` : 'portfolioClearFilters'} type="button" onClick={onClear}>{t('toolbar.clearAllFilters')}</button>
    </div>;
}
