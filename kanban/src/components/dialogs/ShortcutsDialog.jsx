import { Fragment } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '../../state/store.js';
import { closeDialog } from '../../actions/dialogs.js';
import { SHORTCUTS } from '../../actions/portfolioShortcuts.js';
import { useReturnFocus } from './useReturnFocus.js';
import { keepOpenOnUndoToast } from './keepOpenOnUndoToast.js';
import { escapeAnswersAppMessage } from './escapeAnswersAppMessage.js';

const DISPLAY_GROUPS = [
    { title: 'Global', sections: ['Global'] },
    { title: 'Cards', sections: ['Cards'] },
    { title: 'Modals', sections: ['Task Modal', 'Task Detail', 'Modal'] }
];

function ShortcutKeys({ tokens }) {
    return (tokens || []).map((token, index) => (
        <Fragment key={index}>
            {index > 0 && <span className="shortcut-plus">+</span>}
            <kbd>{token}</kbd>
        </Fragment>
    ));
}

function ShortcutSections({ registry }) {
    return (
        <div className="shortcut-sections-grid">
            {DISPLAY_GROUPS.map((group) => {
                const subgroups = group.sections
                    .map((section) => ({
                        section,
                        rows: registry.filter((entry) => entry.section === section)
                    }))
                    .filter((subgroup) => subgroup.rows.length > 0);

                if (subgroups.length === 0) return null;
                const showSubheading = group.sections.length > 1;

                return (
                    <section className="shortcut-section-card" aria-label={`${group.title} shortcuts`} key={group.title}>
                        <h3 className="shortcut-section-card-title">{group.title}</h3>
                        {subgroups.map((subgroup) => (
                            <Fragment key={subgroup.section}>
                                {showSubheading && <div className="shortcut-section-title">{subgroup.section}</div>}
                                <div className="shortcuts-list">
                                    {subgroup.rows.map((entry) => (
                                        <div className="shortcut-row" key={entry.id}>
                                            <div className="shortcut-keys"><ShortcutKeys tokens={entry.keys} /></div>
                                            <div className="shortcut-desc">{entry.description}</div>
                                        </div>
                                    ))}
                                </div>
                            </Fragment>
                        ))}
                    </section>
                );
            })}
        </div>
    );
}

export function ShortcutsDialog() {
    const open = useAppStore((s) => s.activeDialog === 'shortcuts');
    const returnFocus = useReturnFocus();

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeDialog('shortcuts'); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="shortcutsModal">
                    <Dialog.Content
                        className="modal-content"
                        aria-describedby={undefined}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        onEscapeKeyDown={escapeAnswersAppMessage}
                        {...returnFocus}
                    >
                        <div className="modal-header">
                            <Dialog.Title asChild><span className="modal-title">Keyboard Shortcuts</span></Dialog.Title>
                            <Dialog.Close className="modal-close" id="shortcutsModalCloseBtn">&times;</Dialog.Close>
                        </div>
                        <div className="modal-body">
                            <div className="shortcuts-list" id="shortcutsList">
                                <ShortcutSections registry={SHORTCUTS} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <Dialog.Close className="btn" id="shortcutsModalFooterCloseBtn">Close</Dialog.Close>
                        </div>
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
