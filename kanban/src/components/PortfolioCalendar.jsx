import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../state/store.js';
import { CALENDAR_MONTH_NAMES, CALENDAR_WEEKDAY_NAMES } from '../domain/constants.js';
import {
    createUtcDate,
    formatUtcIsoDate,
    getPortfolioCalendarHeatColor,
    getPortfolioCalendarItemLabel,
    getUtcMonthLabel,
    getPortfolioCalendarMiniDayMarkers,
    getPortfolioCalendarMiniMonthCellCount,
    getPortfolioCalendarMonthHeatStats,
    getPortfolioCalendarTaskCountsByDay,
    getPortfolioCalendarYearHeatStats,
    todayLocalIsoDate,
    comparePortfolioCalendarDayItems,
    doesPortfolioCalendarItemIntersectMonth,
    doesPortfolioCalendarItemOccurOnDay,
    shouldShowPortfolioCalendarRoadmapLabel
} from '../domain/calendar.js';
import { addRoadmapDays } from '../domain/roadmap.js';
import { createPortfolioProjectColor } from '../domain/board.js';
import { buildPortfolioCalendarViewModel, isBoardInHistoricalPreview } from '../selectors/portfolioViews.js';
import {
    openPortfolioCreateTaskModal,
    openPortfolioTaskDetailsForCalendar
} from '../actions/portfolioMutations.js';
import {
    setPortfolioCalendarPeriod,
    setPortfolioCalendarView,
    shiftPortfolioCalendarMonth,
    shiftPortfolioCalendarYear,
    togglePortfolioCalendarDisplayMode
} from '../actions/portfolioControls.js';

function itemStyle(item, aggregate) {
    if (!aggregate) return undefined;
    const color = item.projectColor || createPortfolioProjectColor(0);
    return { background: color.bg, borderColor: color.border, color: color.text };
}

function miniMarkerStyle(item, aggregate) {
    if (!aggregate) return undefined;
    const color = item.projectColor || createPortfolioProjectColor(0);
    return { background: color.border };
}

function CalendarTaskButton({ item, aggregate }) {
    const classes = ['portfolio-calendar-item', 'portfolio-calendar-item-task'];
    if (item?.isRange) classes.push('portfolio-calendar-item-range');
    const title = getPortfolioCalendarItemLabel(item);
    return (
        <button
            className={classes.join(' ')}
            type="button"
            data-action="open-calendar-task"
            data-board-id={item?.boardId || ''}
            data-task-id={String(item?.taskId || '')}
            data-calendar-item-title={item?.title || ''}
            style={itemStyle(item, aggregate)}
            title={title}
            onClick={(event) => {
                event.stopPropagation();
                openPortfolioTaskDetailsForCalendar(item?.boardId || '', item?.taskId);
            }}
        >
            {title}
        </button>
    );
}

function CalendarRoadmapItem({ item, date, aggregate }) {
    if (!item) return null;
    const classes = ['portfolio-calendar-roadmap-span'];
    if (item.kind) classes.push(`portfolio-calendar-roadmap-span-${item.kind}`);
    if (item.isRange && item.bounds.start < date) classes.push('portfolio-calendar-roadmap-span-continues-before');
    if (item.isRange && item.bounds.end > date) classes.push('portfolio-calendar-roadmap-span-continues-after');
    const title = getPortfolioCalendarItemLabel(item);
    return (
        <div
            className={classes.join(' ')}
            data-calendar-roadmap-title={item.title || ''}
            data-calendar-roadmap-kind={item.kind || ''}
            style={itemStyle(item, aggregate)}
            title={title}
        >
            {shouldShowPortfolioCalendarRoadmapLabel(item, date) ? title : '\u00a0'}
        </div>
    );
}

