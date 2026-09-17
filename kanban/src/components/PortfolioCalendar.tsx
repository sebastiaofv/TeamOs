import { useShallow } from 'zustand/react/shallow';
import type { PortfolioCalendarViewModel } from '../types';
import { useAppStore } from '../state/store';
import { getUtcMonthLabel } from '../domain/calendar';
import { buildPortfolioCalendarViewModel } from '../selectors/portfolioViews';
import { usePortfolioActions } from '../application/PortfolioActionsContext';
import {
    setPortfolioCalendarPeriod,
    setPortfolioCalendarView,
    shiftPortfolioCalendarMonth,
    shiftPortfolioCalendarYear,
    togglePortfolioCalendarDisplayMode
} from '../actions/portfolioControls';
import { PortfolioCalendarGrid, type CalendarState } from './PortfolioCalendarGrid';

function PortfolioCalendarView({ model, state }: { model: PortfolioCalendarViewModel; state: CalendarState }) {
    const actions = usePortfolioActions();
    const { view, displayMode, year, month } = model;
    const heatmap = displayMode === 'heatmap';
    const periodLabel = view === 'month' ? getUtcMonthLabel(year, month) : String(year);
    const toggleLabel = heatmap ? 'Calendar' : 'Heat Map';
    return (
        <>
            <div className="portfolio-calendar-header">
                <div className="portfolio-calendar-controls">
                    {view === 'month' && <button className="btn" type="button" data-action="calendar-back-to-year" aria-label="Back to year" onClick={() => setPortfolioCalendarView('year')}>Back to year</button>}
                    <button
                        className="btn"
                        type="button"
                        data-action={view === 'month' ? 'calendar-prev-month' : 'calendar-prev-year'}
                        aria-label={view === 'month' ? 'Previous month' : 'Previous year'}
                        onClick={() => view === 'month'
                            ? shiftPortfolioCalendarMonth(-1)
                            : shiftPortfolioCalendarYear(-1)}
                    >
                        Prev
                    </button>
                    <div className="portfolio-calendar-period-group">
                        <div className="portfolio-calendar-period">{periodLabel}</div>
                        <button className="btn" type="button" data-action="calendar-toggle-mode" onClick={() => togglePortfolioCalendarDisplayMode()}>{toggleLabel}</button>
                    </div>
                    <button
                        className="btn"
                        type="button"
                        data-action={view === 'month' ? 'calendar-next-month' : 'calendar-next-year'}
                        aria-label={view === 'month' ? 'Next month' : 'Next year'}
                        onClick={() => view === 'month'
                            ? shiftPortfolioCalendarMonth(1)
                            : shiftPortfolioCalendarYear(1)}
                    >
                        Next
                    </button>
                </div>
            </div>
            <PortfolioCalendarGrid
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
