// GPU milliseconds per pass (timer queries), then the scene pass again with each group hidden in turn.
// usage: node tools/gpu.mjs ["#h=14.5"] [scale]
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = +(process.env.W || 2525), H = +(process.env.H || 1295);
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false,
  args: [...(process.env.HP ? ['--force_high_performance_gpu'] : []), `--window-size=${W},${H + 80}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  defaultViewport: { width: W, height: H } });
const page = await browser.newPage();
const scale = process.argv[3] || '1';
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + (process.argv[2] || '#h=14.5') + `&gpuprof&res=${scale}`);
await page.waitForFunction('window.__dbg && window.__dbg.frames > 3', { timeout: 180000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(10000);
const base = await page.evaluate(() => window.__dbg.gpu());
console.log('gpu', await page.evaluate(() => { const gl = window.__dbg.G.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)).slice(0, 70) + ' tier ' + window.__dbg.G.tier; }));
console.log('passes', JSON.stringify(base));
if (!process.env.SPLIT) { await browser.close(); process.exit(0); }
for (const g of ['terrain', 'rocks', 'land', 'village', 'veg', 'grass', 'river', 'fleetEnv']) {
  await page.evaluate(g => { window.__dbg.groups[g].visible = false; }, g);
  await wait(5000);
  const r = await page.evaluate(() => window.__dbg.gpu());
  console.log(('hide ' + g).padEnd(16), 'scene', r.scene, 'shadows', r.shadows, 'reflection', r.reflection);
  await page.evaluate(g => { window.__dbg.groups[g].visible = true; }, g);
}
await browser.close();
