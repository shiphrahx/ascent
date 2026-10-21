// Toggle scene groups and passes one at a time and report frame time, to find what dominates.
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false,
  args: [...(process.env.SW ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []), '--window-size=1440,980', '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + (process.argv[2] || ''));
await page.waitForFunction('window.__dbg && window.__dbg.frames > 3', { timeout: 180000 });
const measure = async (label, fn) => {
  await page.evaluate(fn);
  await new Promise(r => setTimeout(r, +(process.env.WAIT || 8000)));
  const ms = await page.evaluate(() => window.__dbg.extra().ms);
  console.log(label.padEnd(28), ms);
};
await measure('baseline', '0');
for (const g of ['terrain', 'rocks', 'land', 'village', 'veg', 'river', 'fleetEnv']) {
  await measure('hide ' + g, `window.__dbg.groups['${g}'].visible = false`);
  await page.evaluate(`window.__dbg.groups['${g}'].visible = true`);
}
await measure('hide all scene', `window.__dbg.scene.children.forEach(c => c.visible = false)`);
await browser.close();
