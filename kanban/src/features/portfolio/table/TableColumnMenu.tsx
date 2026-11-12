import { useLayoutEffect, useRef } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useI18n } from '@/shared/i18n';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { useTableDisclosure } from './useTableDisclosure';

function VisibleColumn({ column, title, mandatory, index, count, move, hide }: {
    column: string; title: string; mandatory: boolean; index: number; count: number; move: (step: number) => void; hide: () => void;
}) {
    const { t } = useI18n();
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: column });
    return <div ref={setNodeRef} className={`table-column-option${isDragging ? ' is-dragging' : ''}`} data-column-choice={column} style={{ transform: CSS.Transform.toString(transform), transition }}>
        <button className="btn column-drag-handle" type="button" aria-label={t('table.dragColumn', { column: title })} {...attributes} {...listeners}><WorkspaceIcon name="grip" /></button>
        <span className="table-column-name">{title}</span>
        {mandatory ? <span className="table-column-lock" title={t('table.mandatory')} aria-label={t('table.mandatory')}><WorkspaceIcon name="lock" /></span>
            : <button className="btn icon-btn" type="button" aria-label={t('table.hideColumn', { column: title })} onClick={hide}><WorkspaceIcon name="eye" /></button>}
        <button className="btn icon-btn" type="button" disabled={index === 0} aria-label={t('table.moveUp', { column: title })} onClick={() => move(-1)}><WorkspaceIcon name="arrowUp" /></button>
        <button className="btn icon-btn" type="button" disabled={index === count - 1} aria-label={t('table.moveDown', { column: title })} onClick={() => move(1)}><WorkspaceIcon name="arrowDown" /></button>
    </div>;
}

/** Shared immediate column visibility and ordering, with pointer and keyboard controls. */
export function TableColumnMenu<Column extends string>({ columns, available, defaults, required, label, onChange, scope = '', hidden = false }: {
    columns: Column[]; available: readonly Column[]; defaults: readonly Column[]; required: readonly Column[];
    label: (column: Column) => string; onChange: (columns: Column[]) => void; scope?: string; hidden?: boolean;
}) {
    const { t } = useI18n();
    const disclosure = useTableDisclosure(hidden);
    const pendingFocus = useRef<Column | null>(null);
    useLayoutEffect(() => {
        if (!pendingFocus.current) return;
        const row = [...(disclosure.detailsRef.current?.querySelectorAll<HTMLElement>('[data-column-choice]') || [])].find(element => element.dataset.columnChoice === pendingFocus.current);
        row?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
        pendingFocus.current = null;
    }, [columns, disclosure.detailsRef]);
    function changeVisibility(column: Column, next: Column[]) {
        pendingFocus.current = column;
        onChange(next);
    }
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    function move(column: Column, step: number) {
        const from = columns.indexOf(column), to = from + step;
        if (from >= 0 && to >= 0 && to < columns.length) onChange(arrayMove(columns, from, to));
    }
    function drop({ active, over }: DragEndEvent) {
        if (!over || active.id === over.id) return;
        const from = columns.indexOf(active.id as Column), to = columns.indexOf(over.id as Column);
        if (from >= 0 && to >= 0) onChange(arrayMove(columns, from, to));
    }
    return <details id={scope ? `tableColumns-${scope}` : 'tableColumns'} className="table-columns" ref={disclosure.detailsRef} onKeyDown={disclosure.onKeyDown} onToggle={disclosure.onToggle}>
        <summary className="btn icon-btn" ref={disclosure.summaryRef} aria-label={t('table.columns')} title={t('table.columns')}><WorkspaceIcon name="columns" /></summary>
        <div className="table-column-panel" data-table-panel>
            <div className="table-column-options">
                <section aria-label={t('table.visibleColumns')}><h3>{t('table.visibleColumns')}</h3><div className="table-column-list">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={drop}>
                        <SortableContext items={columns} strategy={verticalListSortingStrategy}>
                            {columns.map((column, index) => <VisibleColumn key={column} column={column} title={label(column)} mandatory={required.includes(column)} index={index} count={columns.length}
                                move={step => move(column, step)} hide={() => changeVisibility(column, columns.filter(entry => entry !== column))} />)}
                        </SortableContext>
                    </DndContext>
                </div></section>
                <section aria-label={t('table.hiddenColumns')}><h3>{t('table.hiddenColumns')}</h3><div className="table-column-list">
                    {available.filter(column => !columns.includes(column)).map(column => <div className="table-column-option" key={column} data-column-choice={column}>
                        <span className="table-column-name">{label(column)}</span><button className="btn icon-btn" type="button" aria-label={t('table.showColumn', { column: label(column) })} onClick={() => changeVisibility(column, [...columns, column])}><WorkspaceIcon name="plus" /></button>
                    </div>)}
                </div></section>
            </div>
            <button className="btn" type="button" onClick={() => onChange([...defaults])}>{t('table.resetColumns')}</button>
        </div>
    </details>;
}
