// Progress percentages are null when nothing is eligible to measure.
export function formatPercent(percent: number | null | undefined, unavailable: string): string {
    return percent == null ? unavailable : `${Math.round(percent)}%`;
}
