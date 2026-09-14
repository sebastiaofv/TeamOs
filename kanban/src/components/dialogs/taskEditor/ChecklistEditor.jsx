import { useRef, useState } from 'react';
import { getTaskChecklistDropPlacement } from '../../../domain/task.js';
import { addChecklistItem, moveChecklistItem } from '../../../domain/taskDraft.js';

const IDLE_DRAG = { activeIndex: -1, targetIndex: -1, placement: '' };

// Native HTML5 drag keeps checklist reordering lightweight and dependency-free.
export function ChecklistEditor({ value, onChange }) {
    const [composer, setComposer] = useState('');
    const [drag, setDrag] = useState(IDLE_DRAG);
    const composerRef = useRef(null);

    const addFromComposer = () => {
        const next = addChecklistItem(value, composer);
        if (next === value) return;
        onChange(next);
        setComposer('');
        composerRef.current?.focus();
    };

    const updateItem = (index, patch) => onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));

    const rowClassName = (item, index) => {
        const classes = ['checklist-editor-row'];
        if (item.done) classes.push('done');
        if (index === drag.activeIndex) classes.push('dragging');
        if (index === drag.targetIndex && index !== drag.activeIndex && drag.placement) {
            classes.push(drag.placement === 'before' ? 'drag-over-before' : 'drag-over-after');
        }
        return classes.join(' ');
    };

    const onDragStart = (event, index) => {
        setDrag({ activeIndex: index, targetIndex: -1, placement: '' });
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(index));
        }
    };

    const onDragOver = (event, index) => {
        if (drag.activeIndex < 0) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const placement = getTaskChecklistDropPlacement(event.currentTarget, event.clientY);
        if (drag.targetIndex === index && drag.placement === placement) return;
        setDrag({ ...drag, targetIndex: index, placement });
    };

    const onDrop = (event, index) => {
        if (drag.activeIndex < 0) return;
        event.preventDefault();
        const placement = getTaskChecklistDropPlacement(event.currentTarget, event.clientY);
        onChange(moveChecklistItem(value, drag.activeIndex, index, placement));
        setDrag(IDLE_DRAG);
    };

    return (
        <div className="checklist-editor" id="taskChecklistEditor">
            <div className="checklist-editor-list" id="taskChecklistItems">
                {value.length === 0 ? (
                    <div className="checklist-editor-empty">No todo items yet.</div>
                ) : value.map((item, index) => (
                    <div
                        className={rowClassName(item, index)}
                        data-index={index}
                        key={index}
                        onDragOver={(event) => onDragOver(event, index)}
                        onDrop={(event) => onDrop(event, index)}
                    >
                        <button
                            type="button"
                            className="checklist-editor-drag-handle"
                            aria-label="Drag to reorder todo item"
                            title="Drag to reorder"
                            data-index={index}
                            draggable
                            onDragStart={(event) => onDragStart(event, index)}
                            onDragEnd={() => setDrag(IDLE_DRAG)}
                        >
                            ::
                        </button>
                        <input
                            type="checkbox"
                            checked={item.done}
                            aria-label="Mark todo as done"
                            data-index={index}
                            onChange={(event) => updateItem(index, { done: event.target.checked })}
                        />
                        <input
                            type="text"
                            value={item.text}
                            aria-label="Todo item text"
                            data-index={index}
                            onChange={(event) => updateItem(index, { text: event.target.value })}
                        />
                        <button
                            type="button"
                            className="checklist-editor-remove"
                            aria-label="Remove todo item"
                            title="Remove"
                            data-index={index}
                            onClick={() => onChange(value.filter((_, i) => i !== index))}
                        >
                            ×
                        </button>
                    </div>
                ))}
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
