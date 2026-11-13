// Conversion, saves and watcher reconciliation share the same project identity lock.
const pending = new Map<string, Promise<unknown>>();

export async function withProjectIdentityLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(`teamos:project:${id}`, operation);
    const previous = pending.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    pending.set(id, next);
    try { return await next; }
    finally { if (pending.get(id) === next) pending.delete(id); }
}

/** Run only when nobody holds the lock, including this caller: never waits and never deadlocks. */
export async function tryWithProjectIdentityLock<T>(id: string, operation: () => Promise<T>): Promise<T | undefined> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request(`teamos:project:${id}`, { ifAvailable: true }, async (lock) => (lock ? operation() : undefined));
    }
    if (pending.has(id)) return undefined;
    return withProjectIdentityLock(id, operation);
}

/** Held for a whole cross-project transfer of one workitem, in every tab of this
 * browser. Separate from the project lock, which the transfer's saves take. */
export function tryWithTransferLock<T>(permanentId: string, operation: () => Promise<T>): Promise<T | undefined> {
    return tryWithProjectIdentityLock(`transfer:${permanentId}`, operation);
}
