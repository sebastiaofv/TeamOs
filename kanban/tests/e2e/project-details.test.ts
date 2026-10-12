import { expect, test, type Page } from '@playwright/test';
import {
  buildBoardPayload, gotoApp, mutateExternalBoardFile, openTaskEditor, readSavedBoard,
  seedPortfolioBoards, selectPortfolioBoard, setTimelineSlider, triggerExternalFileCheck, waitForBoardWrites
} from '../support/portfolio';

const modal = (page: Page) => page.locator('#projectDetailsModal');
const gear = (page: Page) => page.locator('[data-action="project-details"]');

async function openDetails(page: Page) {
  await gear(page).click();
  await expect(modal(page)).toBeVisible();
}

async function addPerson(page: Page, name: string) {
  await modal(page).getByRole('button', { name: 'Add person', exact: true }).click();
  await modal(page).locator('.project-details-person input').last().fill(name);
}

async function saveDetails(page: Page) {
  await modal(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal(page)).toHaveCount(0);
}

test.describe('US11 project details', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('a legacy project has empty details, and All has no gear', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', title: 'Alpha', hasHandle: true,
      tasks: [{ title: 'Existing task', assignees: ['Legacy owner'] }] }]);
    await expect(gear(page)).toHaveCount(0);
    await selectPortfolioBoard(page, 'Alpha');
    await expect(gear(page)).toHaveAccessibleName('Open project details for Alpha');
    await openDetails(page);
    await expect(page.locator('#projectDetailsName')).toHaveValue('Alpha');
    await expect(page.locator('#projectDetailsDescription')).toHaveValue('');
    await expect(modal(page).locator('.project-details-person input')).toHaveCount(0);
    await expect(modal(page)).toContainText('No people allocated');
    await modal(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(0);
  });

  test('saves all fields, normalizes names, preserves other data and reopens the file', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'alpha', title: 'Alpha', hasHandle: true, fileName: 'original.json',
        tasks: [{ title: 'Existing task', assignees: ['Former owner'] }], extensions: { custom: { keep: true } } },
      { id: 'bravo', title: 'Bravo', hasHandle: true, tasks: [] }
    ], { selectedBoardId: 'alpha' });
    await openDetails(page);
    await page.locator('#projectDetailsName').fill('  Launch  ');
    await page.locator('#projectDetailsDescription').fill('Delivery project\nSecond line');
    for (const person of [' Ana ', 'ana', 'Rui', '   ']) await addPerson(page, person);
    await saveDetails(page);
    await waitForBoardWrites(page);
    await expect(page.locator('.portfolio-chip.active')).toContainText('Launch');
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.board.settings.title).toBe('Launch');
    expect(saved.extensions.projectDetails).toEqual({ version: 1, description: 'Delivery project\nSecond line', team: ['Ana', 'Rui'] });
    expect(saved.extensions.custom).toEqual({ keep: true });
    expect(saved.board.tasks[0].assignees).toEqual(['Former owner']);
    expect((await readSavedBoard(page, 'bravo')).board.settings.title).toBe('Bravo');
    expect(saved.extensions.timeline.events.map((event: { kind: string }) => event.kind)).toEqual(['board.baseline', 'project.details.updated']);
    expect(saved.extensions.timeline.events[1].changes.team).toEqual({ before: [], after: ['Ana', 'Rui'] });

    await page.reload();
    await seedPortfolioBoards(page, [{ id: 'reopened', title: saved.board.settings.title, fileName: 'original.json', hasHandle: true,
      tasks: saved.board.tasks, extensions: saved.extensions }], { selectedBoardId: 'reopened' });
    await openDetails(page);
    await expect(page.locator('#projectDetailsDescription')).toHaveValue('Delivery project\nSecond line');
    await expect(modal(page).locator('.project-details-person input')).toHaveCount(2);
    await expect(modal(page).getByRole('textbox', { name: 'Person 1', exact: true })).toHaveValue('Ana');
    await expect(modal(page).getByRole('textbox', { name: 'Person 2', exact: true })).toHaveValue('Rui');
    await saveDetails(page);
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(0);
  });

  for (const exit of ['Cancel', 'Close', 'Escape']) {
    test(`${exit} discards the draft without saving or tracking an event`, async ({ page }) => {
      await seedPortfolioBoards(page, [{ id: 'alpha', title: 'Alpha', hasHandle: true }], { selectedBoardId: 'alpha' });
      await openDetails(page);
      await page.locator('#projectDetailsName').fill('Discard this');
      await addPerson(page, 'Draft person');
      if (exit === 'Escape') await page.keyboard.press('Escape');
      else await modal(page).getByRole('button', { name: exit, exact: true }).click();
      await expect(modal(page)).toHaveCount(0);
      await openDetails(page);
      await expect(page.locator('#projectDetailsName')).toHaveValue('Alpha');
      await expect(modal(page).locator('.project-details-person input')).toHaveCount(0);
      expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(0);
      expect((await readSavedBoard(page, 'alpha')).extensions.timeline).toBeUndefined();
    });
  }

  test('rejects a blank name and does not save a normalized no-op', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', title: 'Alpha', hasHandle: true }], { selectedBoardId: 'alpha' });
    await openDetails(page);
    await page.locator('#projectDetailsName').fill('   ');
    await modal(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal(page).getByRole('alert')).toContainText('Enter a project name');
    await expect(page.locator('#projectDetailsName')).toBeFocused();
    await page.locator('#projectDetailsName').fill(' Alpha ');
    await addPerson(page, '   ');
    await saveDetails(page);
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(0);
    expect((await readSavedBoard(page, 'alpha')).extensions.timeline).toBeUndefined();
  });

  test('task suggestions use the owning team first and never other projects', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'alpha', title: 'Alpha', hasHandle: true,
        tasks: [{ title: 'Target task' }, { title: 'Local task', assignees: ['Legacy owner', 'ana'] }],
        extensions: { projectDetails: { version: 1, description: '', team: ['Ana', 'Rui'] } } },
      { id: 'bravo', title: 'Bravo', hasHandle: true, tasks: [{ title: 'Foreign task', assignees: ['Foreign owner'] }],
        extensions: { projectDetails: { version: 1, description: '', team: ['Foreign team'] } } }
    ]);
    await openTaskEditor(page, 'Target task');
    expect(await page.locator('#taskAssigneeSuggestions option').evaluateAll((options) => options.map((option) => option.getAttribute('value'))))
      .toEqual(['Ana', 'Rui', 'Legacy owner']);
    await page.locator('#taskAssigneeNewItem').fill('External collaborator');
    await page.locator('#taskAssigneeNewItem').press('Enter');
    await page.locator('#taskModal .btn-primary').click();
    await expect(page.locator('#taskModal')).toHaveCount(0);
    await waitForBoardWrites(page);
    expect((await readSavedBoard(page, 'alpha')).board.tasks[0].assignees).toEqual(['External collaborator']);
  });

  test('removing and correcting team names never reassigns existing tasks', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', title: 'Alpha', hasHandle: true,
      tasks: [{ title: 'Assigned task', assignees: ['Ana', 'Rui'] }],
      extensions: { projectDetails: { version: 1, description: '', team: ['Ana', 'Rui'] } }
    }], { selectedBoardId: 'alpha' });
    await openDetails(page);
    await modal(page).getByRole('textbox', { name: 'Person 1', exact: true }).fill('Ana Silva');
    await modal(page).getByRole('button', { name: 'Remove person 2', exact: true }).click();
    await saveDetails(page);
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.extensions.projectDetails.team).toEqual(['Ana Silva']);
    expect(saved.board.tasks[0].assignees).toEqual(['Ana', 'Rui']);
  });

  test('read-only projects allow consultation but no editing', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'ro', title: 'Read-only', hasHandle: false,
      extensions: { projectDetails: { version: 1, description: 'Reference', team: ['Ana'] } }
    }], { selectedBoardId: 'ro' });
    await openDetails(page);
    await expect(modal(page)).toContainText('read-only');
    await expect(page.locator('#projectDetailsName')).toHaveAttribute('readonly', '');
    await expect(page.locator('#projectDetailsDescription')).toHaveValue('Reference');
    await expect(modal(page).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await expect(modal(page).getByRole('button', { name: 'Add person', exact: true })).toHaveCount(0);
  });

  test('history displays readable diffs and restores the selected project details', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', title: 'Alpha', hasHandle: true }], { selectedBoardId: 'alpha' });
    await openDetails(page);
    await page.locator('#projectDetailsName').fill('Stage One');
    await page.locator('#projectDetailsDescription').fill('First description');
    await addPerson(page, 'Ana');
    await saveDetails(page);
    await openDetails(page);
    await page.locator('#projectDetailsName').fill('Stage Two');
    await page.locator('#projectDetailsDescription').fill('Second description');
    await addPerson(page, 'Rui');
    await saveDetails(page);
    await waitForBoardWrites(page, 2);
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await setTimelineSlider(page, 1);
    await expect(page.locator('.timeline-diff-field')).toHaveText(['Project name', 'Description', 'Team']);
    await expect(page.locator('.timeline-diff-value').last()).toHaveText('• Ana');
    await openDetails(page);
    await expect(page.locator('#projectDetailsName')).toHaveValue('Stage One');
    await expect(page.locator('#projectDetailsDescription')).toHaveValue('First description');
    await expect(modal(page).locator('.project-details-person input')).toHaveCount(1);
    await expect(modal(page).getByRole('textbox', { name: 'Person 1', exact: true })).toHaveValue('Ana');
    await expect(modal(page).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await modal(page).locator('.modal-footer').getByRole('button', { name: 'Close', exact: true }).click();
    await page.locator('[data-action="timeline-restore"]').click();
    await waitForBoardWrites(page, 3);
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.board.settings.title).toBe('Stage One');
    expect(saved.extensions.projectDetails).toEqual({ version: 1, description: 'First description', team: ['Ana'] });
    expect(saved.extensions.timeline.events.at(-1).kind).toBe('board.restored');
    await openDetails(page);
    await expect(modal(page).getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  });

  test('immediate save detects external base data changes before the watcher and retains the draft', async ({ page }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await seedPortfolioBoards(page, [{ id: 'alpha', title: 'Alpha', hasHandle: true }], { selectedBoardId: 'alpha' });
    await openDetails(page);
    await page.locator('#projectDetailsName').fill('Local draft');
    await mutateExternalBoardFile(page, { boardId: 'alpha', payload: buildBoardPayload({ title: 'External name' }) });
    await expect(modal(page)).toBeVisible();
    await expect(page.locator('#projectDetailsName')).toHaveValue('Local draft');
    await modal(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal(page).getByRole('alert')).toContainText('changed while you were editing');
    await expect(page.locator('#projectDetailsName')).toHaveValue('Local draft');
    expect((await readSavedBoard(page, 'alpha')).board.settings.title).toBe('External name');
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(0);
    await modal(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await openDetails(page);
    await expect(page.locator('#projectDetailsName')).toHaveValue('External name');
  });

  test('immediate save preserves external task changes before the watcher', async ({ page }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await seedPortfolioBoards(page, [{ id: 'alpha', title: 'Alpha', hasHandle: true,
      tasks: [{ title: 'Original task' }] }], { selectedBoardId: 'alpha' });
    await openDetails(page);
    await page.locator('#projectDetailsDescription').fill('Local description');
    await mutateExternalBoardFile(page, { boardId: 'alpha', payload: buildBoardPayload({ title: 'Alpha',
      tasks: [{ title: 'Updated externally', status: 'done', assignees: ['New owner'] }],
      extensions: { dayPlanner: { version: 1, blocks: [{ id: 'external-plan', taskId: 1,
        date: '2026-10-12', start: '09:00', end: '10:00' }] } } }) });
    await expect(modal(page)).toBeVisible();
    await saveDetails(page);
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.extensions.projectDetails.description).toBe('Local description');
    expect(saved.board.tasks[0]).toMatchObject({ title: 'Updated externally', status: 'done', assignees: ['New owner'] });
    expect(saved.extensions.dayPlanner.blocks).toEqual([{ id: 'external-plan', taskId: 1,
      date: '2026-10-12', start: '09:00', end: '10:00' }]);
  });

  for (const route of ['watcher', 'preflight']) {
    for (const selection of ['automatically pinned', 'explicit latest']) {
      test(`${route} keeps ${selection} editable after external task history appends`, async ({ page }) => {
        await page.clock.install();
        await page.clock.pauseAt(new Date());
        await seedPortfolioBoards(page, [{ id: 'alpha', title: 'Alpha', hasHandle: true,
          tasks: [{ title: 'Original task' }] }], { selectedBoardId: 'alpha' });
        await openDetails(page);
        await page.locator('#projectDetailsDescription').fill('First description');
        await saveDetails(page);
        await waitForBoardWrites(page);
        if (selection === 'explicit latest') {
          await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
          await setTimelineSlider(page, 1);
        }
        await openDetails(page);
        await page.locator('#projectDetailsDescription').fill('Local draft');
        const external = await readSavedBoard(page, 'alpha');
        external.board.tasks[0].title = 'External task';
        external.extensions.timeline.events.push({ id: 'external-task-event', at: '2026-10-12T12:00:00.000Z',
          kind: 'task.updated', entityType: 'task', entityId: '1', summary: 'External task update',
          changes: { title: { before: 'Original task', after: 'External task' } } });
        await mutateExternalBoardFile(page, { boardId: 'alpha', payload: external });
        if (route === 'watcher') {
          await page.clock.resume();
          await triggerExternalFileCheck(page);
        }
        await expect(modal(page).getByRole('button', { name: 'Save', exact: true })).toBeVisible();
        await expect(page.locator('#projectDetailsDescription')).toHaveValue('Local draft');
        await saveDetails(page);
        await waitForBoardWrites(page, 2);
        const saved = await readSavedBoard(page, 'alpha');
        expect(saved.board.tasks[0].title).toBe('External task');
        expect(saved.extensions.projectDetails.description).toBe('Local draft');
        expect(saved.extensions.timeline.events.map((event: { kind: string }) => event.kind))
          .toEqual(['board.baseline', 'project.details.updated', 'task.updated', 'project.details.updated']);
      });
    }
  }

  test('external history appends retain a genuine historical selection', async ({ page }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await seedPortfolioBoards(page, [{ id: 'alpha', title: 'Alpha', hasHandle: true,
      tasks: [{ title: 'Original task' }] }], { selectedBoardId: 'alpha' });
    await openDetails(page);
    await page.locator('#projectDetailsDescription').fill('Present description');
    await saveDetails(page);
    await waitForBoardWrites(page);
    await page.locator('#portfolioTimelinePanel .timeline-toggle-btn').click();
    await setTimelineSlider(page, 0);
    await openDetails(page);
    const external = await readSavedBoard(page, 'alpha');
    external.board.tasks[0].title = 'External task';
    external.extensions.timeline.events.push({ id: 'external-task-event', at: '2026-10-12T12:00:00.000Z',
      kind: 'task.updated', entityType: 'task', entityId: '1', summary: 'External task update',
      changes: { title: { before: 'Original task', after: 'External task' } } });
    await mutateExternalBoardFile(page, { boardId: 'alpha', payload: external });
    await page.clock.resume();
    await triggerExternalFileCheck(page);
    await expect(page.locator('#portfolioTimelinePanel .timeline-slider')).toHaveValue('0');
    await expect(page.locator('#projectDetailsDescription')).toHaveValue('');
    await expect(modal(page).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  });

  test('a disk read error on immediate save retains the draft without writing', async ({ page }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await seedPortfolioBoards(page, [{ id: 'alpha', title: 'Alpha', hasHandle: true }], { selectedBoardId: 'alpha' });
    await openDetails(page);
    await page.locator('#projectDetailsName').fill('Local draft');
    await mutateExternalBoardFile(page, { boardId: 'alpha', invalidText: '{ invalid json' });
    await modal(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal(page).getByRole('alert')).toBeVisible();
    await expect(page.locator('#projectDetailsName')).toHaveValue('Local draft');
    expect(await page.evaluate(() => window.__portfolioTestWrites.length)).toBe(0);
    expect(await page.evaluate(() => window.__portfolioDiskByBoardId.alpha.text)).toBe('{ invalid json');
  });

  test('quick creation uses the destination team and asks for ambiguous prefixes in either order', async ({ page }) => {
    await seedPortfolioBoards(page, [
      { id: 'alpha', title: 'Alpha', hasHandle: true, extensions: { projectDetails: { version: 1, description: '', team: ['Ana Alpha'] } } },
      { id: 'bravo', title: 'Bravo', hasHandle: true, extensions: { projectDetails: { version: 1, description: '', team: ['Ana Silva', 'Ana Santos'] } } }
    ], { selectedBoardId: 'alpha' });
    for (const [index, suffix] of ['@an in:bravo', 'in:bravo @an'].entries()) {
      await page.locator('#portfolioSearchBtn').click();
      await page.locator('#commandPaletteInput').fill(`+ New task ${index} ${suffix}`);
      const choices = page.locator('#commandPalette [data-palette-key^="create-assignee:"]');
      await expect(choices).toHaveText([/Ana Silva/, /Ana Santos/]);
      await expect(page.locator('#commandPalette [data-palette-key="create"]')).toHaveCount(0);
      await choices.filter({ hasText: 'Ana Santos' }).click();
      await expect(page.locator('#commandPalette .palette-preview')).toContainText('@Ana Santos');
      await page.keyboard.press('Enter');
      await expect(page.locator('#commandPalette')).toHaveCount(0);
      await waitForBoardWrites(page, index + 1);
      expect((await readSavedBoard(page, 'bravo')).board.tasks.find((task: { title: string }) => task.title === `New task ${index}`).assignees)
        .toEqual(['Ana Santos']);
    }
    expect((await readSavedBoard(page, 'alpha')).board.tasks).toEqual([]);
  });
});
