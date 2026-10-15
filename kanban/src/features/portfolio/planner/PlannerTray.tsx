import type { CSSProperties } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { TaskStatus } from '@/domain/types';
import type { PlannerTrayGroup, PlannerTrayItem } from '@/features/portfolio/queries';
import { useI18n, type TranslationKey } from '@/shared/i18n';

export const PLANNER_TRAY_STATUSES: readonly TaskStatus[] = ['backlog', 'to-do', 'doing', 'done'];

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
    backlog: 'board.backlog',
    'to-do': 'board.toDo',
    doing: 'board.doing',
    done: 'board.done'
} as const;

export const trayDragId = (item: PlannerTrayItem) => `tray:${item.boardId}:${item.taskId}`;

export function PlannerTrayCardBody({ item }: { item: PlannerTrayItem }) {
    const { t } = useI18n();
    return (
        <>
            <span className="planner-tray-card-title">{item.title}</span>
            <span className="planner-tray-card-meta">
                {item.priority && <span className={`planner-pill planner-pill-${item.priority}`}>{item.priority.charAt(0).toUpperCase()}</span>}
                <span>#{item.taskId}</span>
                {item.effort && <span>{item.effort}</span>}
                {!item.canDrag && <span>{t('planner.readOnlyTask')}</span>}
                {item.planned && <span className="planner-tray-card-planned">✓ {t('planner.planned')}</span>}
            </span>
        </>
    );
}

function DraggablePlannerTrayCard({ item }: { item: PlannerTrayItem }) {
    const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
        id: trayDragId(item),
        data: { boardId: item.boardId, taskId: item.taskId, title: item.title },
        attributes: { roleDescription: 'draggable task' },
        disabled: !item.canDrag
    });
    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`planner-tray-card${item.planned ? ' planned' : ''}${isDragging ? ' dragging' : ''}`}
            data-task-id={item.taskId}
            aria-disabled={!item.canDrag}
            style={{ '--planner-project': item.color.border } as CSSProperties}
        >
            <PlannerTrayCardBody item={item} />
        </div>
    );
}

export function PlannerTray({ groups, statuses, onToggleStatus }: {
    groups: PlannerTrayGroup[];
    statuses: readonly TaskStatus[];
    onToggleStatus: (status: TaskStatus) => void;
}) {
    const { t } = useI18n();
    return (
        <aside className="planner-tray" aria-label={t('planner.trayLabel')}>
            <div className="planner-tray-filters" role="group" aria-label={t('planner.statusFilterLabel')}>
                {PLANNER_TRAY_STATUSES.map((status) => (
                    <button
                        key={status}
                        type="button"
                        className={`planner-chip${statuses.includes(status) ? ' active' : ''}`}
                        aria-pressed={statuses.includes(status)}
                        onClick={() => onToggleStatus(status)}
                    >{t(STATUS_LABEL_KEYS[status])}</button>
                ))}
            </div>
            <div className="planner-tray-list">
                {groups.length === 0 && <p className="empty-state-text">{t('planner.noTasks')}</p>}
                {groups.map((group) => (
                    <section className="planner-tray-group" key={group.boardId} aria-label={group.boardTitle}>
                        <h3 className="planner-tray-group-title">{group.boardTitle}</h3>
                        {group.items.map((item) => <DraggablePlannerTrayCard key={trayDragId(item)} item={item} />)}
                    </section>
                ))}
            </div>
        </aside>
    );
}
