import type { KeyboardCoordinateGetter } from '@dnd-kit/core';

/** One horizontal key moves to the next workflow column, regardless of width. */
export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
    if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return;
    const columns = context.droppableContainers.getEnabled()
        .filter(container => container.data.current?.status && context.droppableRects.has(container.id))
        .sort((a, b) => context.droppableRects.get(a.id)!.left - context.droppableRects.get(b.id)!.left);
    const currentId = context.over?.id || `column:${context.active?.data.current?.status}`;
    const index = columns.findIndex(column => column.id === currentId);
    const target = columns[index + (event.code === 'ArrowRight' ? 1 : -1)];
    const active = context.collisionRect;
    const rect = target && context.droppableRects.get(target.id);
    if (index < 0 || !active || !rect) return;
    return {
        x: currentCoordinates.x + rect.left - active.left + (rect.width - active.width) / 2,
        y: currentCoordinates.y + rect.top - active.top + 8
    };
};
