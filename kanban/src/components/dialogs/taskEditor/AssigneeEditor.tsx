import { useRef, useState } from 'react';
import { addAssignee, availableAssigneeSuggestions } from '../../../domain/taskDraft';

// Assignee rows stay editable; blank rows are dropped when the draft is built.
export function AssigneeEditor({ value, onChange, pool }: {
    value: string[];
    onChange: (next: string[]) => void;
    pool: string[];
}) {
    const [composer, setComposer] = useState('');
    const composerRef = useRef<HTMLInputElement>(null);

    const addFromComposer = () => {
        const name = composer.trim();
        if (!name) return;
        onChange(addAssignee(value, name));
        setComposer('');
        composerRef.current?.focus();
    };

    return (
        <>
            <div className="assignee-editor" id="taskAssigneeEditor">
                <div className="assignee-editor-list" id="taskAssigneeItems">
                    {value.length === 0 ? (
                        <div className="assignee-editor-empty">No assignees yet.</div>
                    ) : value.map((name, index) => (
                        <div className="assignee-editor-row" data-index={index} key={index}>
                            <input
                                type="text"
                                value={name}
                                list="taskAssigneeSuggestions"
                                aria-label="Assignee name"
                                data-index={index}
                                onChange={(event) => onChange(value.map((item, i) => (i === index ? event.target.value : item)))}
                            />
                            <button
                                type="button"
                                className="assignee-editor-remove"
                                aria-label="Remove assignee"
                                title="Remove"
                                data-index={index}
                                onClick={() => onChange(value.filter((_, i) => i !== index))}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
                <div className="assignee-editor-add">
                    <input
                        type="text"
                        id="taskAssigneeNewItem"
                        list="taskAssigneeSuggestions"
                        placeholder="Add an assignee and press Enter"
                        ref={composerRef}
                        value={composer}
                        onChange={(event) => setComposer(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            addFromComposer();
                        }}
                    />
                    <button type="button" className="btn" id="taskAssigneeAddBtn" onClick={addFromComposer}>Add</button>
                </div>
            </div>
            <datalist id="taskAssigneeSuggestions">
                {availableAssigneeSuggestions(pool, value).map((name) => <option key={name} value={name} />)}
            </datalist>
        </>
    );
}
