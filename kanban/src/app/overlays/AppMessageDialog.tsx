import { AppMessageReviewContent } from './AppMessageReviewContent';
import { translateCurrent } from '@/shared/i18n';
import { useRef, useState, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { AppMessage, AppMessageButton } from '@/app/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { resolveAppMessage } from './appMessages';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';

// A message needs an explicit answer, so clicks outside never dismiss it.
const keepOpen = (event: Event) => event.preventDefault();

// Escape answers only this message. Stop it reaching the document shortcut
// handler, which would also close the dialog underneath.
const stopEscape = (event: KeyboardEvent) => event.stopPropagation();

// Renders the open alert, confirm or prompt from actions/appMessages.ts. It
// stacks above any other open dialog, which stays open underneath.
export function AppMessageDialog() {
    const message = useAppStore((s) => s.appMessage);
    const inputRef = useRef<HTMLInputElement>(null);
    const primaryRef = useRef<HTMLButtonElement>(null);
    const selectionRef = useRef<HTMLSelectElement>(null);
    const returnFocus = useReturnFocus({
        initialFocus: message?.input ? inputRef : message?.selection?.required || message?.selections?.some((field) => field.required) ? selectionRef : primaryRef,
        selectInitial: Boolean(message?.input)
    });

    return (
        <Dialog.Root open={Boolean(message)} onOpenChange={(next) => {
            // Answer only the message this render shows: the dialog underneath
            // may already have answered it (see escapeAnswersAppMessage.ts).
            if (!next && message && useAppStore.getState().appMessage?.id === message.id) {
                resolveAppMessage(message.cancelValue);
            }
        }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="appMessageModal">
                    <Dialog.Content
                        key={message?.id}
                        role="alertdialog"
                        aria-labelledby="appMessageTitle"
                        aria-describedby="appMessageText"
                        className={`modal-content${message?.review ? ' has-transfer-review' : ''}`}
                        onInteractOutside={keepOpen}
                        onEscapeKeyDown={stopEscape}
                        {...returnFocus}
                    >
                        {message && <AppMessageBody message={message} inputRef={inputRef} primaryRef={primaryRef} selectionRef={selectionRef} />}
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function AppMessageBody({ message, inputRef, primaryRef, selectionRef }: {
    message: AppMessage;
    inputRef: RefObject<HTMLInputElement | null>;
    primaryRef: RefObject<HTMLButtonElement | null>;
    selectionRef: RefObject<HTMLSelectElement | null>;
}) {
    const [inputValue, setInputValue] = useState(message.input?.defaultValue ?? '');
    const [selection, setSelection] = useState(message.selection?.required ? -1 : 0);
    const [selections, setSelections] = useState<Record<string, string>>(() => Object.fromEntries((message.selections || []).map((field) => [field.id, field.required ? '' : field.options[0]?.value || ''])));
    const missingSelections = (message.selection?.required && selection < 0) || message.selections?.some((field) => field.required && !selections[field.id]);
    const answer = (button: AppMessageButton) => { if ((button.submitsSelection || button.submitsSelections) && missingSelections) return; if (button.submitsInput && message.input?.required && !inputValue.trim()) return; resolveAppMessage(button.submitsSelections ? selections : button.submitsSelection ? message.selection?.options[selection]?.value : button.submitsInput ? inputValue : button.value); };
    // Every message is built with a primary button (see appMessages.ts).
    const primary = message.buttons.find((button) => button.primary)!;

    return (
        <>
            <div className="modal-header">
                <Dialog.Title asChild>
                    <span className="modal-title" id="appMessageTitle">{message.title}</span>
                </Dialog.Title>
            </div>
            <div className="modal-body">
                {!message.review && <Dialog.Description asChild>
                    <p className="app-message-text" id="appMessageText">{message.text}</p>
                </Dialog.Description>}
                {message.review && <AppMessageReviewContent review={message.review} />}
                <div className={message.review && message.selections?.length ? 'transfer-mapping-fields' : undefined}>
                    {message.review && Boolean(message.selections?.length) && <div className="transfer-section-heading">
                        <h3>{message.review.mappingLabel}</h3><p>{message.review.mappingNote}</p>
                    </div>}
                    <div className={message.review ? 'transfer-table-scroll' : undefined}>
                    <table className={message.review ? 'transfer-mapping-table' : 'app-message-fields'}>
                        {message.review && <thead><tr><th>{translateCurrent('transfer.field')}</th><th>{translateCurrent('transfer.current')}</th><th>{translateCurrent('transfer.targetValue')}</th></tr></thead>}
                        <tbody>{message.selections?.map((field, index) => <tr className="form-group app-message-field" key={field.id}>
                            <th scope="row"><label htmlFor={`appMessageSelection-${index}`}>{field.label}</label></th>
                            {message.review && <td className="transfer-current-value">{field.current || '—'}</td>}
                            <td><select required={field.required} data-field={field.id} ref={index === 0 ? selectionRef : undefined} id={`appMessageSelection-${index}`} value={selections[field.id]} onChange={(event) => setSelections((current) => ({ ...current, [field.id]: event.target.value }))}>
                                {field.required && <option value="" disabled>{translateCurrent('common.choose')}</option>}
                                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select></td>
                        </tr>)}</tbody>
                    </table></div>
                </div>
                {message.selection && <div className="form-group app-message-field">
                    <label htmlFor="appMessageSelection">{message.selection.label}</label>
                    <select ref={selectionRef} id="appMessageSelection" value={selection} onChange={(event) => setSelection(Number(event.target.value))}>
                        {message.selection.required && <option value={-1} disabled>{translateCurrent('common.choose')}</option>}
                        {message.selection.options.map((option, index) => <option key={index} value={index}>{option.label}</option>)}
                    </select>
                </div>}
                {message.input && (
                    <div className="form-group app-message-field">
                        <label className="sr-only" htmlFor="appMessageInput">{message.title}</label>
                        <input
                            type="text"
                            id="appMessageInput"
                            aria-labelledby="appMessageText"
                            required={message.input.required}
                            ref={inputRef}
                            value={inputValue}
                            onChange={(event) => setInputValue(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key !== 'Enter') return;
                                event.preventDefault();
                                answer(primary);
                            }}
                        />
                    </div>
                )}
            </div>
            <div className="modal-footer">
                {message.buttons.map((button) => (
                    <button
                        key={button.label}
                        type="button"
                        className={`btn${button.primary ? ' btn-primary' : ''}${button.danger ? ' btn-danger' : ''}`}
                        id={button.primary ? 'appMessageConfirmBtn' : button.cancel ? 'appMessageCancelBtn' : undefined}
                        ref={button.primary ? primaryRef : undefined}
                        disabled={Boolean((button.submitsInput && message.input?.required && !inputValue.trim()) || ((button.submitsSelection || button.submitsSelections) && missingSelections))}
                        onClick={() => answer(button)}
                    >
                        {button.label}
                    </button>
                ))}
            </div>
        </>
    );
}
