// Frame time per pass at a fixed render scale, headful on the default GPU.
// usage: node tools/passes.mjs "#h=5" [scale]
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = +(process.env.W || 1600), H = +(process.env.H || 900), DPR = +(process.env.DPR || 1);
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false,
  args: [`--window-size=${W},${H + 80}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: DPR } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + (process.argv[2] || '') + '&fixres');
await page.waitForFunction('window.__dbg && window.__dbg.frames > 3', { timeout: 180000 });
const scale = +(process.argv[3] || 1);
await page.evaluate(s => { const p = window.__dbg.pipe; p.scale = s; p.setSize(innerWidth, innerHeight, p.pr); }, scale);
const measure = async (label, fn, undo) => {
  await page.evaluate(fn);
  await new Promise(r => setTimeout(r, +(process.env.WAIT || 5000)));
  const e = await page.evaluate(() => window.__dbg.extra());
  console.log(label.padEnd(24), e.ms, `${e.W}x${e.H}`);
  if (undo) await page.evaluate(undo);
};
await measure('baseline', '0');
await measure('no volumetrics', 'window.__vh = window.__dbg.pipe.hooks.volumetrics; window.__dbg.pipe.hooks.volumetrics = null', 'window.__dbg.pipe.hooks.volumetrics = window.__vh');
for (const g of ['terrain', 'rocks', 'land', 'village', 'veg', 'grass', 'river', 'fleetEnv'])
  await measure('hide ' + g, `window.__dbg.groups['${g}'].visible = false`, `window.__dbg.groups['${g}'].visible = true`);
await measure('hide all scene', `window.__dbg.scene.children.forEach(c => c.visible = false)`);
await browser.close();
