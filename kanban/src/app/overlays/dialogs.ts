// Dialog actions shared by React components and browser integrations. Plain
// module functions -- never exposed on window.

import { flushSync } from 'react-dom';
import type { DialogName, DialogPropsByName } from '@/features/portfolio/types';
import { useAppStore, type AppState } from '@/features/portfolio/state/store';

// The store context each dialog owns. A context never outlives its dialog:
// closing the dialog, or replacing it with another one, clears it here.
const DIALOG_CONTEXT = {
    taskDetail: 'portfolioDetailContext',
    taskEditor: 'taskEditorContext',
    roadmapEntity: 'roadmapEntityContext'
} as const satisfies Partial<Record<DialogName, keyof AppState>>;

function releasedContext(name: DialogName | null, next: DialogName | null): Partial<AppState> {
    if (!name || name === next || !(name in DIALOG_CONTEXT)) return {};
    return { [DIALOG_CONTEXT[name as keyof typeof DIALOG_CONTEXT]]: null };
}

// Opens `name` with an optional view model. Re-opening the dialog that is
// already open replaces its props; the Radix root stays mounted.
export function openDialog<N extends DialogName>(name: N, props: DialogPropsByName[N] | null = null): void {
    const { activeDialog } = useAppStore.getState();
    useAppStore.setState({ ...releasedContext(activeDialog, name), activeDialog: name, dialogProps: props });
}

// Closes the open dialog, or only `name` when given. Commits synchronously:
// browser integrations often move focus right after closing a dialog (e.g. into
// the task editor), and Radix's focus trap must already be unmounted by then.
// Never call this during a React render or lifecycle method.
export function closeDialog(name?: DialogName): void {
    const { activeDialog } = useAppStore.getState();
    if (activeDialog === null) return;
    if (name !== undefined && activeDialog !== name) return;
    flushSync(() => {
        useAppStore.setState({ ...releasedContext(activeDialog, null), activeDialog: null, dialogProps: null });
    });
}

// Closes the task detail and task editor when they belong to `boardId`, e.g.
// because the project was removed or reloaded from disk.
export function closePortfolioContextsForProject(boardId: string): void {
    if (!boardId) return;
    const state = useAppStore.getState();
    if (state.activeDialog === 'projectControl' && (state.dialogProps as DialogPropsByName['projectControl'])?.boardId === boardId) closeDialog('projectControl');
    if (state.activeDialog === 'projectSettings' && (state.dialogProps as DialogPropsByName['projectSettings'])?.boardId === boardId) closeDialog('projectSettings');
    const matchesDetail = state.portfolioDetailContext?.boardId === boardId;
    const matchesEditor = state.taskEditorContext?.boardId === boardId;
    if (!matchesDetail && !matchesEditor) return;

    useAppStore.setState({
        ...(matchesDetail ? { portfolioDetailContext: null } : {}),
        ...(matchesEditor ? { taskEditorContext: null } : {})
    });

    if (matchesDetail) closeDialog('taskDetail');
    if (matchesEditor) closeDialog('taskEditor');
}
