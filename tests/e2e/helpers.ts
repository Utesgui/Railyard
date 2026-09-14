import type { Page } from '@playwright/test';

/**
 * Builds the smallest playable network with the real tools: two stations next to the two
 * closest towns, track between them, one line and one train. Returns the ids involved.
 */
export async function buildScenario(page: Page, seed = 4242): Promise<{ line: number; a: number; b: number; train: number }> {
  await page.goto(`/?seed=${seed}`);
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.cmd.setSpeed(0));
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
    return { sa: free(a.x, a.y), sb: free(b.x, b.y) };
  });
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
  await page.keyboard.press('s');
  await clickTile(plan.sa);
  await page.keyboard.press('Escape');
  await page.keyboard.press('s');
  await clickTile(plan.sb);
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await clickTile(plan.sa);
  await clickTile(plan.sb);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  return page.evaluate(() => {
    const cmd = window.__game.cmd;
    const [a, b] = window.__game.state.stations.map((x) => x.id);
    const line = cmd.createLine().id!;
    cmd.addStop(line, a);
    cmd.addStop(line, b);
    const t = cmd.buyTrain(line, 0, [0, 0, 1]);
    if (!t.ok) throw new Error(`buyTrain failed: ${t.reason}`);
    return { line, a, b, train: t.id! };
  });
}
