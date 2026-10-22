import { useState } from 'react';
import { addTag } from '@/domain/taskDraft';
import { showAlert } from '@/app/overlays/appMessages';
import { useI18n } from '@/shared/i18n';

export function TagEditor({ value, onChange, suggestions }: {
    value: string[]; onChange: (next: string[]) => void; suggestions: string[];
}) {
    const { t } = useI18n();
    const [selected, setSelected] = useState('');
    const available = suggestions.filter((tag) => !value.includes(tag));
    const add = () => {
        if (!available.includes(selected)) return;
        const result = addTag(value, selected);
        if (result.error !== undefined) { void showAlert(result.error, { title: t('editor.tagNotAdded') }); return; }
        onChange(result.items); setSelected('');
    };
    return <div className="tag-editor" id="taskTagEditor" aria-labelledby="taskTagsLabel">
        <div className="tag-editor-list" id="taskTagItems">
            {!value.length && <div className="tag-editor-empty">{t('editor.noTags')}</div>}
            {value.map((tag, index) => <div className="tag-editor-row" key={tag}>
                <span>{tag}</span>
                <button type="button" className="tag-editor-remove" aria-label={t('editor.removeTag')}
                    onClick={() => onChange(value.filter((_, i) => i !== index))}>&times;</button>
            </div>)}
        </div>
        <div className="tag-editor-add">
            <select id="taskTagNewItem" aria-label={t('editor.addTagPlaceholder')} value={selected} onChange={(event) => setSelected(event.target.value)}>
                <option value="">{t('common.choose')}</option>
                {available.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
            <button type="button" className="btn" id="taskTagAddBtn" disabled={!selected} onClick={add}>{t('common.add')}</button>
        </div>
    </div>;
}
