// The toolbar's Filters button, its dropdown panel, and the row of active
// filter tags. Filters apply as soon as they change; the panel closes on an
// outside click, Escape, or Done, returning focus to the button.

import { useEffect, useId, useRef, useState } from 'react';
import type { PortfolioFilters, PortfolioRow } from '@/features/portfolio/types';
import { EFFORT_BUCKETS } from '@/domain/constants';
import {
    DEFAULT_PORTFOLIO_FILTERS,
    getActivePortfolioFilterNames,
    type PanelPortfolioFilterName
} from '@/domain/portfolioFilters';
import { normalizeAssignee, taskAssignees } from '@/domain/task';
import { clearPortfolioFilter, clearPortfolioFilters, setPortfolioFilter } from '@/features/portfolio/commands/portfolioControls';
import { useI18n } from '@/shared/i18n';
import { OPEN_FILTERS_EVENT } from '@/features/portfolio/palette/openCommandPalette';

type Translate = ReturnType<typeof useI18n>['t'];
type FilterOption = { value: string; label: string };
type FilterField = { name: PanelPortfolioFilterName; id: string; label: string; options: FilterOption[] };
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

function getAssigneeNames(rows: PortfolioRow[]): string[] {
    const names = new Map<string, string>();
    (Array.isArray(rows) ? rows : []).forEach((item) => {
        taskAssignees(item?.task).forEach((value) => {
            const name = normalizeAssignee(value);
            if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
        });
    });
    return [...names.values()].sort((a, b) => a.localeCompare(b));
}

// Labels in the translations end with a colon ("Priority:").
const fieldLabel = (t: Translate, key: Parameters<Translate>[0]) => t(key).replace(/:$/, '');

function getFilterFields(t: Translate, tasks: PortfolioRow[]): FilterField[] {
    const all = { value: '', label: t('common.all') };
    return [
        {
            name: 'archive', id: 'portfolioArchiveFilter', label: fieldLabel(t, 'toolbar.archive'),
            options: [
                { value: 'active', label: t('toolbar.activeOnly') },
                { value: 'all', label: t('toolbar.activeAndArchived') },
                { value: 'archived', label: t('toolbar.archivedOnly') }
            ]
        },
        {
            name: 'blocked', id: 'portfolioBlockedFilter', label: fieldLabel(t, 'toolbar.blocked'),
            options: [
                { value: 'all', label: t('common.all') },
                { value: 'blocked', label: t('toolbar.blockedOnly') },
                { value: 'unblocked', label: t('toolbar.unblockedOnly') }
            ]
        },
        {
            name: 'assignee', id: 'portfolioAssigneeFilter', label: fieldLabel(t, 'toolbar.assignee'),
            options: [all, ...getAssigneeNames(tasks).map((name) => ({ value: name, label: name }))]
        },
        {
            name: 'priority', id: 'portfolioPriorityFilter', label: fieldLabel(t, 'toolbar.priority'),
            options: [
                all,
                { value: 'high', label: t('toolbar.high') },
                { value: 'medium', label: t('toolbar.medium') },
                { value: 'low', label: t('toolbar.low') }
            ]
        },
        {
            name: 'effort', id: 'portfolioEffortFilter', label: fieldLabel(t, 'toolbar.effort'),
            options: [all, ...EFFORT_BUCKETS.map((effort) => ({ value: effort, label: effort }))]
        }
    ];
}

function FilterIcon() {
    return (
        <svg className="portfolio-filters-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M2 3h12l-4.5 5.5V13l-3-1.5v-3z" />
        </svg>
    );
}

export function PortfolioFilterMenu({ filters, tasks }: { filters: PortfolioFilters; tasks: PortfolioRow[] }) {
    const { t } = useI18n();
    const fields = getFilterFields(t, tasks).map((field) => ({
        ...field,
        value: String(filters[field.name] ?? ''),
        changed: filters[field.name] !== DEFAULT_PORTFOLIO_FILTERS[field.name],
        onChange: (value: string | string[]) => setPortfolioFilter(field.name, value)
    }));
    return <FilterMenu fields={fields} activeCount={getActivePortfolioFilterNames(filters).length} onClear={clearPortfolioFilters} />;
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

// One removable tag per filter that differs from its default, under the toolbar.
export function PortfolioActiveFilters({ filters, tasks }: { filters: PortfolioFilters; tasks: PortfolioRow[] }) {
    const { t } = useI18n();
    const active = getActivePortfolioFilterNames(filters);
    if (active.length === 0) return null;
    const fields = getFilterFields(t, tasks);
    return (
        <div className="portfolio-active-filters" id="portfolioActiveFilters" role="group" aria-label={t('toolbar.activeFilters')}>
            {active.map((name) => {
                const field = fields.find((entry) => entry.name === name)!;
                const value = String(filters[name] ?? '');
                const valueLabel = field.options.find((option) => option.value === value)?.label || value;
                return (
                    <span className="portfolio-active-filter" key={name} data-filter={name}>
                        <span className="portfolio-active-filter-name">{field.label}</span>
                        <span>{valueLabel}</span>
                        <button
                            type="button"
                            aria-label={t('toolbar.removeFilter', { label: field.label, value: valueLabel })}
                            onClick={() => clearPortfolioFilter(name)}
                        >×</button>
                    </span>
                );
            })}
            <button className="btn-text" type="button" onClick={() => clearPortfolioFilters()}>{t('toolbar.clearAllFilters')}</button>
        </div>
    );
}
