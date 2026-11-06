import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
    PLANNER_SLOT_MINUTES,
    applyPlannerGesture,
    type PlannerBlockTimes,
    type PlannerGestureMode
} from '@/domain/dayPlanner';
import type { PlannerBlockView } from '@/features/portfolio/queries';
import { PLANNER_SLOT_PX } from './plannerGeometry';

export type PlannerGestureDraft = { boardId: string; blockId: string } & PlannerBlockTimes;

// Pixels the pointer must travel before a press becomes a drag, so clicks
// and double-clicks still reach the block.
const DRAG_THRESHOLD_PX = 4;

function dateAtPoint(x: number, y: number): string | null {
    const column = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-planner-date]');
    return column?.dataset.plannerDate || null;
}

// Pointer-driven move and resize. While dragging, `draft` holds the block's
// would-be times; `onCommit` runs once on release, only if the pointer moved.
export function usePlannerBlockGesture(onCommit: (draft: PlannerGestureDraft) => void) {
    const [draft, setDraft] = useState<PlannerGestureDraft | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    useEffect(() => () => cleanupRef.current?.(), []);

    function begin(event: ReactPointerEvent<HTMLElement>, block: PlannerBlockView, mode: PlannerGestureMode) {
        if (event.button !== 0 || !event.isPrimary || !block.canEdit || cleanupRef.current) return;
        event.stopPropagation();
        const pointerId = event.pointerId;
        const startX = event.clientX;
        const startY = event.clientY;
        let dragging = false;

        const compute = (moveEvent: PointerEvent): PlannerGestureDraft => {
            const deltaMinutes = ((moveEvent.clientY - startY) / PLANNER_SLOT_PX) * PLANNER_SLOT_MINUTES;
            const targetDate = mode === 'move' ? dateAtPoint(moveEvent.clientX, moveEvent.clientY) || block.date : block.date;
            return { boardId: block.boardId, blockId: block.id, ...applyPlannerGesture(block, mode, deltaMinutes, targetDate) };
        };
        const onMove = (moveEvent: PointerEvent) => {
            if (moveEvent.pointerId !== pointerId) return;
            if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_THRESHOLD_PX) return;
            dragging = true;
            moveEvent.preventDefault();
            setDraft(compute(moveEvent));
        };
        const onUp = (upEvent: PointerEvent) => {
            if (upEvent.pointerId !== pointerId) return;
            cleanup();
            setDraft(null);
            if (dragging) onCommit(compute(upEvent));
        };
        const onCancel = (cancelEvent: PointerEvent) => {
            if (cancelEvent.pointerId !== pointerId) return;
            cancel();
        };
        const cancel = () => {
            cleanup();
            setDraft(null);
        };
        const cleanup = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            window.removeEventListener('lostpointercapture', onCancel);
            window.removeEventListener('blur', cancel);
            cleanupRef.current = null;
        };
        cleanupRef.current = cleanup;
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('lostpointercapture', onCancel);
        window.addEventListener('blur', cancel);
    }

    return { draft, begin };
}
