// Dialog actions shared by React components and browser integrations. Plain
// module functions -- never exposed on window.

import { flushSync } from 'react-dom';
import type { DialogName, DialogPropsByName } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';

// Opens `name` with an optional view model. Re-opening the dialog that is
// already open replaces its props; the Radix root stays mounted.
export function openDialog<N extends DialogName>(name: N, props: DialogPropsByName[N] | null = null): void {
    useAppStore.setState({ activeDialog: name, dialogProps: props });
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
        useAppStore.setState({ activeDialog: null, dialogProps: null });
    });
}

// Closes the task detail and task editor when they belong to `boardId`, e.g.
// because the project was removed or reloaded from disk.
export function closePortfolioContextsForProject(boardId: string): void {
    if (!boardId) return;
    const state = useAppStore.getState();
    const matchesDetail = state.portfolioDetailContext?.boardId === boardId;
    const matchesEditor = state.portfolioEditContext?.boardId === boardId
        || state.portfolioCreateContext?.boardId === boardId;
    if (!matchesDetail && !matchesEditor) return;

    useAppStore.setState({
        ...(matchesDetail ? { portfolioDetailContext: null } : {}),
        ...(matchesEditor ? { portfolioEditContext: null, portfolioCreateContext: null } : {})
    });

    if (matchesDetail) closeDialog('taskDetail');
    if (matchesEditor) closeDialog('taskEditor');
}
