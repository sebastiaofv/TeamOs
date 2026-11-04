// Switching between the workspace and the in-app documentation. Plain module
// functions, so the header, keyboard shortcuts and the command palette share
// one behaviour. Only the main area changes: the workspace stays mounted, so
// open projects, selection, view, filters and drafts are untouched.

import { useAppStore } from '@/features/portfolio/state/store';
import { closeDialog } from '@/app/overlays/dialogs';
import { DEFAULT_DOCS_TOPIC, VIEW_DOCS_TOPIC, isDocsTopic } from './docsModel';

export const DOCS_HEADING_ID = 'docsTopicTitle';
export const DOCS_TOGGLE_ID = 'docsToggleBtn';

export function isDocsOpen(): boolean {
    return useAppStore.getState().appMode === 'docs';
}

// Opens the documentation at `topicId`, or at the last topic read.
export function openDocs(topicId?: string): void {
    const state = useAppStore.getState();
    const nextTopic = topicId && isDocsTopic(topicId) ? topicId : state.docsTopicId || DEFAULT_DOCS_TOPIC;
    if (state.activeDialog) closeDialog();
    useAppStore.setState({ appMode: 'docs', docsTopicId: nextTopic });
}

// The documentation topic about the view the workspace currently shows.
export function openDocsForCurrentView(): void {
    const state = useAppStore.getState();
    openDocs(state.portfolioBoards.length ? VIEW_DOCS_TOPIC[state.selectedPortfolioViewMode] : 'start-first-project');
}

export function closeDocs(): void {
    if (!isDocsOpen()) return;
    useAppStore.setState({ appMode: 'workspace' });
}

export function selectDocsTopic(topicId: string): void {
    if (!isDocsTopic(topicId)) return;
    useAppStore.setState({ docsTopicId: topicId });
}

// The header button and the H shortcut. With `moveFocus`, focus follows into
// the newly shown area (the button itself keeps focus when it was clicked).
export function toggleDocs({ moveFocus = false }: { moveFocus?: boolean } = {}): void {
    if (isDocsOpen()) closeDocs();
    else openDocs();
    if (!moveFocus) return;
    requestAnimationFrame(() => {
        const target = isDocsOpen() ? document.getElementById(DOCS_HEADING_ID) : document.getElementById('portfolioMain');
        target?.focus({ preventScroll: true });
    });
}
