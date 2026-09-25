// Pixel geometry of the planner grid. One 15-minute slot is PLANNER_SLOT_PX tall.
import { PLANNER_DAY_END, PLANNER_DAY_START, PLANNER_SLOT_MINUTES } from '@/domain/dayPlanner';

export const PLANNER_SLOT_PX = 24;
export const PLANNER_GRID_HEIGHT_PX = ((PLANNER_DAY_END - PLANNER_DAY_START) / PLANNER_SLOT_MINUTES) * PLANNER_SLOT_PX;

export function plannerMinutesToPx(minutes: number): number {
    return ((minutes - PLANNER_DAY_START) / PLANNER_SLOT_MINUTES) * PLANNER_SLOT_PX;
}
