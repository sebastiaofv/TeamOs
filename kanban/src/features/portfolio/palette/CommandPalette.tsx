// The command palette dialog (⌘K / Ctrl+K, "/", or the toolbar search box).
// Results come from buildPaletteModel; running an item goes through
// runPaletteAction with the app's own commands, so undo, saving and
// read-only projects behave as everywhere else.

import { Fragment, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useShallow } from 'zustand/react/shallow';
import type { CommandPaletteProps } from '@/features/portfolio/types';
import { todayLocalIsoDate } from '@/domain/util';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { closeDialog, openDialog } from '@/app/overlays/dialogs';
import {
    resetPortfolioFilters,
    selectPortfolioBoard,
    setPortfolioFilter,
    setPortfolioViewMode
} from '@/features/portfolio/commands/portfolioControls';
import { createNewProject, importPortfolioProjects } from '@/features/portfolio/projects/projectCommands';
import { toggleThemePreference } from '@/shared/hooks/useTheme';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { formatPlannerDateLabel, useI18n } from '@/shared/i18n';
import { buildPaletteModel, type PaletteFrame, type PaletteIcon, type PaletteItem } from './paletteModel';
import { runPaletteAction, type PaletteDeps } from './paletteActions';
import { loadRecentPaletteItems, rememberPaletteItem } from './recentItems';
import { requestOpenFilters } from './openCommandPalette';

const ICONS: Record<PaletteIcon, string> = {
    task: '●', project: '■', roadmap: '◆', command: '›', filter: '⌕', create: '+', open: '↗', move: '→',
    assign: '@', priority: '!', plan: '◷', edit: '✎', archive: '▭', person: '', time: '◷'
};

function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
    if (!ranges.length) return <>{text}</>;
    const parts: ReactNode[] = [];
    let cursor = 0;
    ranges.forEach(([start, end], index) => {
        if (start > cursor) parts.push(text.slice(cursor, start));
        parts.push(<mark key={index}>{text.slice(start, end)}</mark>);
        cursor = end;
    });
    parts.push(text.slice(cursor));
    return <>{parts}</>;
}

function ItemIcon({ item }: { item: PaletteItem }) {
    if (item.checked !== undefined) return <span className="palette-item-icon" aria-hidden="true">{item.checked ? '✓' : ''}</span>;
    return (
        <span className="palette-item-icon" aria-hidden="true" style={item.color ? { color: item.color } : undefined}>
            {ICONS[item.icon]}
        </span>
    );
}

const sameFrame = (a: PaletteFrame | undefined, b: PaletteFrame) => Boolean(a)
    && a!.kind === b.kind && a!.boardId === b.boardId && a!.taskId === b.taskId
    && (a!.kind !== 'step' || (b.kind === 'step' && a!.step === b.step));

