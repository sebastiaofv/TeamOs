// Sprint durations are counted in business days (Monday to Friday). The end
// date is the start date moved forward by the duration, skipping weekends:
// a Sprint starting on Wednesday 2026-11-04 that lasts 10 business days ends
// on Wednesday 2026-11-18. The duration between two dates is the inverse:
// the business days after the start date up to and including the end date.

import { parseRoadmapIsoDate } from '@/domain/roadmap';

const MAX_BUSINESS_DAYS = 3650;

function isBusinessDay(date: Date): boolean {
    const day = date.getUTCDay();
    return day !== 0 && day !== 6;
}

function toIsoDate(date: Date): string {
    const year = String(date.getUTCFullYear()).padStart(4, '0');
    return `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function isValidBusinessDayDuration(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_BUSINESS_DAYS;
}

// Returns '' when the start date or the duration is invalid.
export function addBusinessDays(startDate: string, days: number): string {
    const date = parseRoadmapIsoDate(startDate);
    if (!date || !isValidBusinessDayDuration(days)) return '';
    let remaining = days;
    while (remaining > 0) {
        date.setUTCDate(date.getUTCDate() + 1);
        if (isBusinessDay(date)) remaining -= 1;
    }
    return toIsoDate(date);
}

// Returns null when either date is invalid or the end precedes the start.
export function businessDaysBetween(startDate: string, endDate: string): number | null {
    const start = parseRoadmapIsoDate(startDate);
    const end = parseRoadmapIsoDate(endDate);
    if (!start || !end || end < start) return null;
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    const weeks = Math.floor(totalDays / 7);
    let count = weeks * 5;
    const cursor = new Date(start);
    cursor.setUTCDate(cursor.getUTCDate() + weeks * 7);
    while (cursor < end) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        if (isBusinessDay(cursor)) count += 1;
    }
    return count;
}
