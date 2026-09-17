export function areSerializableValuesEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneSerializable<T>(value: T): T {
    if (value === undefined) return undefined as T;
    return JSON.parse(JSON.stringify(value));
}
