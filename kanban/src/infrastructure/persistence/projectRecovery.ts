import type { BoardData } from '@/domain/types';

export type ProjectRecovery = { id: string; projectId: string; fileName: string; at: string; base: BoardData; baseHash: string; local: BoardData };
const owner = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
    database ||= new Promise((resolve, reject) => {
        const request = indexedDB.open('teamos-project-recovery', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { database = undefined; reject(request.error); };
    });
    return database;
}
// Transactions are queued in call order; an older autosave can never clear a
// newer local draft. Every browser tab owns a separate recovery entry.
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
    if (typeof indexedDB === 'undefined') return undefined;
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('drafts', mode);
        const request = run(tx.objectStore('drafts'));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Recovery transaction aborted.'));
    });
}
export function recoveryId(projectId: string): string { return `${projectId}:${owner}`; }
export async function saveProjectRecovery(draft: Omit<ProjectRecovery, 'id' | 'at'>): Promise<void> {
    await transaction('readwrite', (store) => store.put({ ...draft, id: recoveryId(draft.projectId), at: new Date().toISOString() }));
}
export async function removeProjectRecovery(id: string): Promise<void> {
    await transaction('readwrite', (store) => store.delete(id));
}
export async function listProjectRecovery(projectId: string): Promise<ProjectRecovery[]> {
    const entries = await transaction('readonly', (store) => store.getAll());
    return (entries || []).filter((entry: ProjectRecovery) => entry.projectId === projectId && entry.id !== recoveryId(projectId));
}
