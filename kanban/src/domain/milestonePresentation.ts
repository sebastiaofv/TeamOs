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

export const MILESTONE_LANE_HEIGHT = 36;
export const MILESTONE_MARKER_WIDTH = 32;

/** Pack only the diamond footprints. Extra collision lanes scroll within a two-lane strip. */
export function layoutMilestones(positions: number[], width: number) {
    width = Math.max(MILESTONE_MARKER_WIDTH, width);
    const lanes: number[][] = [];
    return positions.map(position => {
        const x = position * width / 100;
        let lane = 0;
        while ((lanes[lane] || []).some(other => Math.abs(x - other) < MILESTONE_MARKER_WIDTH + 6)) lane++;
        (lanes[lane] ||= []).push(x);
        return { lane };
    });
}
