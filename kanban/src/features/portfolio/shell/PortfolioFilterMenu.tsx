import { DateInput } from '@/shared/ui/DateInput';
// The toolbar's Filters button, its dropdown panel, and the row of active
// filter tags. Filters apply as soon as they change; the panel closes on an
// outside click, Escape, or Done, returning focus to the button.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
export function FilterMenu({ fields, activeCount, onClear, panelClassName = '', dismissOnBlur = false, title, children, scope = '', iconOnly = false }: {
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
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const scopedId = (id: string) => scope ? `${id}-${scope}` : id;
    const focusSort = useRef(false);
    useEffect(() => {
        if (open && focusSort.current) {
            panelRef.current?.querySelector<HTMLSelectElement>('#portfolioSortSelect')?.focus();
            focusSort.current = false;
        }
    }, [open]);

    const close = (returnFocus: boolean) => {
        setOpen(false);
        if (returnFocus) buttonRef.current?.focus();
    };

    // Section controls may sit much lower than the old global toolbar. Keep
    // their menu inside the viewport, opening upwards when there is more room.
    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const button = buttonRef.current;
            const panel = panelRef.current;
            if (!button || !panel) return;
            const rect = button.getBoundingClientRect();
            const width = Math.min(320, window.innerWidth - 24);
            const below = Math.max(0, window.innerHeight - rect.bottom - 20);
            const above = Math.max(0, rect.top - 20);
            const upwards = below < Math.min(panel.scrollHeight, 400) && above > below;
            const available = upwards ? above : below;
            const height = Math.min(panel.scrollHeight, available);
            Object.assign(panel.style, {
                width: `${width}px`, left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
                top: `${upwards ? rect.top - height - 8 : rect.bottom + 8}px`, maxHeight: `${available}px`
            });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    }, [open]);

    // The command palette's "Open filters" command.
    useEffect(() => {
        const onRequest = (event: Event) => {
            if (Array.from(document.querySelectorAll<HTMLElement>('[data-portfolio-filter-trigger]')).find(button => button.getClientRects().length > 0) !== buttonRef.current) return;
            focusSort.current = event instanceof CustomEvent && Boolean(event.detail?.focusSort);
            setOpen(true);
            if (open && focusSort.current) panelRef.current?.querySelector<HTMLSelectElement>('#portfolioSortSelect')?.focus();
        };
        window.addEventListener(OPEN_FILTERS_EVENT, onRequest);
        return () => window.removeEventListener(OPEN_FILTERS_EVENT, onRequest);
    }, [open]);

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
                className={`btn${iconOnly ? ' icon-btn' : ''} portfolio-filters-btn${open ? ' open' : ''}${activeCount ? ' has-active' : ''}`}
                id={scopedId('portfolioFiltersBtn')}
                title={iconOnly ? title || t('toolbar.filtersButton') : undefined}
                data-portfolio-filter-trigger
                type="button"
                aria-expanded={open}
                aria-controls={scopedId('portfolioFiltersPanel')}
                aria-label={title || (activeCount ? t('toolbar.filtersActiveLabel', { count: activeCount }) : t('toolbar.filtersButton'))}
                onClick={() => setOpen((value) => !value)}
            >
                <FilterIcon />
                {!iconOnly && <span>{title || t('toolbar.filtersButton')}</span>}
                {activeCount > 0 && <span className="portfolio-filters-badge" aria-hidden="true">{activeCount}</span>}
            </button>
            {open && (
                <div ref={panelRef} className={`portfolio-filters-panel${panelClassName ? ` ${panelClassName}` : ''}`} id={scopedId('portfolioFiltersPanel')} role="dialog" aria-labelledby={titleId}>
                    <div className="portfolio-filters-panel-head">
                        <h2 id={titleId}>{title || t('toolbar.filtersButton')}</h2>
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
                        <button className="btn" type="button" onClick={() => close(true)}>{t('toolbar.done')}</button>
                    </div>
                </div>
            )}
        </div>
    );
}
