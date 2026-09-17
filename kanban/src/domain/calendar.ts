import type { HeatStats } from './types';
import type { PortfolioCalendarItem, PortfolioRow } from '@/features/portfolio/types';
import { CALENDAR_MONTH_NAMES } from './constants';
import { compareText, normalizeTimestamp } from './util';
import { addRoadmapDays, parseRoadmapIsoDate } from './roadmap';

export { todayLocalIsoDate } from './util';

type CalendarItemLike = PortfolioCalendarItem | null | undefined;

export type CalendarMiniDayMarker = {
    item: PortfolioCalendarItem;
    kind: 'task' | 'point' | 'range-start' | 'range-end';
};

export function comparePortfolioCalendarItems(a: CalendarItemLike, b: CalendarItemLike): number {
    const aStart = a?.bounds?.start?.getTime?.() || 0;
    const bStart = b?.bounds?.start?.getTime?.() || 0;
    if (aStart !== bStart) return aStart - bStart;
    const aEnd = a?.bounds?.end?.getTime?.() || 0;
    const bEnd = b?.bounds?.end?.getTime?.() || 0;
    if (aEnd !== bEnd) return aEnd - bEnd;
    if (a?.isRange !== b?.isRange) return a?.isRange ? -1 : 1;
    if (a?.kind !== b?.kind) return compareText(a?.kind || '', b?.kind || '');
    return compareText(a?.title || '', b?.title || '');
}

export function createUtcDate(year: number, month: number, day = 1): Date {
    return new Date(Date.UTC(year, month, day));
}

