import { Fragment, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppStore } from '@/features/portfolio/state/store';
import { closeDialog } from './dialogs';
import { areSingleKeyShortcutsEnabled, setSingleKeyShortcutsEnabled, SHORTCUTS, type Shortcut } from '@/features/portfolio/commands/portfolioShortcuts';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { useI18n } from '@/shared/i18n';

type ShortcutSectionGroup = { title: string; sections: { key: string; title: string }[] };

function ShortcutKeys({ tokens }: { tokens: string[] }) {
    return (tokens || []).map((token, index) => (
        <Fragment key={index}>
            {index > 0 && <span className="shortcut-plus">+</span>}
            <kbd>{token}</kbd>
        </Fragment>
    ));
}

function ShortcutSections({ registry, groups }: { registry: Shortcut[]; groups: ShortcutSectionGroup[] }) {
    return (
        <div className="shortcut-sections-grid">
            {groups.map((group) => {
                const subgroups = group.sections
                    .map(({ key, title }) => ({
                        section: key,
                        title,
                        rows: registry.filter((entry) => entry.section === key)
                    }))
                    .filter((subgroup) => subgroup.rows.length > 0);

                if (subgroups.length === 0) return null;
                const showSubheading = group.sections.length > 1;

                return (
                    <section className="shortcut-section-card" aria-label={`${group.title} shortcuts`} key={group.title}>
                        <h3 className="shortcut-section-card-title">{group.title}</h3>
                        {subgroups.map((subgroup) => (
                            <Fragment key={subgroup.section}>
                                {showSubheading && <div className="shortcut-section-title">{subgroup.title}</div>}
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
    const { t } = useI18n();
    const [singleKeyShortcutsEnabled, setShortcutsEnabled] = useState(() => areSingleKeyShortcutsEnabled());
    useEffect(() => {
        if (!open) return undefined;
        const refresh = () => setShortcutsEnabled(areSingleKeyShortcutsEnabled());
        window.addEventListener('teamOs:shortcut-preference-changed', refresh);
        return () => window.removeEventListener('teamOs:shortcut-preference-changed', refresh);
    }, [open]);
    const localizedShortcuts = SHORTCUTS.map((entry) => {
        const description = entry.id.startsWith('move-')
            ? t('shortcuts.cardMove', {
                label: entry.id === 'move-backlog'
                    ? t('board.backlog')
                    : entry.id === 'move-to-do'
                        ? t('board.toDo')
                        : entry.id === 'move-doing'
                            ? t('board.doing')
                            : t('board.done')
            })
            : ({
                'focus-search': t('shortcuts.focusSearchPalette'),
                'open-palette': t('shortcuts.openPalette'),
                'new-project': t('shortcuts.newProject'),
                'import-projects': t('shortcuts.importProjects'),
                'open-shortcuts': t('shortcuts.openShortcuts'),
                'open-help': t('shortcuts.openHelp'),
                'reset-filters': t('shortcuts.resetFilters'),
                'focus-sort': t('shortcuts.focusSort'),
                'project-prev': t('shortcuts.projectPrev'),
                'project-next': t('shortcuts.projectNext'),
                'card-next': t('shortcuts.cardNext'),
                'card-prev': t('shortcuts.cardPrev'),
                'card-open': t('shortcuts.cardOpen'),
                'card-edit': t('shortcuts.cardEdit'),
                'card-archive': t('shortcuts.cardArchive'),
                'save-task-modal': t('shortcuts.saveTask'),
                'detail-edit': t('shortcuts.detailEdit'),
                'detail-archive': t('shortcuts.detailArchive'),
                'close-modal': t('shortcuts.closeModal'),
                'open-planner': t('shortcuts.openPlanner'),
                'planner-today': t('shortcuts.plannerToday'),
                'planner-day': t('shortcuts.plannerDay'),
                'planner-week': t('shortcuts.plannerWeek'),
                'planner-prev': t('shortcuts.plannerPrev'),
                'planner-next': t('shortcuts.plannerNext'),
                'planner-block-move': t('shortcuts.plannerBlockMove'),
                'planner-block-resize': t('shortcuts.plannerBlockResize'),
                'planner-block-remove': t('shortcuts.plannerBlockRemove'),
                'planner-block-open': t('shortcuts.plannerBlockOpen')
            } as Record<string, string>)[entry.id] || entry.description;
        return { ...entry, description };
    });
    const groups = [
        { title: t('shortcuts.global'), sections: [{ key: 'Global', title: t('shortcuts.global') }] },
        { title: t('shortcuts.cards'), sections: [{ key: 'Cards', title: t('shortcuts.cards') }] },
        {
            title: t('shortcuts.planner'),
            sections: [
                { key: 'Day Planner', title: t('shortcuts.plannerNavigation') },
                { key: 'Planner Blocks', title: t('shortcuts.plannerBlocks') }
            ]
        },
        {
            title: t('shortcuts.modals'),
            sections: [
                { key: 'Task Modal', title: t('shortcuts.taskModal') },
                { key: 'Task Detail', title: t('shortcuts.taskDetail') },
                { key: 'Modal', title: t('shortcuts.modal') }
            ]
        }
    ];

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
                            <Dialog.Title asChild><span className="modal-title">{t('shortcuts.title')}</span></Dialog.Title>
                            <Dialog.Close className="modal-close" id="shortcutsModalCloseBtn" aria-label={t('common.close')} title={t('common.close')}>&times;</Dialog.Close>
                        </div>
                        <div className="modal-body">
                            <div className="shortcut-preference">
                                <label htmlFor="singleKeyShortcutsEnabled">
                                    <input
                                        id="singleKeyShortcutsEnabled"
                                        type="checkbox"
                                        checked={singleKeyShortcutsEnabled}
                                        onChange={(event) => {
                                            setShortcutsEnabled(event.target.checked);
                                            setSingleKeyShortcutsEnabled(event.target.checked);
                                        }}
                                    />
                                    <span>{t('shortcuts.enable')}</span>
                                </label>
                                <p id="singleKeyShortcutsDescription">{t('shortcuts.enableDescription')}</p>
                            </div>
                            <div className="shortcuts-list" id="shortcutsList">
                                <ShortcutSections registry={localizedShortcuts} groups={groups} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <Dialog.Close className="btn" id="shortcutsModalFooterCloseBtn">{t('common.close')}</Dialog.Close>
                        </div>
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
