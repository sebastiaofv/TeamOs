import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, waitForBoardWrites, appMessage, answerAppMessage } from '../support/portfolio';

for (const responsible of ['Ana', 'Rui']) {
  test(`typing a project member correction through another name preserves identities when ${responsible} is responsible`, async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Participant corrections', hasHandle: true, tasks: [
      { id: 1, title: 'Correct this item', assignees: ['Ana', 'Rui'], responsible },
      { id: 2, title: 'Leave this item alone', assignees: ['Ana', 'Rui'], responsible }
    ] }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Settings for Participant corrections', exact: true }).click();
    const participant = page.getByLabel('Member 1 name', { exact: true });
    await participant.fill('');
    await participant.pressSequentially('Rui Silva');
    // Save directly from the participant input: no blur may be required.
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('#projectSettingsModal')).toBeHidden();
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks[0]).toMatchObject({
      assignees: ['Rui Silva', 'Rui'], responsible: responsible === 'Ana' ? 'Rui Silva' : 'Rui'
    });
    expect(saved.board.tasks[1]).toMatchObject({ assignees: ['Rui Silva', 'Rui'], responsible: responsible === 'Ana' ? 'Rui Silva' : 'Rui' });
    await portfolioCard(page, 'Correct this item').locator('[data-action="edit-task"]').click();
    const reopened = page.locator('#taskAssigneeItems .assignee-editor-row > span');
    await expect(reopened).toHaveCount(2);
    await expect(reopened.nth(0)).toHaveText('Rui Silva');
    await expect(reopened.nth(1)).toHaveText('Rui');
  });
}

test('duplicate project member names are rejected without merging people or changing assignments', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Participant rows', hasHandle: true, tasks: [
    { id: 1, title: 'Correct this item', assignees: ['Ana', 'Rui', 'Marta'], responsible: 'Ana' }
  ] }], { selectedBoardId: 'p' });
  await page.getByRole('button', { name: 'Settings for Participant rows', exact: true }).click();
  await page.getByLabel('Member 2 name', { exact: true }).fill(' ANA ');
  await page.locator('#projectSettingsModal').getByRole('button', { name: 'Save', exact: true }).click();
  await answerAppMessage(page, { expectText: 'Member names must be unique' });
  await expect(page.locator('#projectSettingsModal')).toBeVisible();
  await page.locator('#projectSettingsModal').getByRole('button', { name: 'Cancel', exact: true }).click();
  await portfolioCard(page, 'Correct this item').locator('[data-action="edit-task"]').click();
  const participants = page.locator('#taskAssigneeItems .assignee-editor-row > span');
  await expect(participants).toHaveText(['Ana', 'Rui', 'Marta']);
  await page.getByRole('button', { name: 'Remove participant', exact: true }).nth(2).click();
  await page.locator('#taskModalSaveBtn').click();
  await expect(page.locator('#taskModal')).toBeHidden();
  await waitForBoardWrites(page);
  expect((await readSavedBoard(page, 'p')).board.tasks[0]).toMatchObject({ assignees: ['Ana', 'Rui'], responsible: 'Ana' });
});

for (const confirm of [false, true]) {
  test(`immediately removing a renamed responsible participant works on the first click (${confirm ? 'confirm' : 'cancel'})`, async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Direct removal', hasHandle: true, tasks: [
      { id: 1, title: 'Correct this item', assignees: ['Ana', 'Rui'], responsible: 'Ana' }
    ] }], { selectedBoardId: 'p' });
    await page.getByRole('button', { name: 'Settings for Direct removal', exact: true }).click();
    await page.getByLabel('Member 1 name', { exact: true }).fill('Ana Silva');
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('#projectSettingsModal')).toBeHidden();
    await portfolioCard(page, 'Correct this item').locator('[data-action="edit-task"]').click();
    await page.getByRole('button', { name: 'Remove participant', exact: true }).first().click();
    await expect(appMessage(page)).toContainText('Ana Silva');
    if (confirm) await answerAppMessage(page);
    else await answerAppMessage(page, { button: 'Cancel' });
    await expect(page.locator('#taskResponsible')).toHaveValue(confirm ? '' : 'Ana Silva');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#taskModal')).toBeHidden();
    await waitForBoardWrites(page, 2);
    expect((await readSavedBoard(page, 'p')).board.tasks[0]).toMatchObject({
      assignees: confirm ? ['Rui'] : ['Ana Silva', 'Rui'], responsible: confirm ? '' : 'Ana Silva'
    });
  });
}