function MiniMonth({ items, year, month, aggregate, heatmap, taskCounts, heatStats }) {
    const firstOfMonth = createUtcDate(year, month, 1);
    const leadingDays = firstOfMonth.getUTCDay();
    const gridStart = addRoadmapDays(firstOfMonth, -leadingDays);
    const cellCount = getPortfolioCalendarMiniMonthCellCount(year, month);

    return (
        <div className="portfolio-calendar-mini-month-grid">
            <div className="portfolio-calendar-mini-weekdays">
                {CALENDAR_WEEKDAY_NAMES.map((name) => (
                    <div className="portfolio-calendar-mini-weekday" key={name}>{name.charAt(0)}</div>
                ))}
            </div>
            <div className="portfolio-calendar-mini-day-grid">
                {Array.from({ length: cellCount }, (_, index) => {
                    const date = addRoadmapDays(gridStart, index);
                    const isoDate = formatUtcIsoDate(date);
                    const inCurrentMonth = date.getUTCMonth() === month;
                    const markers = inCurrentMonth
                        ? getPortfolioCalendarMiniDayMarkers(
                            items.filter((item) => doesPortfolioCalendarItemOccurOnDay(item, isoDate)),
                            isoDate
                        )
                        : [];
                    const classes = ['portfolio-calendar-mini-day', inCurrentMonth
                        ? 'portfolio-calendar-mini-day-current'
                        : 'portfolio-calendar-mini-day-outside'];
                    if (isoDate === todayLocalIsoDate()) classes.push('portfolio-calendar-mini-day-today');
                    const taskCount = inCurrentMonth && taskCounts instanceof Map ? (taskCounts.get(isoDate) || 0) : 0;
                    const style = heatmap && inCurrentMonth
                        ? { background: getPortfolioCalendarHeatColor(taskCount, heatStats) }
                        : undefined;
                    return (
                        <div className={classes.join(' ')} data-calendar-mini-day={isoDate} style={style} key={isoDate}>
                            <div className="portfolio-calendar-mini-day-number">{date.getUTCDate()}</div>
                            <div className="portfolio-calendar-mini-markers">
                                {markers.map((marker, markerIndex) => {
                                    const markerClasses = ['portfolio-calendar-mini-marker'];
                                    if (marker.kind === 'task') markerClasses.push('portfolio-calendar-mini-marker-task');
                                    if (marker.kind === 'range-end') markerClasses.push('portfolio-calendar-mini-marker-range-end');
                                    return (
                                        <span
                                            className={markerClasses.join(' ')}
                                            style={miniMarkerStyle(marker.item, aggregate)}
                                            title={marker.item.title || ''}
                                            key={`${marker.item.id}:${marker.kind}:${markerIndex}`}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function CalendarYearView({ items, aggregate, heatmap, year }) {
    const taskCounts = heatmap ? getPortfolioCalendarTaskCountsByDay(items) : null;
    const heatStats = heatmap ? getPortfolioCalendarYearHeatStats(taskCounts, year) : null;
    return (
        <div className="portfolio-calendar-year surface-page">
            {Array.from({ length: 4 }, (_, quarterIndex) => {
                const baseMonth = quarterIndex * 3;
                return (
                    <section className="portfolio-calendar-quarter" key={`quarter-${quarterIndex}`}>
                        <div className="portfolio-calendar-quarter-months">
                            {Array.from({ length: 3 }, (_, monthOffset) => {
                                const month = baseMonth + monthOffset;
                                const monthItems = items.filter((item) => doesPortfolioCalendarItemIntersectMonth(item, year, month));
                                return (
                                    <button
                                        className="portfolio-calendar-month-card surface-card"
                                        type="button"
                                        data-action="open-calendar-month"
                                        data-year={year}
                                        data-month={month}
                                        aria-label={`Open ${getUtcMonthLabel(year, month)}`}
                                        onClick={() => setPortfolioCalendarPeriod(year, month)}
                                        key={month}
                                    >
                                        <div className="portfolio-calendar-month-card-header">
                                            <span className="portfolio-calendar-month-name">{CALENDAR_MONTH_NAMES[month]}</span>
                                            <span className="portfolio-calendar-month-count">{monthItems.length} item{monthItems.length === 1 ? '' : 's'}</span>
                                        </div>
                                        <MiniMonth
                                            items={monthItems}
                                            year={year}
                                            month={month}
                                            aggregate={aggregate}
                                            heatmap={heatmap}
                                            taskCounts={taskCounts}
                                            heatStats={heatStats}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

function CalendarMonthView({ items, aggregate, heatmap, year, month, state }) {
    const firstOfMonth = createUtcDate(year, month, 1);
    const leadingDays = firstOfMonth.getUTCDay();
    const gridStart = addRoadmapDays(firstOfMonth, -leadingDays);
    const taskCounts = heatmap ? getPortfolioCalendarTaskCountsByDay(items) : null;
    const heatStats = heatmap ? getPortfolioCalendarMonthHeatStats(taskCounts, year, month) : null;
    const selectedBoard = state.portfolioBoards.find((board) => board.id === state.selectedPortfolioBoardId);
    const canCreateTasks = Boolean(state.selectedPortfolioBoardId)
        && Boolean(selectedBoard?.handle)
        && !isBoardInHistoricalPreview(state, state.selectedPortfolioBoardId);

    return (
        <div className="portfolio-calendar-month-grid surface-card surface-border">
            <div className="portfolio-calendar-month-grid-track">
                <div className="portfolio-calendar-weekdays">
                    {CALENDAR_WEEKDAY_NAMES.map((name) => <div className="portfolio-calendar-weekday" key={name}>{name}</div>)}
                </div>
                <div className="portfolio-calendar-day-grid">
                    {Array.from({ length: 6 }, (_, weekIndex) => {
                        const weekStart = addRoadmapDays(gridStart, weekIndex * 7);
                        const weekStartIso = formatUtcIsoDate(weekStart);
                        return (
                            <div className="portfolio-calendar-week-row" data-calendar-week-start={weekStartIso} key={weekStartIso}>
                                <div className="portfolio-calendar-week-days">
                                    {Array.from({ length: 7 }, (_, dayIndex) => {
                                        const date = addRoadmapDays(weekStart, dayIndex);
                                        const isoDate = formatUtcIsoDate(date);
                                        const dayItems = items
                                            .filter((item) => doesPortfolioCalendarItemOccurOnDay(item, isoDate))
                                            .sort(comparePortfolioCalendarDayItems);
                                        const visibleItems = dayItems.slice(0, 4);
                                        const roadmapItems = visibleItems.filter((item) => item?.kind !== 'task');
                                        const taskItems = visibleItems.filter((item) => item?.kind === 'task');
                                        const overflow = Math.max(0, dayItems.length - visibleItems.length);
                                        const inCurrentMonth = date.getUTCMonth() === month;
                                        const classes = ['portfolio-calendar-day-cell', inCurrentMonth
                                            ? 'portfolio-calendar-day-cell-current'
                                            : 'portfolio-calendar-day-cell-outside'];
                                        if (isoDate === todayLocalIsoDate()) classes.push('portfolio-calendar-day-cell-today');
                                        if (canCreateTasks && inCurrentMonth) classes.push('portfolio-calendar-day-cell-actionable');
                                        const taskCount = inCurrentMonth && taskCounts instanceof Map ? (taskCounts.get(isoDate) || 0) : 0;
                                        const style = heatmap && inCurrentMonth
                                            ? { background: getPortfolioCalendarHeatColor(taskCount, heatStats) }
                                            : undefined;
                                        return (
                                            <div
                                                className={classes.join(' ')}
                                                data-calendar-day={isoDate}
                                                data-action={canCreateTasks && inCurrentMonth ? 'create-calendar-task' : undefined}
                                                data-due-date={canCreateTasks && inCurrentMonth ? isoDate : undefined}
                                                style={style}
                                                onClick={canCreateTasks && inCurrentMonth
                                                    ? () => openPortfolioCreateTaskModal(state.selectedPortfolioBoardId, '', { preferredDueDate: isoDate })
                                                    : undefined}
                                                key={isoDate}
                                            >
                                                <div className="portfolio-calendar-day-number">{date.getUTCDate()}</div>
                                                {roadmapItems.length > 0 && (
                                                    <div className="portfolio-calendar-day-roadmap">
                                                        {roadmapItems.map((item) => <CalendarRoadmapItem item={item} date={date} aggregate={aggregate} key={item.id} />)}
                                                    </div>
                                                )}
                                                <div className="portfolio-calendar-day-items">
                                                    {taskItems.map((item) => <CalendarTaskButton item={item} aggregate={aggregate} key={item.id} />)}
                                                    {overflow > 0 && <div className="portfolio-calendar-item-overflow">+{overflow} more</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function PortfolioCalendarView({ model, state }) {
    const { items, aggregate, view, displayMode, year, month } = model;
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
            <div
                className="portfolio-calendar-shell"
                data-calendar-scope={aggregate ? 'aggregate' : 'selected'}
                data-calendar-view={view}
                data-calendar-display-mode={displayMode}
            >
                {view === 'month'
                    ? <CalendarMonthView items={items} aggregate={aggregate} heatmap={heatmap} year={year} month={month} state={state} />
                    : <CalendarYearView items={items} aggregate={aggregate} heatmap={heatmap} year={year} />}
            </div>
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

export function PortfolioCalendar({ hidden }) {
    return (
        <div className={`portfolio-calendar-view${hidden ? ' hidden' : ''}`} id="portfolioCalendarView">
            {!hidden && <ConnectedCalendar />}
        </div>
    );
}
