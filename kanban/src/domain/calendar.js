import { CALENDAR_MONTH_NAMES } from './constants.js';
import { compareText } from './util.js';

export function comparePortfolioCalendarItems(a, b) {
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

export function createUtcDate(year, month, day = 1) {
    return new Date(Date.UTC(year, month, day));
}

export function formatLocalIsoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function formatUtcIsoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
}

export function getPortfolioCalendarDayOffset(start, end) {
    return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function getPortfolioCalendarHeatColor(count, stats) {
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

export function getPortfolioCalendarItemLabel(item) {
    return item?.title || '';
}

export function getPortfolioCalendarItemPriority(item) {
    if (item?.kind === 'phase') return 0;
    if (item?.kind === 'sprint') return 1;
    if (item?.kind === 'milestone') return 2;
    if (item?.kind === 'task') return 3;
    return 4;
}

export function getUtcMonthLabel(year, month) {
    return `${CALENDAR_MONTH_NAMES[month] || ''} ${year}`;
}

export function normalizeDueDate(value) {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}
