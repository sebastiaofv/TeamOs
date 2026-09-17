import { useShallow } from 'zustand/react/shallow';
import type { PortfolioCalendarViewModel } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { buildPortfolioCalendarViewModel } from '@/features/portfolio/queries';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import {
    setPortfolioCalendarPeriod,
    setPortfolioCalendarView,
    shiftPortfolioCalendarMonth,
    shiftPortfolioCalendarYear,
    togglePortfolioCalendarDisplayMode
} from '@/features/portfolio/commands/portfolioControls';
import { CalendarGrid, type CalendarState } from './CalendarGrid';
import { getCalendarMonthLabel, useI18n } from '@/shared/i18n';

function PortfolioCalendarView({ model, state }: { model: PortfolioCalendarViewModel; state: CalendarState }) {
    const actions = usePortfolioActions();
    const { language, t } = useI18n();
    const { view, displayMode, year, month } = model;
    const heatmap = displayMode === 'heatmap';
    const periodLabel = view === 'month' ? getCalendarMonthLabel(language, year, month) : String(year);
    const toggleLabel = heatmap ? t('toolbar.calendar') : t('calendar.heatMap');
    return (
        <>
            <div className="portfolio-calendar-header">
                <div className="portfolio-calendar-controls">
                    <div className="portfolio-calendar-navigation portfolio-calendar-navigation-previous">
                        {view === 'month' && <button className="btn" type="button" data-action="calendar-back-to-year" aria-label={t('calendar.backToYear')} onClick={() => setPortfolioCalendarView('year')}>{t('calendar.backToYear')}</button>}
                        <button
                            className="btn"
                            type="button"
                            data-action={view === 'month' ? 'calendar-prev-month' : 'calendar-prev-year'}
                            aria-label={view === 'month' ? t('calendar.previousMonth') : t('calendar.previousYear')}
                            onClick={() => view === 'month'
                                ? shiftPortfolioCalendarMonth(-1)
                                : shiftPortfolioCalendarYear(-1)}
                        >
                            {t('calendar.prev')}
                        </button>
                    </div>
                    <div className="portfolio-calendar-period-group">
                        <div className="portfolio-calendar-period">{periodLabel}</div>
                        <button className="btn" type="button" data-action="calendar-toggle-mode" onClick={() => togglePortfolioCalendarDisplayMode()}>{toggleLabel}</button>
                    </div>
                    <div className="portfolio-calendar-navigation portfolio-calendar-navigation-next">
                        <button
                            className="btn"
                            type="button"
                            data-action={view === 'month' ? 'calendar-next-month' : 'calendar-next-year'}
                            aria-label={view === 'month' ? t('calendar.nextMonth') : t('calendar.nextYear')}
                            onClick={() => view === 'month'
                                ? shiftPortfolioCalendarMonth(1)
                                : shiftPortfolioCalendarYear(1)}
                        >
                            {t('calendar.next')}
                        </button>
                    </div>
                </div>
            </div>
            <CalendarGrid
                model={model}
                state={state}
                onOpenTask={actions.openPortfolioTaskDetailsForCalendar}
                onCreateTask={actions.openPortfolioCreateTaskModal}
                onSetPeriod={setPortfolioCalendarPeriod}
            />
        </>
    );
}

function ConnectedCalendar() {
    const state = useAppStore(useShallow((state) => ({
        portfolioBoards: state.portfolioBoards,
        selectedPortfolioBoardId: state.selectedPortfolioBoardId,
        portfolioTimelineSelection: state.portfolioTimelineSelection,
        portfolioVisibleRows: state.portfolioVisibleRows,
        portfolioCalendarYear: state.portfolioCalendarYear,
        portfolioCalendarMonth: state.portfolioCalendarMonth,
        portfolioCalendarView: state.portfolioCalendarView,
        portfolioCalendarDisplayMode: state.portfolioCalendarDisplayMode,
        activeLanguage: state.activeLanguage,
    })));
    const model = buildPortfolioCalendarViewModel(state);
    return <PortfolioCalendarView model={model} state={state} />;
}

export function PortfolioCalendar({ hidden }: { hidden: boolean }) {
    return (
        <div className={`portfolio-calendar-view${hidden ? ' hidden' : ''}`} id="portfolioCalendarView">
            {!hidden && <ConnectedCalendar />}
        </div>
    );
}
