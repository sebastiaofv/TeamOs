import { useSyncExternalStore } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';

const selected = new Map<string, string>();
const listeners = new Set<() => void>();
let revision = 0;
export function selectProjectMember(boardId: string, memberId: string) {
    if (projectActor(boardId)) return;
    selected.set(boardId, memberId);
    revision++;
    listeners.forEach((listener) => listener());
}
export function projectActor(boardId: string) {
    const id = selected.get(boardId);
    if (id === '@reader') return { id, name: 'Reader' };
    return useAppStore.getState().portfolioBoards.find((board) => board.id === boardId)?.data.extensions.project?.members.find((member) => member.id === id);
}
export function useProjectIdentityRevision() {
    return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => revision, () => 0);
}
