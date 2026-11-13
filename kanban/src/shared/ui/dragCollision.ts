import { closestCorners, pointerWithin, type CollisionDetection } from '@dnd-kit/core';

/** Keyboard drags have no pointer. Pointer drops outside a target stay invalid. */
export const pointerOrKeyboardCollision: CollisionDetection = (args) =>
    args.pointerCoordinates ? pointerWithin(args) : closestCorners(args);
