import { useEffect, useRef, useState } from 'react';
import {
    DndContext,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    closestCenter,
    useSensor,
    useSensors
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { addChecklistItem, moveChecklistItem } from '../../../domain/taskDraft.js';

// Checklist items have no ids of their own. Rows are keyed by index, so the
// sortable id is the index too; the order only changes on drop.
const rowId = (index) => `checklist-${index}`;
const rowIndex = (id) => Number(String(id).slice('checklist-'.length));
const itemLabel = (id) => `Todo item ${rowIndex(id) + 1}`;

const ANNOUNCEMENTS = {
    onDragStart: ({ active }) => `Picked up ${itemLabel(active.id)}.`,
    onDragOver: ({ active, over }) => (over
        ? `${itemLabel(active.id)} is over position ${rowIndex(over.id) + 1}.`
        : `${itemLabel(active.id)} is no longer over the list.`),
    onDragEnd: ({ active, over }) => (over
        ? `${itemLabel(active.id)} dropped at position ${rowIndex(over.id) + 1}.`
        : `${itemLabel(active.id)} dropped.`),
    onDragCancel: ({ active }) => `Moving ${itemLabel(active.id)} was cancelled.`
};

// Reorder by dragging the handle with a mouse, by touch (press briefly first),
// or with the keyboard: Space picks an item up, arrow keys move it, Space drops
// it and Escape cancels.
export function ChecklistEditor({ value, onChange }) {
    const [composer, setComposer] = useState('');
    const [dragging, setDragging] = useState(false);
    const composerRef = useRef(null);
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Escape during a drag cancels the drag. Mark the key handled before the
    // task editor sees it, so the editor stays open.
    useEffect(() => {
        if (!dragging) return undefined;
        const markEscapeHandled = (event) => {
            if (event.key === 'Escape') event.preventDefault();
        };
        window.addEventListener('keydown', markEscapeHandled, true);
        return () => window.removeEventListener('keydown', markEscapeHandled, true);
    }, [dragging]);

    const addFromComposer = () => {
        const next = addChecklistItem(value, composer);
        if (next === value) return;
        onChange(next);
        setComposer('');
        composerRef.current?.focus();
    };

    const updateItem = (index, patch) => onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));

    const onDragEnd = ({ active, over }) => {
        setDragging(false);
        if (!over) return;
        const from = rowIndex(active.id);
        const to = rowIndex(over.id);
        if (from === to) return;
        onChange(moveChecklistItem(value, from, to, from < to ? 'after' : 'before'));
    };

    return (
        <div className="checklist-editor" id="taskChecklistEditor">
            <div className="checklist-editor-list" id="taskChecklistItems">
                {value.length === 0 ? (
                    <div className="checklist-editor-empty">No todo items yet.</div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        accessibility={{ announcements: ANNOUNCEMENTS }}
                        onDragStart={() => setDragging(true)}
                        onDragEnd={onDragEnd}
                        onDragCancel={() => setDragging(false)}
                    >
                        <SortableContext items={value.map((_, index) => rowId(index))} strategy={verticalListSortingStrategy}>
                            {value.map((item, index) => (
                                <ChecklistRow
                                    key={index}
                                    index={index}
                                    item={item}
                                    onUpdate={(patch) => updateItem(index, patch)}
                                    onRemove={() => onChange(value.filter((_, i) => i !== index))}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                )}
            </div>
            <div className="checklist-editor-add">
                <input
                    type="text"
                    id="taskChecklistNewItem"
                    placeholder="Add a todo item and press Enter"
                    ref={composerRef}
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        addFromComposer();
                    }}
                />
                <button type="button" className="btn" id="taskChecklistAddBtn" onClick={addFromComposer}>Add</button>
            </div>
        </div>
    );
}

function ChecklistRow({ index, item, onUpdate, onRemove }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: rowId(index) });
    const className = `checklist-editor-row${item.done ? ' done' : ''}${isDragging ? ' dragging' : ''}`;

    return (
        <div
            ref={setNodeRef}
            className={className}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            data-index={index}
        >
            <button
                {...attributes}
                {...listeners}
                ref={setActivatorNodeRef}
                type="button"
                className="checklist-editor-drag-handle"
                aria-label="Drag to reorder todo item"
                title="Drag to reorder"
                data-index={index}
            >
                ::
            </button>
            <input
                type="checkbox"
                checked={item.done}
                aria-label="Mark todo as done"
                data-index={index}
                onChange={(event) => onUpdate({ done: event.target.checked })}
            />
            <input
                type="text"
                value={item.text}
                aria-label="Todo item text"
                data-index={index}
                onChange={(event) => onUpdate({ text: event.target.value })}
            />
            <button
                type="button"
                className="checklist-editor-remove"
                aria-label="Remove todo item"
                title="Remove"
                data-index={index}
                onClick={onRemove}
            >
                ×
            </button>
        </div>
    );
}
