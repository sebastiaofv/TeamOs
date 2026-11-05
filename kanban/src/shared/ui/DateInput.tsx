import { useEffect, useState, type InputHTMLAttributes, type Ref } from 'react';
import { formatDate, parseDateInput } from '@/domain/dates';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> & {
    value?: string;
    ref?: Ref<HTMLInputElement>;
    onChange?: (event: { target: { value: string } }) => void;
};
export function DateInput({ value = '', onChange, onBlur, min, max, ...props }: Props) {
    const [text, setText] = useState(() => formatDate(value));
    useEffect(() => setText(formatDate(value)), [value]);
    return <input {...props} type="text" inputMode="numeric" placeholder="dd/mm/yyyy" pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" value={text} onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const iso = parseDateInput(next);
        const valid = iso !== null && (!iso || ((!min || iso >= String(min)) && (!max || iso <= String(max))));
        event.target.setCustomValidity(valid ? '' : 'dd/mm/yyyy');
        if (iso !== null) onChange?.({ target: { value: iso } });
    }} onBlur={(event) => { if (event.currentTarget.validity.valid) onBlur?.(event); }} />;
}
