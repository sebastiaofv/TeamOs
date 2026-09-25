import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
    PLANNER_DAY_END,
    PLANNER_DAY_START,
    PLANNER_DEFAULT_BLOCK_MINUTES,
    PLANNER_WORK_END,
    PLANNER_WORK_START,
    formatPlannerTime
} from '@/domain/dayPlanner';
import type { PlannerBlockView, PlannerDayView, PlannerViewModel } from '@/features/portfolio/queries';
import { formatPlannerDateLabel, useI18n } from '@/shared/i18n';
import { PLANNER_GRID_HEIGHT_PX, PLANNER_SLOT_PX, plannerMinutesToPx } from './plannerGeometry';

export type PlannerDropPreview = { date: string; startMinutes: number };

const HOURS = Array.from({ length: (PLANNER_DAY_END - PLANNER_DAY_START) / 60 }, (_, index) => PLANNER_DAY_START + index * 60);
const INITIAL_SCROLL_MINUTES = 8 * 60 + 30;

function PlannerDayColumn({ day, nowMinutes, preview, renderBlock }: {
    day: PlannerDayView;
    nowMinutes: number;
    preview: PlannerDropPreview | null;
    renderBlock: (block: PlannerBlockView) => ReactNode;
}) {
    const { language, t } = useI18n();
    const { setNodeRef } = useDroppable({ id: `day:${day.date}`, data: { date: day.date } });
    const showNow = day.isToday && nowMinutes >= PLANNER_DAY_START && nowMinutes <= PLANNER_DAY_END;
    const previewHere = preview?.date === day.date ? preview : null;
    return (
        <div
            ref={setNodeRef}
            className={`planner-day${previewHere ? ' drop-target' : ''}`}
            data-planner-date={day.date}
            role="group"
            aria-label={t('planner.dayColumn', { date: formatPlannerDateLabel(language, day.date) })}
        >
            <div className="planner-offhours" style={{ top: 0, height: `${plannerMinutesToPx(PLANNER_WORK_START)}px` }} />
            <div className="planner-offhours" style={{ top: `${plannerMinutesToPx(PLANNER_WORK_END)}px`, bottom: 0 }} />
            {previewHere && (
                <div
                    className="planner-drop-preview"
                    style={{
                        top: `${plannerMinutesToPx(previewHere.startMinutes)}px`,
                        height: `${plannerMinutesToPx(PLANNER_DAY_START + PLANNER_DEFAULT_BLOCK_MINUTES)}px`
                    }}
                >
                    {formatPlannerTime(previewHere.startMinutes)}–{formatPlannerTime(previewHere.startMinutes + PLANNER_DEFAULT_BLOCK_MINUTES)}
                </div>
            )}
            {day.blocks.map(renderBlock)}
            {showNow && <div className="planner-now" style={{ top: `${plannerMinutesToPx(nowMinutes)}px` }} aria-hidden="true" />}
        </div>
    );
}

export function PlannerGrid({ model, nowMinutes, preview = null, renderBlock }: {
    model: PlannerViewModel;
    nowMinutes: number;
    preview?: PlannerDropPreview | null;
    renderBlock: (block: PlannerBlockView) => ReactNode;
}) {
    const { language, t } = useI18n();
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = plannerMinutesToPx(INITIAL_SCROLL_MINUTES);
    }, []);
    const week = model.mode === 'week';
    const style = { '--planner-slot': `${PLANNER_SLOT_PX}px`, '--planner-days': model.days.length } as CSSProperties;
    return (
        <div className="planner-grid-panel">
            {week && (
                <div className="planner-day-headers" style={style}>
                    <span />
                    {model.days.map((day) => (
                        <span key={day.date} className={`planner-day-header${day.isToday ? ' today' : ''}`}>
                            {formatPlannerDateLabel(language, day.date, 'short')}
                        </span>
                    ))}
                </div>
            )}
            <div className="planner-grid-scroll" ref={scrollRef}>
                <div className="planner-grid" style={{ ...style, height: `${PLANNER_GRID_HEIGHT_PX}px` }}>
                    <div className="planner-hours" aria-hidden="true">
                        {HOURS.map((minutes) => (
                            <span key={minutes} style={{ top: `${plannerMinutesToPx(minutes)}px` }}>{formatPlannerTime(minutes)}</span>
                        ))}
                    </div>
                    {model.days.map((day) => (
                        <PlannerDayColumn key={day.date} day={day} nowMinutes={nowMinutes} preview={preview} renderBlock={renderBlock} />
                    ))}
                </div>
            </div>
            <p className="planner-hint">{t('planner.dragHint')}</p>
        </div>
    );
}
