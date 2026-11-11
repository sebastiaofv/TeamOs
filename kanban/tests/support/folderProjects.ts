import type { Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BoardFileHandle, ProjectDirectoryHandle } from '../../src/infrastructure/browser/types';

type FolderDisk = { files: Record<string, number[]>; directories: string[]; reads: Record<string, number>; fullReads: Record<string, number>; writes: Record<string, number>; selection: string };
declare global { interface Window { __folderDisk: FolderDisk } }
export function fixtureTree(root: string): { files: Record<string, number[]>; directories: string[] } {
    const files: Record<string, number[]> = {}; const directories = [''];
    function walk(path: string, relative: string) {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
            const next = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isDirectory()) { directories.push(next); walk(join(path, entry.name), next); }
            else files[next] = [...readFileSync(join(path, entry.name))];
        }
    }
    walk(root, ''); return { files, directories };
}
export async function mockFolderPicker(page: Page, tree: ReturnType<typeof fixtureTree> = { files: {}, directories: [''] }, selection = '') {
    await page.evaluate(({ tree, selection }) => {
        const disk: FolderDisk = { ...tree, reads: {}, fullReads: {}, writes: {}, selection };
        window.__folderDisk = disk;
        const handles = new Map<string, BoardFileHandle>();
        function file(path: string): BoardFileHandle {
            const existing = handles.get(path); if (existing) return existing;
            const handle: BoardFileHandle = {
                name: path.split('/').at(-1)!,
                async isSameEntry(other) { return other === handle; },
                async getFile() {
                    if (!disk.files[path]) throw new DOMException(`${path}: missing file`, 'NotFoundError');
                    disk.reads[path] = (disk.reads[path] || 0) + 1;
                    const snapshot = new File([new Uint8Array(disk.files[path])], handle.name, { lastModified: disk.writes[path] || 0 });
                    const text = snapshot.text.bind(snapshot);
                    snapshot.text = () => { disk.fullReads[path] = (disk.fullReads[path] || 0) + 1; return text(); };
                    return snapshot;
                },
                async createWritable(options = {}) {
                    let bytes = options.keepExistingData ? new Uint8Array(disk.files[path]) : new Uint8Array();
                    let position = 0;
                    return { async write(value) { const incoming = typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : new Uint8Array(value); const next = new Uint8Array(Math.max(bytes.length, position + incoming.length)); next.set(bytes); next.set(incoming, position); bytes = next; position += incoming.length; }, async seek(next) { position = next; }, async truncate(size) { bytes = bytes.slice(0, size); }, async close() { disk.files[path] = [...bytes]; disk.writes[path] = (disk.writes[path] || 0) + 1; } };
                }
            };
            handles.set(path, handle); return handle;
        }
        function directory(path: string): ProjectDirectoryHandle {
            const childPath = (name: string) => path ? `${path}/${name}` : name;
            return {
                kind: 'directory', name: path.split('/').at(-1) || 'projects',
                async requestPermission() { return 'granted'; },
                async *entries() {
                    for (const child of [...disk.directories.filter((entry) => entry !== path), ...Object.keys(disk.files)]) {
                        const relative = path ? child.startsWith(`${path}/`) ? child.slice(path.length + 1) : '' : child;
                        if (relative && !relative.includes('/')) yield [relative, { name: relative, kind: disk.directories.includes(child) ? 'directory' : 'file' }];
                    }
                },
                async getFileHandle(name, options = {}) {
                    const next = childPath(name);
                    if (disk.directories.includes(next)) throw new DOMException(`${name}: expected file`, 'TypeMismatchError');
                    if (!Object.hasOwn(disk.files, next)) {
                        if (!options.create) throw new DOMException(`${name}: missing file`, 'NotFoundError');
                        disk.files[next] = [];
                    }
                    return file(next);
                },
                async getDirectoryHandle(name, options = {}) {
                    const next = childPath(name);
                    if (Object.hasOwn(disk.files, next)) throw new DOMException(`${name}: expected directory`, 'TypeMismatchError');
                    if (!disk.directories.includes(next)) {
                        if (!options.create) throw new DOMException(`${name}: missing directory`, 'NotFoundError');
                        disk.directories.push(next);
                    }
                    return directory(next);
                }
            };
        }
        window.showDirectoryPicker = async () => directory(disk.selection);
    }, { tree, selection });
}
export async function readFolderJson(page: Page, path: string) {
    return page.evaluate((path) => JSON.parse(new TextDecoder().decode(new Uint8Array(window.__folderDisk.files[path]))), path);
}
