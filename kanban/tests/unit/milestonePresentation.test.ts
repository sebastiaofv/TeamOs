import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateBoardData } from '../../src/domain/board';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { normalizeRoadmapExtension } from '../../src/domain/roadmap';
import { layoutMilestones, MILESTONE_COLORS, milestoneColor, nextMilestoneColor } from '../../src/domain/milestonePresentation';

describe('milestone colours and compatibility', () => {
    it.each([1, 2])('migrates v%i without changing work, IDs or historical events', (version) => {
        const board = JSON.parse(readFileSync('test-board/us-5.board.json', 'utf8'));
        board.extensions.roadmap.version = version;
        board.extensions.roadmap.milestones.forEach((item: { color?: string }) => delete item.color);
        const original = structuredClone(board);
        const saved = serializeBoardDataFromObject(board);
        validateBoardData(saved);
        expect(saved.extensions.roadmap).toEqual({ ...original.extensions.roadmap, version: 3 });
        expect(saved.board.tasks.map((task) => [task.id, task.phaseId, task.milestoneId, task.sprintId, task.status])).toEqual(
            original.board.tasks.map((task: { id: number; phaseId?: string; milestoneId?: string; sprintId?: string; status: string }) => [task.id, task.phaseId || '', task.milestoneId || '', task.sprintId || '', task.status]));
        expect(saved.extensions.timeline).toEqual(original.extensions.timeline);
        expect(board).toEqual(original);
    });
    it('round-trips the coloured board and rejects unsupported colours', () => {
        const board = JSON.parse(readFileSync('test-board/us-5.board.json', 'utf8'));
        const saved = serializeBoardDataFromObject(board); validateBoardData(saved);
        expect(serializeBoardDataFromObject(saved).extensions.roadmap).toEqual(board.extensions.roadmap);
        board.extensions.roadmap.milestones[0].color = 'invalid';
        expect(normalizeRoadmapExtension(board.extensions.roadmap)).toBeNull();
    });
    it('suggests an unused colour, honours repeats, and handles an exhausted palette and legacy colours', () => {
        const items = MILESTONE_COLORS.map((color, index) => ({ id: `${index}`, title: `${index}`, color }));
        expect(nextMilestoneColor(items.slice(0, 3))).toBe(MILESTONE_COLORS[3]);
        expect(nextMilestoneColor(items)).toBe(MILESTONE_COLORS[0]);
        expect(nextMilestoneColor([{ id: 'old', title: 'Old' }])).toBe(MILESTONE_COLORS[1]);
        expect(milestoneColor({ ...items[1], color: MILESTONE_COLORS[0] }, 1)).toBe(MILESTONE_COLORS[0]);
    });
});

describe('milestone annotation packing', () => {
    it.each([640, 960, 1280])('keeps same-day and adjacent labels apart at width %i', (width) => {
        const positions = [0, 1, 20, 21, 50, 51, 76, 77, 100, 100];
        const layout = layoutMilestones(positions, width);
        const boxes = layout.map((item, index) => ({ ...item, start: positions[index] * width / 100 - (item.labelAtEnd ? 170 : 16), end: positions[index] * width / 100 + (item.labelAtEnd ? 16 : 170) }));
        boxes.forEach((box, index) => {
            expect(box.start).toBeGreaterThanOrEqual(-16); expect(box.end).toBeLessThanOrEqual(width + 16);
            boxes.slice(index + 1).filter((other) => other.lane === box.lane).forEach((other) => expect(box.end + 6 <= other.start || other.end + 6 <= box.start).toBe(true));
        });
    });
});
