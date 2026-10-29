// A transfer awaits two independent file writes. Ordinary edits must not interleave with them.
const locked = new Set<string>();
export const isProjectTransferLocked = (boardId: string) => locked.has(boardId);
export function lockProjectTransfers(ids: string[]): () => void {
    if (ids.some((id) => locked.has(id))) throw new Error('Transfer already running.');
    ids.forEach((id) => locked.add(id));
    return () => ids.forEach((id) => locked.delete(id));
}
