import { useRef, useState, type KeyboardEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { HelpDialogProps, HelpTab } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { closeDialog } from './dialogs';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { useI18n } from '@/shared/i18n';
import { PaletteHelp } from '@/features/portfolio/palette/PaletteHelp';

const TABS: { id: HelpTab; labelKey: 'paletteHelp.tabGuide' | 'paletteHelp.tabPalette' }[] = [
    { id: 'guide', labelKey: 'paletteHelp.tabGuide' },
    { id: 'palette', labelKey: 'paletteHelp.tabPalette' }
];

function HelpGuide() {
    const { t } = useI18n();
    return (
        <div className="help-manual">
            <div className="help-intro">
                <div className="help-intro-title">{t('help.whatThisAppIs')}</div>
                <div className="help-intro-text">{t('help.intro')}</div>
            </div>

            <div className="help-grid">
                <section className="help-card" aria-labelledby="help-getting-started">
                    <h3 className="help-card-title" id="help-getting-started">{t('help.gettingStarted')}</h3>
                    <ul>
                        <li>{t('help.newProject')}</li>
                        <li>{t('help.importProjects')}</li>
                        <li>{t('help.dragProjects')}</li>
                    </ul>
                </section>

                <section className="help-card" aria-labelledby="help-navigation">
                    <h3 className="help-card-title" id="help-navigation">{t('help.navigationFilters')}</h3>
                    <ul>
                        <li>{t('help.projectChips')}</li>
                        <li>{t('help.search')}</li>
                        <li>{t('help.controls')}</li>
                    </ul>
                </section>

                <section className="help-card" aria-labelledby="help-task-actions">
                    <h3 className="help-card-title" id="help-task-actions">{t('help.workingWithTasks')}</h3>
                    <ul>
                        <li>{t('help.openDetails')}</li>
                        <li>{t('help.taskActions')}</li>
                        <li>{t('help.addTask')}</li>
                        <li>{t('help.dragTasks')}</li>
                    </ul>
                </section>

                <section className="help-card" aria-labelledby="help-readonly">
                    <h3 className="help-card-title" id="help-readonly">{t('help.readOnlyProjects')}</h3>
                    <ul>
                        <li>{t('help.readOnlyChip')}</li>
                        <li>{t('help.inspectTasks')}</li>
                        <li>{t('help.readOnlyActions')}</li>
                    </ul>
                </section>
            </div>

            <div className="help-note">
                {t('help.quickShortcuts')}
            </div>
        </div>
    );
}

// Tabs follow the ARIA tabs pattern: arrow keys, Home and End move between
// tabs and select them.
function HelpBody({ initialTab }: { initialTab: HelpTab }) {
    const { t } = useI18n();
    const [tab, setTab] = useState<HelpTab>(initialTab);
    const tabRefs = useRef<Record<HelpTab, HTMLButtonElement | null>>({ guide: null, palette: null });

    const select = (next: HelpTab) => {
        setTab(next);
        tabRefs.current[next]?.focus();
    };
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const index = TABS.findIndex((entry) => entry.id === tab);
        const target = event.key === 'ArrowRight' ? TABS[(index + 1) % TABS.length]
            : event.key === 'ArrowLeft' ? TABS[(index - 1 + TABS.length) % TABS.length]
                : event.key === 'Home' ? TABS[0]
                    : event.key === 'End' ? TABS[TABS.length - 1]
                        : null;
        if (!target) return;
        event.preventDefault();
        select(target.id);
    };

    return (
        <>
            <div className="help-tabs" role="tablist" aria-label={t('paletteHelp.tabsLabel')} onKeyDown={onKeyDown}>
                {TABS.map((entry) => (
                    <button
                        key={entry.id}
                        ref={(node) => { tabRefs.current[entry.id] = node; }}
                        className={`help-tab${tab === entry.id ? ' active' : ''}`}
                        id={`help-tab-${entry.id}`}
                        type="button"
                        role="tab"
                        aria-selected={tab === entry.id}
                        aria-controls={`help-panel-${entry.id}`}
                        tabIndex={tab === entry.id ? 0 : -1}
                        onClick={() => setTab(entry.id)}
                    >{t(entry.labelKey)}</button>
                ))}
            </div>
            <div className="modal-body help-panel" id={`help-panel-${tab}`} role="tabpanel" aria-labelledby={`help-tab-${tab}`}>
                {tab === 'guide' ? <HelpGuide /> : <PaletteHelp />}
            </div>
        </>
    );
}

export function HelpDialog() {
    const open = useAppStore((s) => s.activeDialog === 'help');
    const props = useAppStore((s) => (s.activeDialog === 'help' ? s.dialogProps as HelpDialogProps | null : null));
    const returnFocus = useReturnFocus();
    const { t } = useI18n();

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeDialog('help'); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="helpModal">
                    <Dialog.Content
                        className="modal-content"
                        aria-describedby={undefined}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        onEscapeKeyDown={escapeAnswersAppMessage}
                        {...returnFocus}
                    >
                        <div className="modal-header">
                            <Dialog.Title asChild><span className="modal-title">{t('help.title')}</span></Dialog.Title>
                            <Dialog.Close className="modal-close" id="helpModalCloseBtn" aria-label={t('common.close')} title={t('common.close')}>&times;</Dialog.Close>
                        </div>
                        {open && <HelpBody initialTab={props?.tab || 'guide'} />}
                        <div className="modal-footer">
                            <Dialog.Close className="btn" id="helpModalFooterCloseBtn">{t('common.close')}</Dialog.Close>
                        </div>
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
