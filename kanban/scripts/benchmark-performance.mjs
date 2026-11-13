// Reproducible browser timings against the real mutation and history paths.
// All projects and file handles belong to an isolated Chromium test profile.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const configuredRoot = process.argv.indexOf('--root');
const root = configuredRoot >= 0 ? resolve(process.argv[configuredRoot + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
    await server.listen();
    const { port } = server.httpServer.address();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    const results = await page.evaluate(async () => {
        const { createEmptyProjectData } = await import('/src/domain/board.ts');
        const { normalizeTask } = await import('/src/domain/task.ts');
        const { ensureBoardTimelineBaseline } = await import('/src/domain/timeline.ts');
        const { serializeBoardDataFromObject } = await import('/src/domain/serialize.ts');
        const { createAppStore } = await import('/src/features/portfolio/state/store.ts');
        const { createBoardMutationContext } = await import('/src/features/portfolio/commands/mutationContext.ts');
        const { dashboardHistory } = await import('/src/domain/dashboard.ts');
        const fixture = (tasks, events) => {
            const data = createEmptyProjectData('Performance', 'PERF');
            data.board.tasks = Array.from({ length: tasks }, (_, index) => normalizeTask({ id: index + 1, title: `Workitem ${index + 1}`, type: 'task', status: 'backlog', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }));
            ensureBoardTimelineBaseline(data).events.push(...Array.from({ length: events }, (_, index) => ({ id: `e-${index}`, at: '2026-11-09T10:00:00.000Z', kind: 'task.updated', entityType: 'task', entityId: '1', summary: 'Priority changed', changes: { priority: { before: index % 2 ? 'high' : 'low', after: index % 2 ? 'low' : 'high' } } })));
            if (events) data.board.tasks[0].priority = events % 2 ? 'high' : 'low';
            return serializeBoardDataFromObject(data);
        };
        const results = [];
        for (const [tasks, events] of [[1, 0], [1, 10000], [1000, 0], [100, 10000]]) {
            const data = fixture(tasks, events);
            const store = createAppStore({ portfolioBoards: [{ id: 'p', title: 'Performance', colorSeed: 0, handle: {}, fileName: 'project.json', data }], selectedPortfolioBoardId: 'p' });
            const context = createBoardMutationContext({ store, enqueueSave: async () => true, markDirty: () => {}, confirm: async () => true, alert: (message) => { throw new Error(message); } });
            const samples = [];
            for (let index = 0; index < 7; index++) {
                const start = performance.now();
                if (!await context.runPortfolioTaskMutation('p', 1, (task) => { task.priority = index % 2 ? 'low' : 'high'; return true; })) throw new Error('Mutation failed');
                samples.push(performance.now() - start);
            }
            results.push({ scenario: 'priority mutation without disk/rendering', tasks, events, medianMs: samples.sort((a, b) => a - b)[3] });
        }
        for (const events of [100, 500, 1000]) {
            const data = fixture(20, events);
            const samples = [];
            for (let index = 0; index < 3; index++) {
                const start = performance.now();
                const observations = dashboardHistory(data, '', '', '');
                if (observations.length !== events + 1) throw new Error('Historical observations lost');
                samples.push(performance.now() - start);
            }
            results.push({ scenario: 'dashboard history', tasks: 20, events, medianMs: samples.sort((a, b) => a - b)[1] });
        }
        // Overview period activity over a loaded history (issue 104): every event moves one workitem.
        for (const events of [500, 2000]) {
            const data = fixture(400, 0);
            const statuses = ['to-do', 'doing', 'done'];
            ensureBoardTimelineBaseline(data).events.push(...Array.from({ length: events }, (_, index) => {
                const id = index % 400 + 1, step = Math.floor(index / 400);
                return { id: `s-${index}`, at: `2026-11-${String(1 + Math.floor(index * 12 / events)).padStart(2, '0')}T10:00:00.000Z`, kind: 'task.status.changed', entityType: 'task', entityId: String(id), summary: 'Status changed', changes: { status: { before: statuses[step % 3], after: statuses[(step + 1) % 3] } } };
            }));
            const { dashboardPeriodWorkitems } = await import('/src/domain/dashboardOverview.ts');
            const samples = [];
            for (let index = 0; index < 3; index++) {
                const start = performance.now();
                dashboardPeriodWorkitems(data, data, '', '2026-11-05', '2026-11-12');
                samples.push(performance.now() - start);
            }
            results.push({ scenario: 'dashboard period activity', tasks: 400, events, medianMs: samples.sort((a, b) => a - b)[1] });
        }
        return results;
    });
    console.table(results.map((result) => ({ ...result, medianMs: Number(result.medianMs.toFixed(2)) })));
} finally {
    await browser?.close();
    await server.close();
}
