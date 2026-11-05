import { useEffect, useState, type InputHTMLAttributes, type Ref } from 'react';
import { formatDate, parseDateInput } from '@/domain/dates';
import { useI18n } from '@/shared/i18n';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> & {
    value?: string;
    ref?: Ref<HTMLInputElement>;
    onChange?: (event: { target: { value: string } }) => void;
};
export function DateInput({ value = '', onChange, onBlur, min, max, ...props }: Props) {
    const { language } = useI18n();
    const [text, setText] = useState(() => formatDate(value));
    useEffect(() => setText(formatDate(value)), [value]);
    const placeholder = language === 'pt' ? 'dd/mm/aaaa' : 'dd/mm/yyyy';
    return <input {...props} type="text" inputMode="numeric" placeholder={placeholder} pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" value={text} onChange={(event) => {
        const input = event.target;
        let raw = input.value;
        let caret = input.selectionStart ?? raw.length;
        let next = raw;
        if (/^[\d/]*$/.test(raw) && raw.replaceAll('/', '').length <= 8) {
            const inputType = (event.nativeEvent as InputEvent).inputType || '';
            const deleting = inputType.startsWith('delete');
            // Keep day/month/year segments intact when editing an existing date.
            // Deleting a slash removes its adjacent digit instead of getting stuck.
            if (deleting && raw.replaceAll('/', '').length === text.replaceAll('/', '').length) {
                const index = inputType === 'deleteContentBackward' ? Math.max(0, caret - 1) : caret + 1;
                raw = text.slice(0, index) + text.slice(index + 1);
                if (inputType === 'deleteContentBackward') caret = index;
            }
            caret = raw.slice(0, caret).replace(/\/{2,}/g, '/').length;
            raw = raw.replace(/\/{2,}/g, '/');
            if (/^\d{0,2}\/\d{0,2}(?:\/\d{0,4})?$/.test(raw)) {
                next = raw;
                if (!deleting && /^\d{2}\/\d{2}$/.test(raw)) {
                    next += '/';
                    if (caret === raw.length) caret++;
                }
            } else {
                const digits = raw.replaceAll('/', '');
                const beforeCaret = raw.slice(0, caret).replaceAll('/', '').length;
                next = digits.slice(0, 2)
                    + (digits.length > 2 || (!deleting && digits.length === 2) ? '/' + digits.slice(2, 4) : '')
                    + (digits.length > 4 || (!deleting && digits.length === 4) ? '/' + digits.slice(4) : '');
                caret = Math.min(next.length, beforeCaret + (beforeCaret >= 2 ? 1 : 0) + (beforeCaret >= 4 ? 1 : 0));
            }
            input.value = next;
            input.setSelectionRange(caret, caret);
        }
        setText(next);
        const iso = parseDateInput(next);
        const valid = iso !== null && (!iso || ((!min || iso >= String(min)) && (!max || iso <= String(max))));
        input.setCustomValidity(valid ? '' : placeholder);
        if (iso !== null) onChange?.({ target: { value: iso } });
    }} onBlur={(event) => { if (event.currentTarget.validity.valid) onBlur?.(event); }} />;
}
