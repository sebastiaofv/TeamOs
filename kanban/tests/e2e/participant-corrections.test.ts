import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards, portfolioCard, readSavedBoard, waitForBoardWrites, appMessage, answerAppMessage } from '../support/portfolio';

for (const responsible of ['Ana', 'Rui']) {
  test(`typing a participant correction through another name preserves both people when ${responsible} is responsible`, async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Participant corrections', hasHandle: true, tasks: [
      { id: 1, title: 'Correct this item', assignees: ['Ana', 'Rui'], responsible },
      { id: 2, title: 'Leave this item alone', assignees: ['Ana', 'Rui'], responsible }
    ] }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Correct this item').locator('[data-action="edit-task"]').click();
    const participant = page.getByLabel('Participant name', { exact: true }).first();
    await participant.fill('');
    await participant.pressSequentially('Rui Silva');
    // Save directly from the participant input: no blur may be required.
    await page.keyboard.press('Control+Enter');
    await expect(page.locator('#taskModal')).toBeHidden();
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'p');
    expect(saved.board.tasks[0]).toMatchObject({
      assignees: ['Rui Silva', 'Rui'], responsible: responsible === 'Ana' ? 'Rui Silva' : 'Rui'
    });
    expect(saved.board.tasks[1]).toMatchObject({ assignees: ['Ana', 'Rui'], responsible });
    await portfolioCard(page, 'Correct this item').locator('[data-action="edit-task"]').click();
    const reopened = page.getByLabel('Participant name', { exact: true });
    await expect(reopened).toHaveCount(2);
    await expect(reopened.nth(0)).toHaveValue('Rui Silva');
    await expect(reopened.nth(1)).toHaveValue('Rui');
  });
}

test('deduplicating a participant keeps later rows aligned with the people they display and remove', async ({ page }) => {
  await gotoApp(page);
  await seedPortfolioBoards(page, [{ id: 'p', title: 'Participant rows', hasHandle: true, tasks: [
    { id: 1, title: 'Correct this item', assignees: ['Ana', 'Rui', 'Marta'], responsible: 'Ana' }
  ] }], { selectedBoardId: 'p' });
  await portfolioCard(page, 'Correct this item').locator('[data-action="edit-task"]').click();
  const participants = page.getByLabel('Participant name', { exact: true });
  await participants.nth(1).fill('Ana');
  await page.locator('#taskResponsible').click();
  await expect(participants).toHaveCount(2);
  await expect(participants.nth(0)).toHaveValue('Ana');
  await expect(participants.nth(1)).toHaveValue('Marta');
  await page.getByRole('button', { name: 'Remove participant', exact: true }).nth(1).click();
  await expect(participants).toHaveCount(1);
  await expect(participants.first()).toHaveValue('Ana');
  await page.locator('#taskModalSaveBtn').click();
  await expect(page.locator('#taskModal')).toBeHidden();
  await waitForBoardWrites(page);
  expect((await readSavedBoard(page, 'p')).board.tasks[0]).toMatchObject({ assignees: ['Ana'], responsible: 'Ana' });
});

for (const confirm of [false, true]) {
  test(`immediately removing a renamed responsible participant works on the first click (${confirm ? 'confirm' : 'cancel'})`, async ({ page }) => {
    await gotoApp(page);
    await seedPortfolioBoards(page, [{ id: 'p', title: 'Direct removal', hasHandle: true, tasks: [
      { id: 1, title: 'Correct this item', assignees: ['Ana', 'Rui'], responsible: 'Ana' }
    ] }], { selectedBoardId: 'p' });
    await portfolioCard(page, 'Correct this item').locator('[data-action="edit-task"]').click();
    await page.getByLabel('Participant name', { exact: true }).first().fill('Ana Silva');
    await page.getByRole('button', { name: 'Remove participant', exact: true }).first().click();
    await expect(appMessage(page)).toContainText('Ana Silva');
    if (confirm) await answerAppMessage(page);
    else await answerAppMessage(page, { button: 'Cancel' });
    await expect(page.locator('#taskResponsible')).toHaveValue(confirm ? '' : 'Ana Silva');
    await page.locator('#taskModalSaveBtn').click();
    await expect(page.locator('#taskModal')).toBeHidden();
    await waitForBoardWrites(page);
    expect((await readSavedBoard(page, 'p')).board.tasks[0]).toMatchObject({
      assignees: confirm ? ['Rui'] : ['Ana Silva', 'Rui'], responsible: confirm ? '' : 'Ana Silva'
    });
  });
}
