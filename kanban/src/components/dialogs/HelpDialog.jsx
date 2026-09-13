import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '../../state/store.js';
import { closeDialog } from '../../actions/dialogs.js';
import { useReturnFocus } from './useReturnFocus.js';
import { keepOpenOnUndoToast } from './keepOpenOnUndoToast.js';

export function HelpDialog() {
    const open = useAppStore((s) => s.activeDialog === 'help');
    const returnFocus = useReturnFocus();

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeDialog('help'); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="helpModal">
                    <Dialog.Content
                        className="modal-content"
                        aria-describedby={undefined}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        {...returnFocus}
                    >
                        <div className="modal-header">
                            <Dialog.Title asChild><span className="modal-title">Help</span></Dialog.Title>
                            <Dialog.Close className="modal-close" id="helpModalCloseBtn">&times;</Dialog.Close>
                        </div>
                        <div className="modal-body">
                            <div className="help-manual">
                                <div className="help-intro">
                                    <div className="help-intro-title">What This App Is</div>
                                    <div className="help-intro-text">
                                        A portfolio view for multiple project boards. You can import projects, focus one project,
                                        and manage tasks directly from the same screen.
                                    </div>
                                </div>

                                <div className="help-grid">
                                    <section className="help-card" aria-labelledby="help-getting-started">
                                        <h3 className="help-card-title" id="help-getting-started">Getting Started</h3>
                                        <ul>
                                            <li>Use <strong>New Project</strong> to create a project file and add it to the portfolio.</li>
                                            <li>Use <strong>Import Projects</strong> to load one or more existing{' '}<code>.json</code> files.</li>
                                            <li>You can also drag project files into the app to import them.</li>
                                        </ul>
                                    </section>

                                    <section className="help-card" aria-labelledby="help-navigation">
                                        <h3 className="help-card-title" id="help-navigation">Navigation &amp; Filters</h3>
                                        <ul>
                                            <li>Use the project chips to switch between <strong>All</strong> projects and a single project.</li>
                                            <li>Search filters by task name.</li>
                                            <li>Archive, Sort, Priority, and Effort controls update the visible cards.</li>
                                        </ul>
                                    </section>

                                    <section className="help-card" aria-labelledby="help-task-actions">
                                        <h3 className="help-card-title" id="help-task-actions">Working With Tasks</h3>
                                        <ul>
                                            <li>Click a card to open task details.</li>
                                            <li>Use the card actions to edit, archive, or delete a task.</li>
                                            <li>When a writable project is selected, each column shows <strong>+ Add Task</strong>.</li>
                                            <li>Drag cards between columns to change status. Moves auto-save for writable projects.</li>
                                        </ul>
                                    </section>

                                    <section className="help-card" aria-labelledby="help-readonly">
                                        <h3 className="help-card-title" id="help-readonly">Read-Only Projects</h3>
                                        <ul>
                                            <li>Projects imported without a file handle are marked <em>(Read-only)</em> in the chip.</li>
                                            <li>You can still open and inspect tasks.</li>
                                            <li>Edit/archive/delete actions are disabled until the project is opened with a writable file handle.</li>
                                        </ul>
                                    </section>
                                </div>

                                <div className="help-note">
                                    Quick shortcuts: <kbd>?</kbd> opens this shortcut list, <kbd>/</kbd> focuses search,{' '}
                                    <kbd>I</kbd> imports projects, and <kbd>Esc</kbd> closes modals.
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <Dialog.Close className="btn" id="helpModalFooterCloseBtn">Close</Dialog.Close>
                        </div>
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
