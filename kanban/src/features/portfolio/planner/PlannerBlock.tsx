import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { PLANNER_SLOT_MINUTES, formatPlannerDuration, type PlannerGestureMode } from '@/domain/dayPlanner';
import type { PlannerBlockView } from '@/features/portfolio/queries';
import { useI18n } from '@/shared/i18n';
import { plannerMinutesToPx } from './plannerGeometry';

export type PlannerBlockHandlers = {
    onSelect: (block: PlannerBlockView) => void;
    onOpen: (block: PlannerBlockView) => void;
    onRemove: (block: PlannerBlockView) => void;
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>, block: PlannerBlockView) => void;
    onGestureStart: (event: PointerEvent<HTMLElement>, block: PlannerBlockView, mode: PlannerGestureMode) => void;
};

export function PlannerBlock({ block, selected, dragging, handlers }: {
    block: PlannerBlockView;
    selected: boolean;
    dragging: boolean;
    handlers: PlannerBlockHandlers;
}) {
    const { t } = useI18n();
    const top = plannerMinutesToPx(block.startMinutes);
    const height = plannerMinutesToPx(block.endMinutes) - top;
    const compact = block.endMinutes - block.startMinutes <= PLANNER_SLOT_MINUTES;
    const style = {
        top: `${top + 1}px`,
        height: `${height - 2}px`,
        left: `calc(${(block.column / block.columns) * 100}% + 4px)`,
        width: `calc(${100 / block.columns}% - 8px)`,
        '--planner-block-bg': block.color.bg,
        '--planner-block-border': block.color.border,
        '--planner-block-text': block.color.text
    } as CSSProperties;
    const className = ['planner-block',
        selected && 'selected', dragging && 'dragging', block.done && 'done',
        block.archived && 'archived', !block.canEdit && 'read-only'].filter(Boolean).join(' ');

    return (
        <div
            className={className}
            style={style}
            role="button"
            tabIndex={0}
            data-block-id={block.id}
            aria-label={t('planner.blockLabel', { title: block.title, start: block.start, end: block.end, project: block.boardTitle })}
            onClick={() => handlers.onSelect(block)}
            onDoubleClick={() => handlers.onOpen(block)}
            onKeyDown={(event) => handlers.onKeyDown(event, block)}
            onPointerDown={(event) => handlers.onGestureStart(event, block, 'move')}
        >
            {block.canEdit && <span className="planner-block-handle top" aria-hidden="true" onPointerDown={(event) => handlers.onGestureStart(event, block, 'resize-start')} />}
            <span className="planner-block-title">
                {block.title}
                {compact && <span className="planner-block-meta"> {block.start}</span>}
            </span>
            {!compact && (
                <span className="planner-block-meta">
                    {block.start}–{block.end} · {formatPlannerDuration(block.endMinutes - block.startMinutes)} · {block.boardTitle}
                </span>
            )}
            {block.canEdit && (
                <button
                    className="planner-block-remove"
                    type="button"
                    tabIndex={-1}
                    aria-label={t('planner.removeBlock', { title: block.title })}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); handlers.onRemove(block); }}
                >×</button>
            )}
            {block.canEdit && <span className="planner-block-handle bottom" aria-hidden="true" onPointerDown={(event) => handlers.onGestureStart(event, block, 'resize-end')} />}
        </div>
    );
}
