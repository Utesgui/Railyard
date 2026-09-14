// Stage 3 layout check: HUD frame at several viewports (run: node .shot3.mjs)
import { chromium } from '@playwright/test';

const OUT = process.env.OUT ?? '/tmp/claude-0/-home-user-Z-geZ-geZ-ge/b4ca0dc4-da80-517f-b5cd-e0847b0e6ba5/scratchpad';
const URL = 'http://localhost:5199/?seed=42';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function shot(name, w, hgt, fn) {
  const page = await browser.newPage({ viewport: { width: w, height: hgt } });
  page.on('pageerror', (e) => console.log('PAGE ERROR', name, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', name, m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__game);
  await page.evaluate(() => window.__game.cmd.setSpeed(0));
  if (fn) await fn(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.close();
  console.log('shot', name);
}

await shot('s3-overview-1440', 1440, 900);
await shot('s3-track-1440', 1440, 900, async (page) => {
  await page.keyboard.press('t');
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box.x + box.width / 2 - 100, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40);
  await page.waitForTimeout(200);
});
await shot('s3-panel-1440', 1440, 900, async (page) => {
  await page.keyboard.press('f');
  await page.waitForTimeout(200);
});
await shot('s3-help-1440', 1440, 900, async (page) => {
  await page.keyboard.press('?');
  await page.waitForTimeout(200);
});
await shot('s3-narrow-390', 390, 844, async (page) => {
  await page.keyboard.press('l');
  await page.waitForTimeout(200);
});
await shot('s3-1024', 1024, 768);
await browser.close();
