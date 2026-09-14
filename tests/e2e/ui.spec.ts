import { expect, test } from '@playwright/test';
import { buildScenario } from './helpers';

test.describe('HUD', () => {
  test('toolbar and hotkeys toggle panels, Escape closes them', async ({ page }) => {
    await page.goto('/?seed=4242');
    await page.waitForFunction(() => !!window.__game);
    await page.keyboard.press('f');
    await expect(page.locator('#panel')).toBeVisible();
    await expect(page.locator('#panel h2')).toHaveText('Finances');
    await page.keyboard.press('f');
    await expect(page.locator('#panel')).toBeHidden();
    await page.locator('#toolbar .btn', { hasText: 'Lines' }).click();
    await expect(page.locator('#panel h2')).toHaveText('Lines');
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).toBeHidden();
    // build tools show the context bar with the next step
    await page.keyboard.press('t');
    await expect(page.locator('#context')).toBeVisible();
    await expect(page.locator('#context .tool')).toHaveText('Track');
    await expect(page.locator('#context .step')).toContainText('start tile');
    await page.keyboard.press('Escape');
    await expect(page.locator('#context .tool')).not.toHaveText('Track');
  });

  test('dialogs pause the game, block hotkeys and restore the speed on close', async ({ page }) => {
    await page.goto('/?seed=4242');
    await page.waitForFunction(() => !!window.__game);
    await page.evaluate(() => window.__game.cmd.setSpeed(2));
    await page.keyboard.press('o');
    await page.getByRole('button', { name: 'New game' }).click();
    const dialog = page.locator('.overlay-dialog .dialog');
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => window.__game.state.speed)).toBe(0);
    // speed and tool hotkeys must not fire while the dialog is open
    await page.keyboard.press('4');
    await page.keyboard.press('t');
    expect(await page.evaluate(() => window.__game.state.speed)).toBe(0);
    expect(await page.evaluate(() => window.__game.game.ui.tool)).toBe('inspect');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.__game.state.speed)).toBe(2);
    // the settings panel is still open behind the dialog
    await expect(page.locator('#panel h2')).toHaveText('Settings');
  });

  test('typing in the rename prompt does not trigger hotkeys; Enter applies, empty is refused', async ({ page }) => {
    const ids = await buildScenario(page);
    await page.evaluate((id) => window.__game.game.select('station', id), ids.a);
    await expect(page.locator('#panel .eyebrow')).toHaveText('Station');
    await page.getByRole('button', { name: 'Rename station' }).click();
    const input = page.locator('#prompt-input');
    await expect(input).toBeFocused();
    await input.fill('');
    await page.keyboard.press('Enter');
    await expect(page.locator('.dialog .error')).toBeVisible();
    await input.type('st Depot x');
    expect(await page.evaluate(() => window.__game.game.ui.tool)).toBe('inspect');
    await page.keyboard.press('Enter');
    await expect(page.locator('.overlay-dialog')).toHaveCount(0);
    expect(await page.evaluate((id) => window.__game.state.stations.find((s) => s.id === id)!.name, ids.a)).toBe('st Depot x');
    await expect(page.locator('#panel h2')).toHaveText('st Depot x');
  });

  test('fleet panel lists trains, pushes the train panel and back returns', async ({ page }) => {
    const ids = await buildScenario(page);
    await page.keyboard.press('v');
    await expect(page.locator('#panel h2')).toHaveText('Fleet');
    await expect(page.locator('#panel .list-row')).toHaveCount(1);
    await page.locator('#panel .list-row').first().click();
    await expect(page.locator('#panel h2')).toHaveText('Train 1');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('#panel h2')).toHaveText('Fleet');
    // the refit view of an unchanged consist cannot be applied (and would cost nothing)
    await page.evaluate((id) => window.__game.ui.panels.push('depot', -2 - id), ids.train);
    await expect(page.locator('#panel h2')).toHaveText('Refit Train 1');
    await expect(page.locator('#panel .panel-foot .price')).toContainText('No changes');
    await expect(page.getByRole('button', { name: 'Apply refit' })).toBeDisabled();
  });

  test('alerts badge counts unread messages and clears when the panel opens', async ({ page }) => {
    await buildScenario(page);
    await page.evaluate(() => window.__game.cmd.setSpeed(8));
    // the first delivery unlocks an achievement, which is a persistent notification
    await page.waitForFunction(() => window.__game.state.notifications.length > 0, null, { timeout: 60_000 });
    await page.evaluate(() => window.__game.cmd.setSpeed(0));
    const badge = page.locator('#topbar .alerts .badge-count');
    await expect(badge).toBeVisible();
    await expect(badge).not.toHaveText('0');
    await page.keyboard.press('a');
    await expect(page.locator('#panel h2')).toHaveText('Alerts');
    await expect(page.locator('#panel .notif')).not.toHaveCount(0);
    await expect(badge).toBeHidden();
  });
});
