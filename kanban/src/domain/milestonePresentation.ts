import type { RoadmapItem } from '@/domain/types';

// Fixed, theme-compatible colours with sufficient contrast against white text.
export const MILESTONE_PALETTE = [
    { id: 'blue', value: '#2563eb' }, { id: 'purple', value: '#7c3aed' },
    { id: 'teal', value: '#0f766e' }, { id: 'amber', value: '#b45309' },
    { id: 'rose', value: '#be123c' }, { id: 'slate', value: '#475569' }
] as const;
export const MILESTONE_COLORS = MILESTONE_PALETTE.map((color) => color.value);

export function isMilestoneColor(value: unknown): value is string {
    return typeof value === 'string' && MILESTONE_COLORS.some((color) => color === value);
}

export function milestoneColor(item: RoadmapItem, index = 0): string {
    return item.color || MILESTONE_COLORS[index % MILESTONE_COLORS.length];
}

export function nextMilestoneColor(items: RoadmapItem[]): string {
    const used = new Set(items.map(milestoneColor));
    return MILESTONE_COLORS.find((color) => !used.has(color)) || MILESTONE_COLORS[0];
}

export const MILESTONE_LANE_HEIGHT = 38;
export const MILESTONE_LABEL_WIDTH = 140;

/** Pack complete marker/label footprints, in pixels, on either side of the date. */
export function layoutMilestones(positions: number[], width: number) {
    width = Math.max(2 * (MILESTONE_LABEL_WIDTH + 30), width);
    const lanes: { start: number; end: number }[][] = [];
    return positions.map((position) => {
        const x = position * width / 100;
        const preferredLeft = x >= width / 2;
        for (let lane = 0; ; lane++) {
            for (const labelAtEnd of [preferredLeft, !preferredLeft]) {
                const start = x - (labelAtEnd ? MILESTONE_LABEL_WIDTH + 30 : 16);
                const end = x + (labelAtEnd ? 16 : MILESTONE_LABEL_WIDTH + 30);
                if (labelAtEnd ? start < -16 : end > width + 16) continue;
                if ((lanes[lane] || []).some((other) => start < other.end + 6 && end + 6 > other.start)) continue;
                (lanes[lane] ||= []).push({ start, end });
                return { lane, labelAtEnd };
            }
        }
    });
}
