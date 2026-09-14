import { useAppStore } from '../../state/store';
import { resolveAppMessage } from '../../actions/appMessages';

// While an app message is open, Escape answers it and never closes the dialog
// underneath. Radix moves its Escape listener to the newest layer only after the
// older layers re-render, so for a moment the dialog underneath can still get
// Escape. Pass as Dialog.Content's onEscapeKeyDown on dialogs a message can
// open over.
export function escapeAnswersAppMessage(event: KeyboardEvent): void {
    const message = useAppStore.getState().appMessage;
    if (!message) return;
    event.preventDefault();
    // Keep the key from the document shortcut handler, which would close this
    // dialog once the message is gone.
    event.stopPropagation();
    resolveAppMessage(message.cancelValue);
}