function PaletteBody({ contextTask, initialQuery }: { contextTask: CommandPaletteProps['contextTask']; initialQuery: string }) {
    const { t, language, toggleLanguage } = useI18n();
    const actions = usePortfolioActions();
    const state = useAppStore(useShallow((s) => ({
        boards: s.portfolioBoards,
        rows: s.portfolioTasks,
        selectedBoardId: s.selectedPortfolioBoardId,
        boardSearch: s.portfolioFilters.search
    })));
    const [query, setQuery] = useState(initialQuery);
    const [stack, setStack] = useState<PaletteFrame[]>([]);
    const [active, setActive] = useState(0);
    const [recent] = useState(() => loadRecentPaletteItems());
    const inputRef = useRef<HTMLInputElement>(null);
    const now = new Date();

    const model = buildPaletteModel({
        ...state,
        query,
        stack,
        contextTask,
        recent,
        today: todayLocalIsoDate(),
        nowMinutes: now.getHours() * 60 + now.getMinutes(),
        t,
        language
    });
    const items = model.sections.flatMap((section) => section.items);
    const activeIndex = Math.min(active, Math.max(0, items.length - 1));

    const deps: PaletteDeps = useMemo(() => ({
        openTask: (boardId, taskId) => actions.openPortfolioTaskDetailsForCalendar(boardId, taskId),
        editTask: (boardId, taskId) => actions.editPortfolioTask(boardId, taskId),
        toggleArchive: (boardId, taskId) => actions.togglePortfolioArchiveTask(boardId, taskId),
        selectCard: (boardId, taskId) => actions.setSelectedPortfolioCard(boardId, taskId),
        moveTask: (boardId, taskId, status) => actions.movePortfolioTaskToStatus(boardId, taskId, status),
        toggleAssignee: (boardId, taskId, name) => actions.togglePortfolioTaskAssignee(boardId, taskId, name),
        setPriority: (boardId, taskId, priority) => actions.setPortfolioTaskPriority(boardId, taskId, priority),
        planTask: (boardId, taskId, date, startMinutes) => actions.addPlannerBlock(boardId, taskId, date, startMinutes),
        createTask: (boardId, fields) => actions.createPortfolioTaskFromFields(boardId, fields),
        setBoardSearch: (text) => {
            if (useAppStore.getState().selectedPortfolioViewMode === 'table') setPortfolioViewMode('board');
            setPortfolioFilter('search', text);
        },
        setViewMode: (mode) => setPortfolioViewMode(mode),
        selectBoard: (boardId) => selectPortfolioBoard(boardId),
        resetFilters: () => {
            if (useAppStore.getState().selectedPortfolioViewMode === 'table') setPortfolioViewMode('board');
            resetPortfolioFilters();
        },
        openFilters: () => {
            if (useAppStore.getState().selectedPortfolioViewMode === 'table') setPortfolioViewMode('board');
            requestOpenFilters();
        },
        toggleTheme: () => toggleThemePreference(),
        toggleLanguage,
        openShortcuts: () => openDialog('shortcuts'),
        openHelp: () => openDialog('help'),
        openPaletteHelp: () => openDialog('help', { tab: 'palette' }),
        newProject: () => createNewProject(),
        importProjects: () => importPortfolioProjects(),
        taskInfo: (boardId, taskId) => {
            const row = useAppStore.getState().portfolioTasks.find((entry) => entry.boardId === boardId && Number(entry.taskId) === taskId);
            return row ? { title: row.task.title, status: row.task.status } : null;
        },
        showUndo: (message, undo) => actions.showUndo(message, undo),
        t
    }), [actions, t, toggleLanguage]);

    const changeQuery = (value: string) => {
        setQuery(value);
        setActive(0);
    };

    const drill = (item: PaletteItem | undefined) => {
        if (!item?.drill) return false;
        setStack((current) => [...current, item.drill!]);
        changeQuery('');
        return true;
    };

    const run = (item: PaletteItem | undefined) => {
        if (!item) return;
        const { action } = item;
        if (action.type === 'push') {
            setStack((current) => {
                const frames = sameFrame(current[current.length - 1], action.frames[0]) ? action.frames.slice(1) : action.frames;
                return [...current, ...frames];
            });
            changeQuery('');
            inputRef.current?.focus();
            return;
        }
        if (action.type === 'setQuery') {
            changeQuery(action.query);
            inputRef.current?.focus();
            return;
        }
        if (item.recentKey) rememberPaletteItem(item.recentKey);
        closeDialog('commandPalette');
        void runPaletteAction(action, deps);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        const input = event.currentTarget;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!items.length) return;
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((activeIndex + step + items.length) % items.length);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            run(items[activeIndex]);
        } else if (event.key === 'Tab' || (event.key === 'ArrowRight' && input.selectionStart === input.value.length)) {
            if (drill(items[activeIndex])) event.preventDefault();
        } else if (event.key === 'Backspace' && !input.value && stack.length) {
            event.preventDefault();
            setStack((current) => current.slice(0, -1));
            setActive(0);
        }
    };

    let itemIndex = -1;
    const activeId = items.length ? `palette-item-${activeIndex}` : undefined;
    return (
        <>
            {model.breadcrumbs.length > 0 && (
                <div className="palette-crumbs">
                    {model.breadcrumbs.map((crumb, index) => <span className="palette-crumb" key={index}>{crumb}</span>)}
                </div>
            )}
            <div className="palette-input-row">
                <svg className="palette-input-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <circle cx="7" cy="7" r="4.5" />
                    <path d="M10.5 10.5 14 14" />
                </svg>
                <input
                    ref={inputRef}
                    id="commandPaletteInput"
                    className="palette-input"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="commandPaletteResults"
                    aria-activedescendant={activeId}
                    aria-autocomplete="list"
                    aria-label={t('palette.title')}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('palette.placeholder')}
                    value={query}
                    onChange={(event) => changeQuery(event.target.value)}
                    onKeyDown={onKeyDown}
                />
            </div>
            <div className="palette-results" id="commandPaletteResults" role="listbox" aria-label={t('palette.title')}>
                {model.preview && (
                    <div className="palette-preview" aria-live="polite">
                        <div className="palette-preview-title">{model.preview.title || <span className="palette-muted">{t('palette.previewEmpty')}</span>}</div>
                        <div className="palette-preview-fields">
                            {model.preview.projectTitle && <span className="palette-chip strong">{t('palette.inProject', { project: model.preview.projectTitle })}</span>}
                            <span className="palette-chip">{t('board.toDo')}</span>
                            {model.preview.assignees.map((name) => <span className="palette-chip strong" key={name}>@{name}</span>)}
                            {model.preview.priority && <span className="palette-chip strong">!{t(`toolbar.${model.preview.priority}`)}</span>}
                            {model.preview.effort && <span className="palette-chip strong">~{model.preview.effort}</span>}
                            {model.preview.tags.map((tag) => <span className="palette-chip strong" key={tag}>#{tag}</span>)}
                            {model.preview.dueDate && <span className="palette-chip strong">{t('palette.dueOn', { date: formatPlannerDateLabel(language, model.preview.dueDate, 'medium') })}</span>}
                            {model.preview.warnings.map((warning) => (
                                <span className="palette-chip warn" key={`${warning.kind}:${warning.value}`}>
                                    {t(warning.kind === 'newPerson' ? 'palette.warnNewPerson' : warning.kind === 'unknownProject' ? 'palette.warnProject' : 'palette.warnDate', { value: warning.value })}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                {model.sections.map((section) => section.items.length > 0 && (
                    <Fragment key={section.id}>
                        <div className="palette-section" role="presentation">{section.title}</div>
                        {section.items.map((item) => {
                            itemIndex += 1;
                            const index = itemIndex;
                            return (
                                <div
                                    key={item.key}
                                    id={`palette-item-${index}`}
                                    className={`palette-item${index === activeIndex ? ' active' : ''}`}
                                    role="option"
                                    aria-selected={index === activeIndex}
                                    data-palette-key={item.key}
                                    onMouseMove={() => { if (index !== activeIndex) setActive(index); }}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => run(item)}
                                >
                                    <ItemIcon item={item} />
                                    <span className="palette-item-label">
                                        <Highlighted text={item.label} ranges={item.ranges} />
                                        {item.detail && <span className="palette-item-detail">{item.detail}</span>}
                                    </span>
                                    {item.hint && (
                                        <span className="palette-item-hint">
                                            {item.hint.map((key) => <kbd key={key}>{key}</kbd>)}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </Fragment>
                ))}
            </div>
            <div className="palette-footer">
                <span><kbd>↑</kbd><kbd>↓</kbd> {t('palette.hintMove')}</span>
                <span><kbd>Enter</kbd> {t('palette.hintRun')}</span>
                <span><kbd>Tab</kbd> {t('palette.hintActions')}</span>
                <span><kbd>⌫</kbd> {t('palette.hintBack')}</span>
                <span><kbd>Esc</kbd> {t('palette.hintClose')}</span>
                <span className="palette-footer-tip">{t('palette.hintCreate')}</span>
            </div>
        </>
    );
}

export function CommandPalette() {
    const open = useAppStore((s) => s.activeDialog === 'commandPalette');
    const props = useAppStore((s) => (s.activeDialog === 'commandPalette' ? s.dialogProps as CommandPaletteProps | null : null));
    // Radix focuses the first focusable element: the search input.
    const returnFocus = useReturnFocus();
    const { t } = useI18n();
    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeDialog('commandPalette'); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="palette-overlay" id="commandPaletteOverlay">
                    <Dialog.Content className="palette" id="commandPalette" aria-describedby={undefined} {...returnFocus}>
                        <Dialog.Title className="sr-only">{t('palette.title')}</Dialog.Title>
                        {open && <PaletteBody contextTask={props?.contextTask || null} initialQuery={props?.initialQuery || ''} />}
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
