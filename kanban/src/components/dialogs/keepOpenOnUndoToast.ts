// Radix modal dialogs dismiss on any pointer-down outside their content. The
// undo toast sits above modals and clicking Undo must not close the dialog
// underneath. Pass as Dialog.Content's onPointerDownOutside.
export function keepOpenOnUndoToast(event: CustomEvent<{ originalEvent: PointerEvent }>): void {
    const target = event.detail?.originalEvent?.target;
    if (target instanceof Element && target.closest('#undoToast')) {
        event.preventDefault();
    }
}
