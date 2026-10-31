// In-app replacements for window.alert, confirm and prompt, answered in the app
// message dialog. Each call returns a promise that settles with the answer.
// Requests made while a message is open wait their turn. The store holds only
// what the dialog renders; the pending resolvers stay in this module.

import { flushSync } from 'react-dom';
import type { AppMessage, MessageSelection } from '@/app/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { translateCurrent } from '@/shared/i18n';

export type ConfirmOptions = { review?: import('@/app/types').AppMessageReview; title?: string; confirmLabel?: string; danger?: boolean; selections?: MessageSelection[] };
export type PromptOptions = { title?: string; confirmLabel?: string; required?: boolean };
export type Choice<T> = { value: T; label: string; primary?: boolean };

type PendingMessage = { message: AppMessage; resolve: (value: unknown) => void };

const pending: PendingMessage[] = [];
let nextMessageId = 1;

function request<T>(message: Omit<AppMessage, 'id'>): Promise<T> {
    return new Promise<T>((resolve) => {
        pending.push({ message: { ...message, id: nextMessageId++ }, resolve: resolve as (value: unknown) => void });
        if (pending.length === 1) useAppStore.setState({ appMessage: pending[0].message });
    });
}

// Settles the open message with `value` and shows the next one, if any.
// Commits synchronously, like closeDialog: callers often move focus as soon as
// the promise settles, and the message's focus trap must be gone by then.
export function resolveAppMessage(value: unknown): void {
    const current = pending.shift();
    if (!current) return;
    flushSync(() => {
        useAppStore.setState({ appMessage: pending[0]?.message ?? null });
    });
    current.resolve(value);
}

// Cancels the open message and every queued one, e.g. when the dialog fails to
// render and nobody can answer them.
export function cancelAppMessages(): void {
    const cancelled = pending.splice(0);
    if (cancelled.length === 0) return;
    useAppStore.setState({ appMessage: null });
    cancelled.forEach(({ message, resolve }) => resolve(message.cancelValue));
}

// Resolves once the message is dismissed.
export function showAlert(text: string, { title }: { title?: string } = {}): Promise<void> {
    return request({
        title: title || translateCurrent('messages.notice'),
        text,
        buttons: [{ label: translateCurrent('common.ok'), value: undefined, primary: true }],
        cancelValue: undefined
    });
}

// Resolves selected field values (or true without fields) when confirmed, false when cancelled.
export function showConfirm(text: string, { title, confirmLabel, danger = false, selections, review }: ConfirmOptions = {}): Promise<boolean | Record<string, string>> {
    return request({
        title: title || translateCurrent('messages.confirm'),
        text,
        ...(selections?.length ? { selections } : {}),
        ...(review ? { review } : {}),
        buttons: [
            { label: translateCurrent('messages.cancel'), value: false, cancel: true },
            { label: confirmLabel || translateCurrent('common.ok'), value: true, primary: true, danger, ...(selections?.length ? { submitsSelections: true } : {}) }
        ],
        cancelValue: false
    });
}

// Resolves with the entered text, or null when cancelled.
export function showPrompt(text: string, defaultValue: unknown = '', { title, confirmLabel, required = false }: PromptOptions = {}): Promise<string | null> {
    return request({
        title: title || translateCurrent('messages.input'),
        text,
        input: { defaultValue: String(defaultValue ?? ''), ...(required ? { required } : {}) },
        buttons: [
            { label: translateCurrent('messages.cancel'), value: null, cancel: true },
            { label: confirmLabel || translateCurrent('common.ok'), primary: true, submitsInput: true }
        ],
        cancelValue: null
    });
}

// Resolves with the chosen value, or null when cancelled. `choices` are
// { value, label, primary? } entries, shown after Cancel, or in a dropdown
// with an explicit confirmation when selectionLabel is supplied.
export function showChoice<T>(text: string, choices: readonly Choice<T>[], { title, selectionLabel, requiredSelection }: { title?: string; selectionLabel?: string; requiredSelection?: boolean } = {}): Promise<T | null> {
    return request({
        title: title || translateCurrent('messages.choose'),
        text,
        ...(selectionLabel ? { selection: { required: requiredSelection, label: selectionLabel, options: choices.map(({ value, label }) => ({ value, label })) } } : {}),
        buttons: [
            { label: translateCurrent('messages.cancel'), value: null, cancel: true },
            ...(selectionLabel ? [{ label: translateCurrent('messages.confirm'), primary: true, submitsSelection: true }]
                : choices.map(({ value, label, primary = false }) => ({ label, value, primary })))
        ],
        cancelValue: null
    });
}
