const { test, expect } = require('@playwright/test');

async function gotoApp(page) {
  await page.goto('/kanban.html');
  await expect(page.locator('#boardView')).toBeVisible();
  await expect(page.locator('.column').first()).toBeVisible();
}

async function openNewTaskModal(page) {
  await page.locator('.add-task-card').first().click();
  await expect(page.locator('#taskModal')).toBeVisible();
}

async function createTask(page, { title, priority, effort }) {
  await openNewTaskModal(page);
  await page.locator('#taskName').fill(title);
  await page.locator('#taskPriority').selectOption(priority);
  await page.locator('#taskEffort').selectOption(effort);
  await page.locator('#taskModal .btn-primary').click();
  await expect(page.locator('#taskModal')).toBeHidden();
}

function taskCard(page, title) {
  return page.locator('.task-card').filter({ hasText: title }).first();
}

test.describe('kanban app', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('loads core board UI', async ({ page }) => {
    await expect(page.locator('.header')).toBeVisible();
    await expect(page.locator('#searchInput')).toBeVisible();
    await expect(page.locator('#portfolioToggleBtn')).toBeVisible();
    await expect(page.locator('#saveStatus')).toHaveText('Saved');
    await expect(page.locator('.add-task-card').first()).toBeVisible();
  });

  test('task modal reflects current model and creates card with score badge', async ({ page }) => {
    await openNewTaskModal(page);

    await expect(page.locator('#taskName')).toBeVisible();
    await expect(page.locator('#taskDueDate')).toBeVisible();
    await expect(page.locator('#taskPriority')).toBeVisible();
    await expect(page.locator('#taskEffort')).toBeVisible();
    await expect(page.locator('#taskTags')).toHaveCount(0);

    await page.locator('#taskName').fill('Playwright score test');
    await page.locator('#taskPriority').selectOption('high');
    await page.locator('#taskEffort').selectOption('M');
    await page.locator('#taskModal .btn-primary').click();

    const card = taskCard(page, 'Playwright score test');
    await expect(card).toBeVisible();
    await expect(card.locator('.task-tag-score')).toHaveText('Score 1.00');
    await expect(card).not.toContainText('#');
  });

  test('editing effort updates the score badge value', async ({ page }) => {
    const title = 'Score update test';
    await createTask(page, { title, priority: 'high', effort: 'M' });

    const card = taskCard(page, title);
    await expect(card.locator('.task-tag-score')).toHaveText('Score 1.00');

    await card.locator('button[title="Edit"]').click();
    await expect(page.locator('#taskModal')).toBeVisible();
    await page.locator('#taskEffort').selectOption('XL');
    await page.locator('#taskModal .btn-primary').click();

    await expect(card.locator('.task-tag-score')).toHaveText('Score 0.38');
  });

  test('portfolio view exposes score column', async ({ page }) => {
    await page.locator('#portfolioToggleBtn').click();

    await expect(page.locator('#portfolioView')).toBeVisible();
    await expect(page.locator('#boardView')).toBeHidden();
    await expect(page.locator('#portfolioSortHeader-score')).toBeVisible();
    await expect(page.locator('#portfolioTableBody tr')).toHaveCount(1);
    await expect(page.locator('#portfolioTableBody')).toContainText('tasks.');
  });

  test('serialized board data omits tags keys', async ({ page }) => {
    await createTask(page, { title: 'Serialize no tags', priority: 'medium', effort: 'S' });

    const hasTagsKey = await page.evaluate(() => {
      const data = serializeBoardData();

      function walk(value) {
        if (!value || typeof value !== 'object') return false;
        if (Array.isArray(value)) {
          return value.some(walk);
        }
        if (Object.prototype.hasOwnProperty.call(value, 'tags')) {
          return true;
        }
        return Object.values(value).some(walk);
      }

      return walk(data);
    });

    expect(hasTagsKey).toBe(false);
  });
});
