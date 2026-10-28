import { test, expect, type Page } from '@playwright/test';
import {
  gotoApp,
  portfolioCard,
  readSavedBoard,
  seedPortfolioBoards,
  setBoardSearch,
  waitForBoardWrites
} from '../support/portfolio';

function localIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const palette = (page: Page) => page.locator('#commandPalette');
const input = (page: Page) => page.locator('#commandPaletteInput');
const activeItem = (page: Page) => palette(page).locator('.palette-item.active');

async function seed(page: Page) {
  await seedPortfolioBoards(page, [
    {
      id: 'alpha', hasHandle: true, title: 'Alpha', members: ['Ana', 'Zoe'],
      tasks: [
        { id: 1, title: 'Write spec', status: 'to-do', assignees: ['Ana'] },
        { id: 2, title: 'Login bug', status: 'doing', tags: ['auth'] }
      ]
    },
    { id: 'bravo', hasHandle: true, title: 'Bravo', members: ['Ana'], tags: ['auth'], tasks: [{ id: 5, title: 'Ship release', status: 'backlog' }] },
    { id: 'charlie', hasHandle: false, title: 'Charlie', tasks: [{ id: 9, title: 'Read-only note', status: 'to-do' }] }
  ]);
}

async function openPalette(page: Page) {
  await page.locator('#portfolioSearchBtn').click();
  await expect(input(page)).toBeFocused();
}