export function formatLocalIsoDate(date: unknown): string {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function formatUtcIsoDate(date: unknown): string {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
}

export function getPortfolioCalendarHeatColor(count: unknown, stats: Partial<HeatStats> | null | undefined): string {
    const max = Math.max(0, Number(stats?.max) || 0);
    const normalized = max > 0
        ? Math.max(0, Math.min(1, (Number(count) || 0) / max))
        : 0;
    const hue = 118 - (normalized * 118);
    const lightness = 91 - (normalized * 18);
    const hueValue = hue.toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    const lightnessValue = lightness.toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    return `hsl(${hueValue} 68% ${lightnessValue}%)`;
}

export function getPortfolioCalendarItemLabel(item: CalendarItemLike): string {
    return item?.title || '';
}

export function getPortfolioCalendarItemPriority(item: CalendarItemLike): number {
    if (item?.kind === 'phase') return 0;
    if (item?.kind === 'sprint') return 1;
    if (item?.kind === 'milestone') return 2;
    if (item?.kind === 'task') return 3;
    return 4;
}

export function getUtcMonthLabel(year: number, month: number): string {
    return `${CALENDAR_MONTH_NAMES[month] || ''} ${year}`;
}

export function normalizeDueDate(value: unknown): string {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

export function comparePortfolioCalendarDayItems(a: CalendarItemLike, b: CalendarItemLike): number {
    const aPriority = getPortfolioCalendarItemPriority(a);
    const bPriority = getPortfolioCalendarItemPriority(b);
    if (aPriority !== bPriority) return aPriority - bPriority;
    return comparePortfolioCalendarItems(a, b);
}

export function comparePortfolioDueDateAsc(a: Pick<PortfolioRow, 'task'>, b: Pick<PortfolioRow, 'task'>): number {
    const aDue = normalizeDueDate(a.task.dueDate);
    const bDue = normalizeDueDate(b.task.dueDate);
    if (aDue && bDue) return aDue.localeCompare(bDue);
    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;
    return 0;
}

export function doesPortfolioCalendarItemOccurOnDay(item: CalendarItemLike, isoDate: string): boolean {
    const bounds = item?.bounds;
    const day = parseRoadmapIsoDate(isoDate);
    if (!bounds || !day) return false;
    return bounds.start <= day && bounds.end >= day;
}

export function formatDateTime(value: unknown, locale?: string): string {
    const ts = normalizeTimestamp(value);
    if (!ts) return '-';
    return new Date(ts).toLocaleString(locale);
}

export function formatDueDateForUi(value: unknown): string {
    const iso = normalizeDueDate(value);
    if (!iso) return '';
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
}

export function getPortfolioCalendarMiniDayMarkers(items: PortfolioCalendarItem[] | null | undefined, isoDate: string): CalendarMiniDayMarker[] {
    return (Array.isArray(items) ? items : []).flatMap((item): CalendarMiniDayMarker[] => {
        if (!item?.bounds) return [];
        if (!item.isRange) {
            return formatUtcIsoDate(item.bounds.start) === isoDate ? [{
                item,
                kind: item.kind === 'task' ? 'task' : 'point'
            }] : [];
        }

        const markers: CalendarMiniDayMarker[] = [];
        if (formatUtcIsoDate(item.bounds.start) === isoDate) {
            markers.push({ item, kind: 'range-start' });
        }
        if (formatUtcIsoDate(item.bounds.end) === isoDate && item.bounds.end.getTime() !== item.bounds.start.getTime()) {
            markers.push({ item, kind: 'range-end' });
        }
        return markers;
    });
}

export function getPortfolioCalendarMiniMonthCellCount(year: number, month: number): number {
    const firstOfMonth = createUtcDate(year, month, 1);
    const daysInMonth = createUtcDate(year, month + 1, 0).getUTCDate();
    return Math.ceil((firstOfMonth.getUTCDay() + daysInMonth) / 7) * 7;
}

export function getPortfolioCalendarMonthHeatStats(taskCounts: unknown, year: number, month: number): HeatStats {
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
        return { min: 0, max: 0 };
    }
    let min = Infinity;
    let max = -Infinity;
    const end = createUtcDate(year, month + 1, 1);
    for (let date = createUtcDate(year, month, 1); date < end; date = addRoadmapDays(date, 1)) {
        const isoDate = formatUtcIsoDate(date);
        const count = taskCounts instanceof Map ? (taskCounts.get(isoDate) || 0) : 0;
        min = Math.min(min, count);
        max = Math.max(max, count);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return { min: 0, max: 0 };
    }
    return { min, max };
}

export function getPortfolioCalendarMonthRange(year: number, month: number): { start: Date; end: Date } {
    const start = createUtcDate(year, month, 1);
    const end = createUtcDate(year, month + 1, 0);
    return { start, end };
}

export function getPortfolioCalendarTaskCountsByDay(items: PortfolioCalendarItem[] | null | undefined): Map<string, number> {
    return (Array.isArray(items) ? items : []).reduce((counts, item) => {
        if (item?.kind !== 'task' || !item?.bounds?.start) return counts;
        const isoDate = formatUtcIsoDate(item.bounds.start);
        if (!isoDate) return counts;
        counts.set(isoDate, (counts.get(isoDate) || 0) + 1);
        return counts;
    }, new Map<string, number>());
}

export function getPortfolioCalendarYearHeatStats(taskCounts: unknown, year: number): HeatStats {
    if (!Number.isInteger(year)) {
        return { min: 0, max: 0 };
    }
    let min = Infinity;
    let max = -Infinity;
    const end = createUtcDate(year + 1, 0, 1);
    for (let date = createUtcDate(year, 0, 1); date < end; date = addRoadmapDays(date, 1)) {
        const isoDate = formatUtcIsoDate(date);
        const count = taskCounts instanceof Map ? (taskCounts.get(isoDate) || 0) : 0;
        min = Math.min(min, count);
        max = Math.max(max, count);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return { min: 0, max: 0 };
    }
    return { min, max };
}

export function doesPortfolioCalendarItemIntersectMonth(item: CalendarItemLike, year: number, month: number): boolean {
    const range = getPortfolioCalendarMonthRange(year, month);
    const bounds = item?.bounds;
    if (!bounds) return false;
    return bounds.start <= range.end && bounds.end >= range.start;
}

export function shouldShowPortfolioCalendarRoadmapLabel(item: CalendarItemLike, date: Date): boolean {
    if (!item?.bounds || !item.isRange) return true;
    const isoDate = formatUtcIsoDate(date);
    if (formatUtcIsoDate(item.bounds.start) === isoDate) return true;
    if (date.getUTCDate() === 1) return true;
    if (date.getUTCDay() === 0) return true;
    return false;
}
