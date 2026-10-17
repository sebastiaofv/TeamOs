// The toolbar's Filters button, its dropdown panel, and the row of active
// filter tags. Filters apply as soon as they change; the panel closes on an
// outside click, Escape, or Done, returning focus to the button.

import { useEffect, useId, useRef, useState } from 'react';
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
export function FilterMenu({ fields, activeCount, onClear, panelClassName = '', dismissOnBlur = false }: {
    fields: FilterMenuField[];
    activeCount: number;
    onClear: () => void;
    panelClassName?: string;
    dismissOnBlur?: boolean;
}) {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const titleId = useId();

    const close = (returnFocus: boolean) => {
        setOpen(false);
        if (returnFocus) buttonRef.current?.focus();
    };

    // The command palette's "Open filters" command.
    useEffect(() => {
        const onRequest = () => setOpen(true);
        window.addEventListener(OPEN_FILTERS_EVENT, onRequest);
        return () => window.removeEventListener(OPEN_FILTERS_EVENT, onRequest);
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) close(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            event.preventDefault();
            close(true);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div className="portfolio-filters" ref={rootRef} onBlur={dismissOnBlur ? (event) => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close(false);
        } : undefined}>
            <button
                ref={buttonRef}
                className={`btn portfolio-filters-btn${open ? ' open' : ''}${activeCount ? ' has-active' : ''}`}
                id="portfolioFiltersBtn"
                type="button"
                aria-expanded={open}
                aria-controls="portfolioFiltersPanel"
                aria-label={activeCount ? t('toolbar.filtersActiveLabel', { count: activeCount }) : t('toolbar.filtersButton')}
                onClick={() => setOpen((value) => !value)}
            >
                <FilterIcon />
                <span>{t('toolbar.filtersButton')}</span>
                {activeCount > 0 && <span className="portfolio-filters-badge" aria-hidden="true">{activeCount}</span>}
            </button>
            {open && (
                <div className={`portfolio-filters-panel${panelClassName ? ` ${panelClassName}` : ''}`} id="portfolioFiltersPanel" role="dialog" aria-labelledby={titleId}>
                    <div className="portfolio-filters-panel-head">
                        <h2 id={titleId}>{t('toolbar.filtersButton')}</h2>
                        <button className="btn-text" id="resetPortfolioFiltersBtn" type="button" disabled={!activeCount} onClick={onClear}>
                            {t('toolbar.resetShort')}
                        </button>
                    </div>
                    <div className="portfolio-filters-panel-body">
                        {fields.map((field) => (
                                <div className="portfolio-filters-field" key={field.id}>
                                    <label htmlFor={field.id}>{field.label}</label>
                                    <select
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
                                    </select>
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
                        <button className="btn" type="button" onClick={() => close(true)}>{t('toolbar.done')}</button>
                    </div>
                </div>
            )}
        </div>
    );
}