test.describe('command palette', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await seed(page);
  });

  test('opens with Ctrl+K, / and the toolbar box, and closes with Esc', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('Control+k');
    await expect(input(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toHaveCount(0);

    await page.keyboard.press('/');
    await expect(input(page)).toBeFocused();
    await page.keyboard.press('Escape');

    await openPalette(page);
    await expect(palette(page)).toContainText('Go to Day Planner');
  });

  test('filters the board by text and clears it from the toolbar', async ({ page }) => {
    await setBoardSearch(page, 'login');
    await expect(page.locator('.portfolio-task-card')).toHaveCount(1);
    await expect(page.locator('#portfolioSearchBtn')).toContainText('login');
    expect(new URL(page.url()).searchParams.get('pq')).toBe('login');

    await page.locator('#portfolioSearchClearBtn').click();
    await expect(page.locator('.portfolio-task-card')).toHaveCount(4);
  });

  test('finds a task by title, #id and #tag and opens it', async ({ page }) => {
    await openPalette(page);
    await input(page).fill('#5');
    await expect(palette(page).locator('.palette-item', { hasText: 'Ship release' })).toBeVisible();
    await input(page).fill('#auth');
    await expect(palette(page).locator('.palette-item', { hasText: 'Login bug' })).toBeVisible();

    await input(page).fill('write');
    await page.keyboard.press('ArrowDown');
    await expect(activeItem(page)).toContainText('Write spec');
    await page.keyboard.press('Enter');
    await expect(palette(page)).toHaveCount(0);
    await expect(page.getByRole('dialog')).toContainText('Write spec');
  });

  test('moves a task through its actions, with undo', async ({ page }) => {
    await openPalette(page);
    await input(page).fill('write');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(palette(page).locator('.palette-crumb')).toHaveText(['#1 Write spec']);
    await input(page).fill('done');
    await expect(activeItem(page)).toContainText(/Move to done/i);
    await page.keyboard.press('Enter');

    await expect(page.locator('#portfolio-done-column')).toContainText('Write spec');
    await page.locator('#undoBtn').click();
    await expect(page.locator('#portfolio-to-do-column')).toContainText('Write spec');
  });

  test('starts with actions for the selected card and selects a curated assignee step by step', async ({ page }) => {
    await portfolioCard(page, 'Login bug').click();
    await page.keyboard.press('Control+k');
    await expect(palette(page).locator('.palette-section').first()).toHaveText('Login bug');
    await input(page).fill('assign');
    await page.keyboard.press('Enter');
    await expect(palette(page).locator('.palette-crumb')).toHaveText(['#2 Login bug', 'Assign']);
    await input(page).fill('Zoe');
    await expect(activeItem(page)).toContainText('Zoe');
    await page.keyboard.press('Enter');

    await expect(portfolioCard(page, 'Login bug')).toContainText('Zoe');
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.board.tasks.find((task: any) => task.id === 2).assignees).toEqual(['Zoe']);
  });

  test('backspace on an empty box steps back', async ({ page }) => {
    await openPalette(page);
    await input(page).fill('ship');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(palette(page).locator('.palette-crumb')).toHaveCount(1);
    await page.keyboard.press('Backspace');
    await expect(palette(page).locator('.palette-crumb')).toHaveCount(0);
  });

  test('quick create previews the fields and creates the task, with undo', async ({ page }) => {
    await openPalette(page);
    await input(page).fill('+ Fix crash @an !high #auth ~S due:tomorrow in:bravo');
    const preview = palette(page).locator('.palette-preview');
    await expect(preview).toContainText('Fix crash');
    await expect(preview).toContainText('in Bravo');
    await expect(preview).toContainText('@Ana');
    await expect(preview).toContainText('#auth');
    await expect(activeItem(page)).toContainText('Create "Fix crash" in Bravo');
    await page.keyboard.press('Enter');

    await expect(portfolioCard(page, 'Fix crash')).toBeVisible();
    await waitForBoardWrites(page);
    const task = (await readSavedBoard(page, 'bravo')).board.tasks.find((entry: any) => entry.title === 'Fix crash');
    expect(task).toMatchObject({ status: 'backlog', assignees: ['Ana'], priority: 'high', tags: ['auth'], effort: 'S' });
    expect(task.dueDate).toBe(localIsoDate(new Date(Date.now() + 24 * 60 * 60 * 1000)));

    await page.locator('#undoBtn').click();
    await expect(page.locator('.portfolio-task-card', { hasText: 'Fix crash' })).toHaveCount(0);
  });

  test('plan puts a task in the Day Planner at the given time', async ({ page }) => {
    await openPalette(page);
    await input(page).fill('plan ship 14:00');
    await expect(activeItem(page)).toContainText('Ship release');
    await page.keyboard.press('Enter');
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'bravo');
    expect(saved.extensions.dayPlanner.blocks).toEqual([
      expect.objectContaining({ taskId: 5, date: localIsoDate(), start: '14:00', end: '14:15' })
    ]);
  });

  test('read-only tasks only offer Open details', async ({ page }) => {
    await openPalette(page);
    await input(page).fill('read-only');
    await expect(activeItem(page)).toContainText('Filter board by');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(palette(page).locator('.palette-item')).toHaveText([/Open details/]);
  });

  test('remembers recently used items', async ({ page }) => {
    const bravoProject = palette(page).locator('[data-palette-key^="project:"]', { hasText: 'Bravo' });
    await openPalette(page);
    await input(page).fill('bravo');
    await bravoProject.click();
    await expect(page.locator('.portfolio-chip.active')).toContainText('Bravo');

    // Projects only appear on the empty palette through "Recent".
    await openPalette(page);
    await expect(palette(page).locator('.palette-section', { hasText: 'Recent' })).toBeVisible();
    await expect(bravoProject).toBeVisible();
  });

  test('Help has a Command palette tab whose examples open the palette pre-filled', async ({ page }) => {
    await page.getByRole('button', { name: 'Help' }).click();
    const help = page.locator('#helpModal');
    await expect(help.getByRole('tab', { name: 'Guide' })).toHaveAttribute('aria-selected', 'true');
    await expect(help).toContainText('Drag cards between columns');

    await help.getByRole('tab', { name: 'Guide' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(help.getByRole('tab', { name: 'Command palette' })).toHaveAttribute('aria-selected', 'true');
    await expect(help.getByRole('tab', { name: 'Command palette' })).toBeFocused();
    await expect(help.getByRole('tabpanel')).toContainText('+ Fix login crash @ana !high #auth ~S due:fri in:mobile');

    await help.getByRole('button', { name: 'Try "#auth" in the command palette' }).click();
    await expect(help).toHaveCount(0);
    await expect(input(page)).toHaveValue('#auth');
    await expect(palette(page).locator('.palette-item', { hasText: 'Login bug' })).toBeVisible();
  });

  test('the palette opens its own help', async ({ page }) => {
    await openPalette(page);
    await input(page).fill('how to use');
    // "Filter board by" is always first.
    await page.keyboard.press('ArrowDown');
    await expect(activeItem(page)).toContainText('How to use the command palette');
    await page.keyboard.press('Enter');
    await expect(page.locator('#helpModal').getByRole('tab', { name: 'Command palette' })).toHaveAttribute('aria-selected', 'true');
  });

  test('is listed in the keyboard shortcuts dialog', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('?');
    await expect(page.locator('#shortcutsModal')).toContainText('Open the command palette');
    await expect(page.locator('#shortcutsModal')).toContainText('Search tasks and commands');
  });
});
