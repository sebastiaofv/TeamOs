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
