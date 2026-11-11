// Rebuild the writable manual fixtures with the production folder serializer.
import { createServer } from 'vite';
import { URL } from 'node:url';
import { File, Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
    const { serializeBoardDataFromObject } = await server.ssrLoadModule('/src/domain/serialize.ts');
    const { ensureBoardTimelineBaseline, appendTimelineEvent } = await server.ssrLoadModule('/src/domain/timeline.ts');
    const { buildComment } = await server.ssrLoadModule('/src/domain/comments.ts');
    const { createProjectDirectory } = await server.ssrLoadModule('/src/infrastructure/persistence/projectDirectory.ts');
    const root = new URL('./', import.meta.url).pathname;
    const file = (path) => ({ name: path.split('/').at(-1), getFile: async () => new File([await readFile(path)], path.split('/').at(-1)), createWritable: async () => ({ write: async (value) => writeFile(path, typeof value === 'string' ? value : Buffer.from(value)), close: async () => {} }) });
    const directory = (path) => ({
        kind: 'directory', name: path.split('/').at(-1),
        async *entries() { for (const entry of await readdir(path, { withFileTypes: true })) yield [entry.name, { kind: entry.isDirectory() ? 'directory' : 'file', name: entry.name }]; },
        async getDirectoryHandle(name, { create = false } = {}) { const next = join(path, name); if (create) await mkdir(next, { recursive: true }); if (!(await stat(next)).isDirectory()) throw new Error(name); return directory(next); },
        async getFileHandle(name, { create = false } = {}) {
            const next = join(path, name);
            try { if (!(await stat(next)).isFile()) throw new Error(name); }
            catch (error) { if (!create) throw new globalThis.DOMException(error.message, 'NotFoundError'); await writeFile(next, ''); }
            return file(next);
        }
    });
    await mkdir(join(root, 'projects'), { recursive: true });
    const alpha = serializeBoardDataFromObject(JSON.parse(await readFile('test-board/us-23.board.json', 'utf8')));
    alpha.board.settings.title = 'US-25 Alpha — attachments and comments';
    alpha.extensions.project.id = 'us25-alpha'; alpha.extensions.project.acronym = 'ALFA'; alpha.extensions.project.members = [{ id: 'tester', name: 'Tester' }];
    ensureBoardTimelineBaseline(alpha);
    const task = alpha.board.tasks[0];
    const comment = buildComment(alpha, task.id, { id: 'us25-comment', author: 'Tester', text: 'This image lives in attachments/ and must survive reopening and migration.', images: [task.attachments[0]] }, { writable: true, historical: false });
    alpha.extensions.conversations = { version: 1, entries: [comment] };
    appendTimelineEvent(alpha, { id: comment.eventId, at: comment.at, kind: 'task.comment.published', entityType: 'task', entityId: String(task.id), summary: 'Fixture image comment', meta: { commentId: comment.id, workitemKey: comment.workitemKey } });
    const beta = serializeBoardDataFromObject(JSON.parse(await readFile('test-board/us-20.board.json', 'utf8')));
    beta.board.settings.title = 'US-25 Beta — large history and Project Control';
    beta.extensions.project.id = 'us25-beta'; beta.extensions.project.acronym = 'BETA';
    ensureBoardTimelineBaseline(beta);
    for (let index = 0; index < 10000; index++) appendTimelineEvent(beta, { id: `us25-large-${index}`, at: '2026-11-06T09:00:00.000Z', kind: 'board.settings.updated', entityType: 'board', entityId: 'board', summary: `Historical event ${index + 1}`, changes: { title: { before: beta.board.settings.title, after: beta.board.settings.title } } });
    // Delete generated project folders before rerunning; the production writer
    // deliberately refuses to overwrite an existing project.
    await createProjectDirectory(directory(join(root, 'projects')), 'alpha', alpha);
    await createProjectDirectory(directory(join(root, 'projects')), 'beta', beta);
    await mkdir(join(root, 'migration'), { recursive: true });
    await writeFile(join(root, 'migration', 'legacy.board.json'), JSON.stringify(alpha, null, 2));
    const alphaText = await readFile(join(root, 'projects', 'alpha', 'project.json'), 'utf8');
    for (const name of ['missing-history', 'wrong-attachments-type', 'corrupt-history', 'missing-binary']) {
        const target = join(root, 'invalid-projects', name); await mkdir(target, { recursive: true });
        const projectId = `us25-${name}`;
        const invalidCurrent = JSON.parse(alphaText.replaceAll('us25-alpha', projectId));
        invalidCurrent.project.title = `US-25 ${name}`;
        invalidCurrent.project.acronym = { 'missing-history': 'MISS', 'wrong-attachments-type': 'WRNG', 'corrupt-history': 'CORR', 'missing-binary': 'BINA' }[name];
        await writeFile(join(target, 'project.json'), JSON.stringify(invalidCurrent, null, 2));
        if (name !== 'missing-history') await writeFile(join(target, 'history.json'), name === 'corrupt-history' ? '{bad JSON' : (await readFile(join(root, 'projects', 'alpha', 'history.json'), 'utf8')).replaceAll('us25-alpha', projectId));
        if (name === 'wrong-attachments-type') await writeFile(join(target, 'attachments'), 'This should be a directory.');
        else { await mkdir(join(target, 'attachments'), { recursive: true }); await writeFile(join(target, 'attachments', '.gitkeep'), ''); }
    }
    const valid = JSON.parse(alphaText);
    valid.project.title = 'US-25 Valid sibling'; valid.workitems = []; valid.relations = { edges: [], external: {} };
    valid.project.id = 'us25-valid'; valid.project.acronym = 'GOOD';
    valid.comments = [];
    valid.system.storage = { baselineEventId: '' };
    const validRoot = join(root, 'invalid-projects', 'valid');
    await mkdir(join(validRoot, 'attachments'), { recursive: true });
    await writeFile(join(validRoot, 'project.json'), JSON.stringify(valid, null, 2));
    await writeFile(join(validRoot, 'history.json'), '{"schemaVersion":1,"projectId":"us25-valid","baselineEventId":"",\n"events":[\n],\n"recordHistory":{"control":{},"transfers":{}},\n"transactions":[\n]}\n');
    await writeFile(join(validRoot, 'attachments', '.gitkeep'), '');
    await mkdir(join(root, 'projects', 'notes'), { recursive: true });
    await writeFile(join(root, 'projects', 'notes', 'README.md'), 'This folder has no project.json and must be ignored.\n');
    await writeFile(join(root, 'projects', 'beta', 'attachments', '.gitkeep'), '');
} finally { await server.close(); }
