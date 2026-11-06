import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { gotoApp, seedPortfolioBoards } from './portfolio';

const fixture = JSON.parse(readFileSync('test-board/us-20.board.json', 'utf8'));
export const controlKinds = ['risks', 'decisions', 'deliverables'] as const;
export const controlLabels = { risks: 'Risks', decisions: 'Decisions', deliverables: 'Deliverables' };
export const controlTitles = { risks: 'Supplier availability', decisions: 'Choose supported runtime', deliverables: 'Release package' };
export const controlCodes = { risks: 'RK', decisions: 'DC', deliverables: 'DL' };
export async function seedControlProject(page: Page, writable = true, many = false) {
    await page.clock.setFixedTime('2026-10-31T12:00:00Z');
    await gotoApp(page);
    const extensions = structuredClone(fixture.extensions);
    if (many) {
        extensions.projectControl.records = controlKinds.flatMap((kind, index) => Array.from({ length: 60 }, (_, item) => ({
            ...extensions.projectControl.records.find((record: { kind: string }) => record.kind === kind),
            id: `ATL-${controlCodes[kind]}-${index * 60 + item + 1}`, title: `${kind} record ${String(item + 1).padStart(2, '0')}`,
            owner: item < 30 ? 'Ana Silva' : 'Rui Costa', assignees: [item < 30 ? 'Ana Silva' : 'Rui Costa']
        })));
        extensions.projectControl.lastNumber = 180;
    }
    await seedPortfolioBoards(page, [{ id: 'control', title: 'Atlas control', hasHandle: writable, tasks: fixture.board.tasks, extensions }], { selectedBoardId: 'control' });
    await page.locator('[data-view-mode=control]').click();
}
