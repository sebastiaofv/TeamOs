import { FloatingPanel, Popover } from '@/shared/ui/FloatingPanel';
import { useAppStore } from '@/features/portfolio/state/store';
import { DateInput } from '@/shared/ui/DateInput';
// The toolbar's Filters button, its dropdown panel, and the row of active
// filter tags. Filters apply as soon as they change; the panel closes on an
// outside click, Escape, or Done, returning focus to the button.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/shared/i18n';
import { OPEN_FILTERS_EVENT } from '@/features/portfolio/palette/openCommandPalette';

type FilterOption = { value: string; label: string };
export type FilterMenuField = {
    id: string;
    label: string;
    options: FilterOption[];
    value: string | string[];
    changed: boolean;
    multiple?: boolean;
    inputType?: 'date';
    hint?: string;
    onChange: (value: string | string[]) => void;
};

function FilterIcon() {
    return (
        <svg className="portfolio-filters-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M2 3h12l-4.5 5.5V13l-3-1.5v-3z" />
        </svg>
    );
}

// Board and Table use the same toolbar button, dropdown, field layout and focus behavior.
export function FilterMenu({ fields, activeCount, onClear, panelClassName = '', dismissOnBlur = false, title, children, scope = '', iconOnly = false, showClearAll = false }: {
    showClearAll?: boolean;
    scope?: string;
    iconOnly?: boolean;
    title?: string;
    children?: ReactNode;
    fields: FilterMenuField[];
    activeCount: number;
    onClear: () => void;
    panelClassName?: string;
    dismissOnBlur?: boolean;
}) {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const scopedId = (id: string) => scope ? `${id}-${scope}` : id;
    const focusSort = useRef(false);

    // The command palette's "Open filters" command.
    useEffect(() => {
        const onRequest = (event: Event) => {
            const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-portfolio-filter-trigger]')).filter(button => button.getClientRects().length > 0);
            const activeScope = useAppStore.getState().activeTableFilterScope;
            const requested = visible.find(button => button.closest('[data-table-filter-scope]')?.getAttribute('data-table-filter-scope') === activeScope) || visible[0];
            if (requested !== buttonRef.current) return;
            focusSort.current = event instanceof CustomEvent && Boolean(event.detail?.focusSort);
            setOpen(true);
            if (open && focusSort.current) panelRef.current?.querySelector<HTMLSelectElement>('#portfolioSortSelect')?.focus();
        };
        window.addEventListener(OPEN_FILTERS_EVENT, onRequest);
        return () => window.removeEventListener(OPEN_FILTERS_EVENT, onRequest);
    }, [open]);

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
        <div className="portfolio-filters">
            <Popover.Trigger asChild>
            <button
                ref={buttonRef}
                className={`btn${iconOnly ? ' icon-btn' : ''} portfolio-filters-btn${open ? ' open' : ''}${activeCount ? ' has-active' : ''}`}
                id={scopedId('portfolioFiltersBtn')}
                title={iconOnly ? title || t('toolbar.filtersButton') : undefined}
                data-portfolio-filter-trigger
                type="button"
                aria-expanded={open}
                aria-controls={scopedId('portfolioFiltersPanel')}
                aria-label={title || (activeCount ? t('toolbar.filtersActiveLabel', { count: activeCount }) : t('toolbar.filtersButton'))}
            >
                <FilterIcon />
                {!iconOnly && <span>{title || t('toolbar.filtersButton')}</span>}
                {activeCount > 0 && <span className="portfolio-filters-badge" aria-hidden="true">{activeCount}</span>}
            </button>
            </Popover.Trigger>
                <FloatingPanel align="start" ref={panelRef} className={`portfolio-filters-panel${panelClassName ? ` ${panelClassName}` : ''}`} id={scopedId('portfolioFiltersPanel')} role="dialog" aria-labelledby={titleId}
                    onFocusOutside={event => { if (!dismissOnBlur) event.preventDefault(); }}
                    onOpenAutoFocus={event => {
                        if (!focusSort.current) return;
                        event.preventDefault();
                        panelRef.current?.querySelector<HTMLSelectElement>('#portfolioSortSelect')?.focus();
                        focusSort.current = false;
                    }}>
                    <div className="portfolio-filters-panel-head">
                        <h2 id={titleId}>{title || t('toolbar.filtersButton')}</h2>
                        {showClearAll && <button className="btn-text" type="button" disabled={!activeCount} onClick={onClear}>{t('toolbar.clearAllFilters')}</button>}
                        <button className="btn-text" id={scopedId('resetPortfolioFiltersBtn')} type="button" disabled={!activeCount} onClick={onClear}>
                            {t('toolbar.resetShort')}
                        </button>
                    </div>
                    <div className="portfolio-filters-panel-body">
                        {children}
                        {fields.map((field) => (
                                <div className="portfolio-filters-field" key={field.id}>
                                    <label htmlFor={field.id}>{field.label}</label>
                                    {field.inputType === 'date' ? <DateInput id={field.id} value={String(field.value)} className={field.changed ? 'changed' : ''}
                                        aria-describedby={field.hint ? `${field.id}-hint` : undefined} onChange={event => field.onChange(event.target.value)} /> : <select
                                        id={field.id}
                                        className={field.changed ? 'changed' : ''}
                                        value={field.value}
                                        multiple={field.multiple}
                                        size={field.multiple ? 4 : undefined}
                                        aria-describedby={field.hint ? `${field.id}-hint` : undefined}
                                        onChange={(event) => field.onChange(field.multiple
                                            ? Array.from(event.target.selectedOptions, (option) => option.value)
                                            : event.target.value)}
                                    >
                                        {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>}
                                    {field.hint && <span className="portfolio-filter-hint" id={`${field.id}-hint`}>{field.hint}</span>}
                                </div>
                        ))}
                    </div>
                    <div className="portfolio-filters-panel-foot">
                        <span role="status">
                            {activeCount === 0
                                ? t('toolbar.noFiltersActive')
                                : t(activeCount === 1 ? 'toolbar.filtersActiveCount' : 'toolbar.filtersActiveCountPlural', { count: activeCount })}
                        </span>
                        <button className="btn" type="button" onClick={() => setOpen(false)}>{t('toolbar.done')}</button>
                    </div>
                </FloatingPanel>
        </div>
        </Popover.Root>
    );
}
