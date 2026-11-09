// Browser/OPFS persistence measurements. --root can point at an earlier checkout.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const option = process.argv.indexOf('--root');
const root = option < 0 ? resolve(dirname(fileURLToPath(import.meta.url)), '..') : resolve(process.argv[option + 1]);
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    const results = await page.evaluate(async () => {
        const { createEmptyProjectData } = await import('/src/domain/board.ts');
        const { normalizeTask } = await import('/src/domain/task.ts');
        const { ensureBoardTimelineBaseline, appendTimelineEvent, reconstructBoardStateFromTimeline } = await import('/src/domain/timeline.ts');
        const { createBoardStateSnapshot, serializeBoardDataFromObject } = await import('/src/domain/serialize.ts');
        const { newControlRecord, saveControlRecord } = await import('/src/domain/projectControl.ts');
        const { createProjectDirectory, openProjectDirectory, loadDirectoryHistory } = await import('/src/infrastructure/persistence/projectDirectory.ts');
        const { BoardRepository, writeJsonToFileHandle } = await import('/src/infrastructure/persistence/boardRepository.ts');
        const root = await navigator.storage.getDirectory();
        const write = async (directory, name, text) => { const stream = await (await directory.getFileHandle(name, { create: true })).createWritable(); await stream.write(text); await stream.close(); };
        const size = async (directory, name) => (await (await directory.getFileHandle(name)).getFile()).size;
        const sample = async (operation) => { const start = performance.now(); const result = await operation(); return { ms: performance.now() - start, result }; };
        const summarize = (samples) => { const sorted = [...samples].sort((a, b) => a - b); return { medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(2), p95Ms: +sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2) }; };
        const results = [];
        for (const scenario of ['control', 'sprints', 'attachments', 'long-history']) {
            const binaries = [];
            const data = createEmptyProjectData(`Benchmark ${scenario}`, 'BEN');
            data.meta.createdAt = data.meta.updatedAt = '2026-01-01T00:00:00.000Z';
            data.board.tasks = Array.from({ length: 100 }, (_, index) => normalizeTask({ id: index + 1, title: `Workitem ${index + 1}`, type: 'task', status: 'backlog', createdAt: data.meta.createdAt, updatedAt: data.meta.updatedAt }));
            if (scenario === 'control') for (let index = 0; index < 50; index++) saveControlRecord(data, { ...newControlRecord('risks'), title: `Risk ${index}`, description: 'Context '.repeat(30) }, 'Tester');
            ensureBoardTimelineBaseline(data);
            for (let index = 0; index < (scenario === 'long-history' ? 10000 : 100); index++) {
                if (scenario === 'control') {
                    const risk = data.extensions.projectControl.records[index % 50];
                    saveControlRecord(data, { ...risk, description: `Revision ${index} ${'Context '.repeat(30)}` }, 'Tester');
                    appendTimelineEvent(data, { kind: 'board.control.updated', entityType: 'board', entityId: risk.id, summary: 'Risk updated', snapshot: createBoardStateSnapshot(data) });
                } else if (scenario === 'sprints') {
                    const before = data.extensions.sprintParticipation || { version: 1, entries: [] };
                    const task = { ...data.board.tasks[index], sprintId: 's1' };
                    const after = { version: 1, entries: [...before.entries, { sprintId: 's1', task, at: data.meta.createdAt }] };
                    data.extensions.sprintParticipation = after;
                    appendTimelineEvent(data, { kind: 'sprint.participation.updated', entityType: 'board', entityId: 'board', summary: 'Participation', changes: { sprintParticipation: { before, after } } });
                } else {
                    const before = data.board.tasks[0].priority;
                    const after = index % 2 ? 'low' : 'high';
                    data.board.tasks[0].priority = after;
                    appendTimelineEvent(data, { kind: 'task.updated', entityType: 'task', entityId: '1', summary: 'Priority', changes: { priority: { before, after } } });
                }
            }
            if (scenario === 'attachments') {
                const bytes = new Uint8Array(64 * 1024).fill(120);
                const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
                binaries.push([digest, bytes]);
                const source = await createProjectDirectory(root, 'attachment-source', data);
                const directory = await root.getDirectoryHandle('attachment-source');
                const attachments = await directory.getDirectoryHandle('attachments');
                const stream = await (await attachments.getFileHandle(digest, { create: true })).createWritable(); await stream.write(bytes); await stream.close();
                for (let index = 0; index < 20; index++) data.board.tasks[index].attachments = [{ id: `a${index}`, name: 'sample.bin', mime: 'application/octet-stream', kind: 'file', sizeBytes: bytes.length, dataUrl: `teamos-attachment:${encodeURIComponent(data.extensions.project.id)}/${digest}`, createdAt: data.meta.createdAt }];
                // Register the source namespace for externalization to the measured folders.
                const { activateDirectoryProject } = await import('/src/infrastructure/persistence/projectDirectory.ts'); activateDirectoryProject(source);
            }
            const normalized = serializeBoardDataFromObject(data);
            const timeline = normalized.extensions.timeline;
            const current = structuredClone(normalized); delete current.extensions.timeline;
            current.extensions.projectStorage = { version: 1, baselineEventId: timeline.baselineEventId };
            const archives = {};
            for (const record of current.extensions.projectControl?.records || []) { archives[`control:${record.id}`] = { history: record.history }; record.history = []; }
            const legacyProject = JSON.stringify(current);
            const legacyHistory = JSON.stringify({ version: 1, timeline, archives, transactions: [] });
            const samples = { open: [], save: [], conversion: [], historicalJump: [] };
            let projectBytes = 0, historyBytes = 0, logicalSaveBytes = 0, peakObservedHeapBytes = 0;
            for (let iteration = 0; iteration < 8; iteration++) {
                const folderName = `${scenario}-${iteration}`;
                await createProjectDirectory(root, folderName, normalized);
                const directory = await root.getDirectoryHandle(folderName);
                for (const [name, bytes] of binaries) await write(await directory.getDirectoryHandle('attachments'), name, bytes);
                const opened = await sample(async () => BoardRepository.createRecordFromHandle(await openProjectDirectory(directory)));
                const record = opened.result;
                record.data.extensions.timeline = await loadDirectoryHistory(record.handle);
                const jump = await sample(() => reconstructBoardStateFromTimeline(record.data, timeline.events.length - 1));
                if (jump.result.board.tasks.length !== 100) throw new Error('Historical workitems lost');
                const beforeHistoryBytes = await size(directory, 'history.json');
                const before = record.data.board.tasks[0].priority;
                record.data.board.tasks[0].priority = before === 'high' ? 'low' : 'high';
                appendTimelineEvent(record.data, { kind: 'task.updated', entityType: 'task', entityId: '1', summary: 'Priority', changes: { priority: { before, after: record.data.board.tasks[0].priority } } });
                const save = await sample(() => writeJsonToFileHandle(record.handle, record.data));
                const conversionDirectory = await root.getDirectoryHandle(`${folderName}-legacy`, { create: true });
                await conversionDirectory.getDirectoryHandle('attachments', { create: true });
                for (const [name, bytes] of binaries) await write(await conversionDirectory.getDirectoryHandle('attachments'), name, bytes);
                await write(conversionDirectory, 'project.json', legacyProject); await write(conversionDirectory, 'history.json', legacyHistory);
                const conversion = await sample(() => openProjectDirectory(conversionDirectory));
                if (iteration) for (const [name, value] of Object.entries({ open: opened.ms, save: save.ms, conversion: conversion.ms, historicalJump: jump.ms })) samples[name].push(value);
                projectBytes = await size(directory, 'project.json'); historyBytes = await size(directory, 'history.json');
                logicalSaveBytes = projectBytes + historyBytes - beforeHistoryBytes;
                peakObservedHeapBytes = Math.max(peakObservedHeapBytes, performance.memory?.usedJSHeapSize || 0);
                await root.removeEntry(folderName, { recursive: true }); await root.removeEntry(`${folderName}-legacy`, { recursive: true });
            }
            results.push({ scenario, samples: 7, legacyProjectBytes: new Blob([legacyProject]).size, legacyHistoryBytes: new Blob([legacyHistory]).size, projectBytes, historyBytes, logicalSaveBytes, peakObservedHeapMB: +(peakObservedHeapBytes / 1024 / 1024).toFixed(1), ...Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, summarize(values)])) });
        }
        const { applyProjectPatch, diffProjectState } = await import('/src/domain/projectPatch.ts');
        const { toProjectCheckpoint } = await import('/src/domain/projectFormat.ts');
        for (const count of [1000, 5000]) {
            const before = createEmptyProjectData('Bulk', 'BLK');
            before.board.tasks = Array.from({ length: count }, (_, index) => normalizeTask({ id: index + 1, title: `Task ${index}`, status: 'backlog', createdAt: before.meta.createdAt, updatedAt: before.meta.updatedAt }));
            const after = structuredClone(before); after.board.tasks.forEach((task) => { task.priority = 'high'; });
            const ops = diffProjectState(toProjectCheckpoint(before), toProjectCheckpoint(after));
            const samples = [];
            for (let iteration = 0; iteration < 8; iteration++) { const measured = await sample(() => applyProjectPatch(before, ops)); if (measured.result.board.tasks.at(-1).priority !== 'high') throw new Error('Bulk update lost'); if (iteration) samples.push(measured.ms); }
            results.push({ scenario: 'bulk-patch', workitems: count, samples: 7, ...summarize(samples) });
        }
        return results;
    });
    process.stdout.write(`${JSON.stringify({ runtime: 'Chromium OPFS', results }, null, 2)}\n`);
} finally {
    await browser?.close();
    await server.close();
}
