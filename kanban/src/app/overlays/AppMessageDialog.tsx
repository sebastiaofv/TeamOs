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
    const returnFocus = useReturnFocus({
        initialFocus: message?.input ? inputRef : primaryRef,
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
                        className="modal-content"
                        onInteractOutside={keepOpen}
                        onEscapeKeyDown={stopEscape}
                        {...returnFocus}
                    >
                        {message && <AppMessageBody message={message} inputRef={inputRef} primaryRef={primaryRef} />}
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function AppMessageBody({ message, inputRef, primaryRef }: {
    message: AppMessage;
    inputRef: RefObject<HTMLInputElement | null>;
    primaryRef: RefObject<HTMLButtonElement | null>;
}) {
    const [inputValue, setInputValue] = useState(message.input?.defaultValue ?? '');
    const answer = (button: AppMessageButton) => resolveAppMessage(button.submitsInput ? inputValue : button.value);
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
                <Dialog.Description asChild>
                    <p className="app-message-text" id="appMessageText">{message.text}</p>
                </Dialog.Description>
                {message.input && (
                    <div className="form-group app-message-field">
                        <label className="sr-only" htmlFor="appMessageInput">{message.title}</label>
                        <input
                            type="text"
                            id="appMessageInput"
                            aria-labelledby="appMessageText"
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
                        onClick={() => answer(button)}
                    >
                        {button.label}
                    </button>
                ))}
            </div>
        </>
    );
}
