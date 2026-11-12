import { useLayoutEffect, useRef } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DASHBOARD_WIDGETS, dashboardActivityLayout, type DashboardActivityLayout, type DashboardWidget } from '@/domain/dashboardActivityLayout';
import { useI18n } from '@/shared/i18n';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { useTableDisclosure } from '../table/useTableDisclosure';

function VisibleWidget({ column, title, index, count, move, hide }: {
    column: string; title: string; index: number; count: number; move: (step: number) => void; hide: () => void;
}) {
    const { t } = useI18n();
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: column });
    return <div ref={setNodeRef} className={`table-column-option${isDragging ? ' is-dragging' : ''}`} data-column-choice={column} style={{ transform: CSS.Transform.toString(transform), transition }}>
        <button className="btn column-drag-handle" type="button" aria-label={t('dashboard.dragWidget', { name: title })} {...attributes} {...listeners}><WorkspaceIcon name="grip" /></button>
        <span className="table-column-name">{title}</span>
        <button className="btn icon-btn" type="button" aria-label={t('dashboard.hideWidget', { name: title })} onClick={hide}><WorkspaceIcon name="eye" /></button>
        <button className="btn icon-btn" type="button" disabled={index === 0} aria-label={t('dashboard.moveActivityUp', { name: title })} onClick={() => move(-1)}><WorkspaceIcon name="arrowUp" /></button>
        <button className="btn icon-btn" type="button" disabled={index === count - 1} aria-label={t('dashboard.moveActivityDown', { name: title })} onClick={() => move(1)}><WorkspaceIcon name="arrowDown" /></button>
    </div>;
}

/** Project-wide visibility and order use the same interactions as the Table column chooser. */
export function DashboardWidgetMenu({ layout, onChange, shared, hidden }: {
    layout: DashboardActivityLayout; onChange: (layout: DashboardActivityLayout) => void; shared: boolean; hidden: boolean;
}) {
    const columns = layout.order.filter(key => !layout.hidden.includes(key));
    const label = (key: DashboardWidget) => t(`dashboard.section.${key}`);
    const change = (next: DashboardWidget[]) => onChange({ version: 2, order: [...next, ...layout.order.filter(key => !next.includes(key))], hidden: DASHBOARD_WIDGETS.filter(key => !next.includes(key)) });
    const { t } = useI18n();
    const disclosure = useTableDisclosure(hidden);
    const pendingFocus = useRef<DashboardWidget | null>(null);
    useLayoutEffect(() => {
        if (!pendingFocus.current) return;
        const row = [...(disclosure.detailsRef.current?.querySelectorAll<HTMLElement>('[data-column-choice]') || [])].find(element => element.dataset.columnChoice === pendingFocus.current);
        row?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
        pendingFocus.current = null;
    }, [columns, disclosure.detailsRef]);
    function changeVisibility(column: DashboardWidget, next: DashboardWidget[]) {
        pendingFocus.current = column;
        change(next);
    }
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
    function move(column: DashboardWidget, step: number) {
        const from = columns.indexOf(column), to = from + step;
        if (from >= 0 && to >= 0 && to < columns.length) change(arrayMove(columns, from, to));
    }
    function drop({ active, over }: DragEndEvent) {
        if (!over || active.id === over.id) return;
        const from = columns.indexOf(active.id as DashboardWidget), to = columns.indexOf(over.id as DashboardWidget);
        if (from >= 0 && to >= 0) change(arrayMove(columns, from, to));
    }
    return <details className="dashboard-visible-sections table-columns" ref={disclosure.detailsRef} onKeyDown={disclosure.onKeyDown} onToggle={disclosure.onToggle}>
        <summary className="btn icon-btn" ref={disclosure.summaryRef} aria-label={t('dashboard.visibleSections')} title={t('dashboard.visibleSections')}><WorkspaceIcon name="settings" /></summary>
        <div className="table-column-panel dashboard-widget-panel" data-table-panel>
            <div className="table-column-options">
                <section aria-label={t('table.visibleColumns')}><h3>{t('table.visibleColumns')}</h3><div className="table-column-list">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={drop}>
                        <SortableContext items={columns} strategy={verticalListSortingStrategy}>
                            {columns.map((column, index) => <VisibleWidget key={column} column={column} title={label(column)} index={index} count={columns.length}
                                move={step => move(column, step)} hide={() => changeVisibility(column, columns.filter(entry => entry !== column))} />)}
                        </SortableContext>
                    </DndContext>
                </div></section>
                <section aria-label={t('table.hiddenColumns')}><h3>{t('table.hiddenColumns')}</h3><div className="table-column-list">
                    {layout.order.filter(column => !columns.includes(column)).map(column => <div className="table-column-option" key={column} data-column-choice={column}>
                        <span className="table-column-name">{label(column)}</span><button className="btn icon-btn" type="button" aria-label={t('dashboard.showWidget', { name: label(column) })} onClick={() => changeVisibility(column, [...columns, column])}><WorkspaceIcon name="plus" /></button>
                    </div>)}
                </div></section>
            </div>
            <button className="btn" type="button" onClick={() => onChange(dashboardActivityLayout(null))}>{t('dashboard.resetActivity')}</button>
            {shared && <p className="dashboard-note">{t('dashboard.activityShared')}</p>}
            <div className="dashboard-visibility-actions"><button className="btn" type="button" onClick={() => change([...layout.order])}>{t('dashboard.selectAll')}</button><button className="btn" type="button" onClick={() => change([])}>{t('dashboard.clearAll')}</button></div>
        </div>
    </details>;
}
