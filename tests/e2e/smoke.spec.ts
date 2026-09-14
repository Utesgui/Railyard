import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __game: {
      game: { cam: { centerOnTile(t: number): void; worldToScreen(x: number, y: number): { sx: number; sy: number }; zoom: number }; setTool(t: string): void; select(k: string, id: number): void };
      state: { economy: { money: number }; towns: { x: number; y: number }[]; stations: { id: number; tile: number }[]; lines: { id: number }[]; trains: { state: number }[]; world: { width: number }; tick: number };
      rt: { tileOcc: Uint8Array };
      cmd: { setSpeed(s: number): void; createLine(): { id?: number }; addStop(l: number, s: number): { ok: boolean }; buyTrain(l: number, loco: number, w: number[]): { ok: boolean; reason?: string } };
    };
  }
}

test('boots, builds a line with the real tools and earns money', async ({ page }) => {
  await page.goto('/?seed=4242');
  await page.waitForFunction(() => !!window.__game);
  await expect(page.locator('#topbar .money')).toContainText('$500,000');

  // find two nearby towns and free tiles next to them (same helper logic as the unit test)
  const plan = await page.evaluate(() => {
    const s = window.__game.state;
    const occ = window.__game.rt.tileOcc;
    const w = s.world.width;
    const free = (x: number, y: number) => {
      for (let r = 1; r < 6; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const t = (y + dy) * w + x + dx;
            if (occ[t] === 0) return t;
          }
      return -1;
    };
    let best = [0, 1];
    let bd = 1e9;
    for (let i = 0; i < s.towns.length; i++)
      for (let j = i + 1; j < s.towns.length; j++) {
        const d = Math.hypot(s.towns[i].x - s.towns[j].x, s.towns[i].y - s.towns[j].y);
        if (d < bd) {
          bd = d;
          best = [i, j];
        }
      }
    const a = s.towns[best[0]];
    const b = s.towns[best[1]];
    return { sa: free(a.x, a.y), sb: free(b.x, b.y), w };
  });
  expect(plan.sa).toBeGreaterThanOrEqual(0);

  const clickTile = async (tile: number) => {
    await page.evaluate((t) => window.__game.game.cam.centerOnTile(t), tile);
    const pt = await page.evaluate((t) => {
      const g = window.__game.game;
      const w = window.__game.state.world.width;
      return g.cam.worldToScreen(((t % w) + 0.5) * 32, (Math.floor(t / w) + 0.5) * 32);
    }, tile);
    const box = (await page.locator('#map').boundingBox())!;
    await page.mouse.click(box.x + pt.sx, box.y + pt.sy);
  };

  // stations via the station tool
  await page.keyboard.press('s');
  await clickTile(plan.sa);
  await expect(page.locator('#panel h2')).toContainText('Station');
  await page.keyboard.press('s');
  await clickTile(plan.sb);
  const stations = await page.evaluate(() => window.__game.state.stations.map((s) => s.id));
  expect(stations.length).toBe(2);

  // track via the track tool: click start, click end
  await page.keyboard.press('t');
  await clickTile(plan.sa);
  await clickTile(plan.sb);
  const moneyAfterBuild = await page.evaluate(() => window.__game.state.economy.money);
  expect(moneyAfterBuild).toBeLessThan(500_000 - 30_000);

  // line + train through the command API (the panels are exercised manually)
  const bought = await page.evaluate(([a, b]) => {
    const cmd = window.__game.cmd;
    const line = cmd.createLine().id!;
    cmd.addStop(line, a);
    cmd.addStop(line, b);
    return cmd.buyTrain(line, 0, [0, 0, 0]);
  }, stations);
  expect(bought.ok).toBe(true);

  await page.evaluate(() => window.__game.cmd.setSpeed(8));
  await page.waitForFunction(() => window.__game.state.trains[0].state === 0, null, { timeout: 20_000 });
  const before = await page.evaluate(() => window.__game.state.economy.money);
  await page.waitForFunction((m) => window.__game.state.economy.money !== m, before, { timeout: 40_000 });
  await expect(page.locator('#topbar .date')).not.toContainText('1 Jan 1900');
});
