// The browser file surface used by persistence adapters and test doubles.

export type BoardFile = { name: string; size?: number; lastModified?: number; text(): Promise<string>; arrayBuffer?(): Promise<ArrayBuffer>; slice?(start?: number, end?: number): Blob };
export type BoardWritable = { write(data: string | Blob | Uint8Array<ArrayBuffer>): Promise<void>; close(): Promise<void>; seek?(position: number): Promise<void>; truncate?(size: number): Promise<void> };
export type BoardFileHandle = {
    name: string;
    getFile(): Promise<BoardFile>;
    createWritable(options?: { keepExistingData?: boolean }): Promise<BoardWritable>;
    requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
    isSameEntry?(other: unknown): Promise<boolean>;
};

export type ProjectDirectoryHandle = {
    kind: 'directory';
    name: string;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<BoardFileHandle>;
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<ProjectDirectoryHandle>;
    entries(): AsyncIterableIterator<[string, { kind: 'file' | 'directory'; name: string }]>;
    requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
};
