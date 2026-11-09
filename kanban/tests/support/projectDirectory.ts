import type { BoardFileHandle, BoardWritable, ProjectDirectoryHandle } from '../../src/infrastructure/browser/types';

export class MemoryFile implements BoardFileHandle {
    readonly kind = 'file';
    bytes = new Uint8Array();
    reads = 0;
    fullReads = 0;
    writes = 0;
    failWrites = false;
    attempts = 0;
    failOnAttempt = 0;
    constructor(public name: string, text = '') { this.setText(text); }
    setText(text: string) { this.bytes = new TextEncoder().encode(text); }
    text() { return new TextDecoder().decode(this.bytes); }
    async getFile() {
        this.reads++;
        const bytes = new Uint8Array(this.bytes);
        const file = new File([bytes], this.name, { lastModified: this.writes });
        const read = file.text.bind(file);
        file.text = () => { this.fullReads++; return read(); };
        return file;
    }
    async createWritable(options: { keepExistingData?: boolean } = {}): Promise<BoardWritable> {
        this.attempts++;
        if (this.failWrites || this.attempts === this.failOnAttempt) throw new Error(`${this.name}: write denied`);
        let bytes = options.keepExistingData ? new Uint8Array(this.bytes) : new Uint8Array();
        let position = 0;
        return {
            write: async (value) => { const incoming = typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : new Uint8Array(value); const next = new Uint8Array(Math.max(bytes.length, position + incoming.length)); next.set(bytes); next.set(incoming, position); bytes = next; position += incoming.length; },
            seek: async (next) => { position = next; },
            truncate: async (size) => { bytes = bytes.slice(0, size); },
            close: async () => { this.bytes = bytes; this.writes++; }
        };
    }
    async isSameEntry(other: unknown) { return this === other; }
}
export class MemoryDirectory implements ProjectDirectoryHandle {
    readonly kind = 'directory';
    children = new Map<string, MemoryDirectory | MemoryFile>();
    permission: PermissionState = 'granted';
    constructor(public name: string) {}
    async requestPermission() { return this.permission; }
    async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryFile> {
        const existing = this.children.get(name);
        if (existing instanceof MemoryFile) return existing;
        if (existing) throw new DOMException(`${name}: expected file`, 'TypeMismatchError');
        if (!options.create) throw new DOMException(`${name}: missing file`, 'NotFoundError');
        const file = new MemoryFile(name); this.children.set(name, file); return file;
    }
    async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryDirectory> {
        const existing = this.children.get(name);
        if (existing instanceof MemoryDirectory) return existing;
        if (existing) throw new DOMException(`${name}: expected directory`, 'TypeMismatchError');
        if (!options.create) throw new DOMException(`${name}: missing directory`, 'NotFoundError');
        const directory = new MemoryDirectory(name); this.children.set(name, directory); return directory;
    }
    async *entries(): AsyncIterableIterator<[string, MemoryDirectory | MemoryFile]> { yield* this.children; }
}
