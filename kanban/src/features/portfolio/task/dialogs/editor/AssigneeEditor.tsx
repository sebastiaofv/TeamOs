import { useRef, useState } from 'react';
import { addAssignee, availableAssigneeSuggestions } from '@/domain/taskDraft';
import { useI18n } from '@/shared/i18n';

// Assignee rows stay editable; blank rows are dropped when the draft is built.
export function AssigneeEditor({ value, onChange, pool, onRename, onRemove }: {
    value: string[];
    onChange: (next: string[]) => void;
    pool: string[];
    onRename: (index: number, name: string) => void;
    onRemove: (index: number) => unknown;
}) {
    const { t } = useI18n();
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
            <div className="assignee-editor" id="taskAssigneeEditor" aria-labelledby="taskAssigneesLabel">
                <div className="assignee-editor-list" id="taskAssigneeItems">
                    {value.length === 0 ? (
                        <div className="assignee-editor-empty">{t('editor.noAssignees')}</div>
                    ) : value.map((name, index) => (
                        <div className="assignee-editor-row" data-index={index} key={index}>
                            <ParticipantName key={name} name={name} label={t('editor.assigneeName')} onRename={(next) => onRename(index, next)} />
                            <button
                                type="button"
                                className="assignee-editor-remove"
                                aria-label={t('editor.removeAssignee')}
                                title={t('common.remove')}
                                data-index={index}
                                onClick={() => onRemove(index)}
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
                        aria-label={t('editor.addAssigneePlaceholder')}
                        list="taskAssigneeSuggestions"
                        placeholder={t('editor.addAssigneePlaceholder')}
                        ref={composerRef}
                        value={composer}
                        onChange={(event) => setComposer(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            addFromComposer();
                        }}
                    />
                    <button type="button" className="btn" id="taskAssigneeAddBtn" onClick={addFromComposer}>{t('common.add')}</button>
                </div>
            </div>
            <datalist id="taskAssigneeSuggestions">
                {availableAssigneeSuggestions(pool, value).map((name) => <option key={name} value={name} />)}
            </datalist>
        </>
    );
}

function ParticipantName({ name, label, onRename }: { name: string; label: string; onRename: (name: string) => void }) {
    const [draft, setDraft] = useState(name);
    return <input type="text" value={draft} list="taskAssigneeSuggestions" aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { onRename(draft); setDraft(draft.trim() || name); }}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />;
}
