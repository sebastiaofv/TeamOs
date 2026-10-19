import { useRef, useState } from 'react';
import { addAssignee, availableAssigneeSuggestions } from '@/domain/taskDraft';
import { useI18n } from '@/shared/i18n';

type ParticipantRows = { names: string[]; rows: { id: number; name: string }[]; nextId: number };

function reconcileParticipantRows(previous: ParticipantRows, names: string[]): ParticipantRows {
    let nextId = previous.nextId;
    const rows = names.map((name) => previous.rows.find((row) => row.name === name) || { id: nextId++, name });
    return { names, rows, nextId };
}

// Row-local text allows blank intermediate edits; removal uses the explicit action.
export function AssigneeEditor({ value, onChange, pool, onRename, onDraftRename, onRemove }: {
    value: string[];
    onChange: (next: string[]) => void;
    pool: string[];
    onRename: (index: number, name: string) => void;
    onDraftRename: (index: number, name: string) => void;
    onRemove: (index: number) => unknown;
}) {
    const { t } = useI18n();
    const [composer, setComposer] = useState('');
    const [pendingRename, setPendingRename] = useState<{ index: number; name: string } | null>(null);
    const [rowIdentity, setRowIdentity] = useState<ParticipantRows>(() => ({
        names: value, rows: value.map((name, id) => ({ id, name })), nextId: value.length
    }));
    const currentRows = rowIdentity.names === value ? rowIdentity : reconcileParticipantRows(rowIdentity, value);
    if (currentRows !== rowIdentity) setRowIdentity(currentRows);
    const composerRef = useRef<HTMLInputElement>(null);
    const suggestionNames = pendingRename
        ? value.map((name, index) => index === pendingRename.index ? pendingRename.name : name)
        : value;

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
                        <div className="assignee-editor-row" data-index={index} key={currentRows.rows[index].id}>
                            <ParticipantName name={name} label={t('editor.assigneeName')}
                                onDraftChange={(next) => {
                                    setPendingRename({ index, name: next });
                                    onDraftRename(index, next);
                                }}
                                onRename={(next) => {
                                    // Keep the input and its Remove button mounted
                                    // through blur, including the click that caused it.
                                    const id = currentRows.rows[index].id;
                                    setRowIdentity((current) => ({ ...current, rows: current.rows.map((row) =>
                                        row.id === id ? { ...row, name: next.trim() || name } : row) }));
                                    onRename(index, next);
                                    setPendingRename(null);
                                }} />
                            <button
                                type="button"
                                className="assignee-editor-remove"
                                aria-label={t('editor.removeAssignee')}
                                title={t('common.remove')}
                                data-index={index}
                                onClick={() => { void onRemove(index); }}
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
                {availableAssigneeSuggestions(pool, suggestionNames).map((name) => <option key={name} value={name} />)}
            </datalist>
        </>
    );
}

function ParticipantName({ name, label, onRename, onDraftChange }: {
    name: string; label: string; onRename: (name: string) => void; onDraftChange: (name: string) => void;
}) {
    const [draft, setDraft] = useState(name);
    return <input type="text" value={draft} list="taskAssigneeSuggestions" aria-label={label}
        onChange={(event) => { setDraft(event.target.value); onDraftChange(event.target.value); }}
        onBlur={() => { onRename(draft); setDraft(draft.trim() || name); }}
        onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
            event.preventDefault();
            event.currentTarget.blur();
        }} />;
}
