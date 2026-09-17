import { useRef, useState } from 'react';
import { addTag } from '@/domain/taskDraft';
import { showAlert } from '@/app/overlays/appMessages';
import { useI18n } from '@/shared/i18n';

export function TagEditor({ value, onChange, suggestions }: {
    value: string[];
    onChange: (next: string[]) => void;
    suggestions: string[];
}) {
    const { t } = useI18n();
    const [composer, setComposer] = useState('');
    const composerRef = useRef<HTMLInputElement>(null);

    const addFromComposer = () => {
        const result = addTag(value, composer);
        if (result.error !== undefined) {
            void showAlert(result.error, { title: t('editor.tagNotAdded') });
            return;
        }
        if (result.items === value) return;
        onChange(result.items);
        setComposer('');
        composerRef.current?.focus();
    };

    return (
        <>
            <div className="tag-editor" id="taskTagEditor">
                <div className="tag-editor-list" id="taskTagItems">
                    {value.length === 0 ? (
                        <div className="tag-editor-empty">{t('editor.noTags')}</div>
                    ) : value.map((tag, index) => (
                        <div className="tag-editor-row" data-index={index} key={tag}>
                            <span>{tag}</span>
                            <button
                                type="button"
                                className="tag-editor-remove"
                                aria-label={t('editor.removeTag')}
                                title={t('common.remove')}
                                data-index={index}
                                onClick={() => onChange(value.filter((_, i) => i !== index))}
                            >
                                &times;
                            </button>
                        </div>
                    ))}
                </div>
                <div className="tag-editor-add">
                    <input
                        type="text"
                        id="taskTagNewItem"
                        list="taskTagSuggestions"
                        placeholder={t('editor.addTagPlaceholder')}
                        ref={composerRef}
                        value={composer}
                        onChange={(event) => setComposer(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            addFromComposer();
                        }}
                    />
                    <button type="button" className="btn" id="taskTagAddBtn" onClick={addFromComposer}>{t('common.add')}</button>
                </div>
            </div>
            <datalist id="taskTagSuggestions">
                {suggestions.map((tag) => <option key={tag} value={tag} />)}
            </datalist>
        </>
    );
}
