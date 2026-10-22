// Hitch from a render-scale change: flips the scale a few times and prints the frame intervals
// around each change. usage: node tools/rescale.mjs (HP=1 for the RTX)
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = 2525, H = 1295;
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false,
  args: [...(process.env.HP ? ['--force_high_performance_gpu'] : []), `--window-size=${W},${H + 80}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  defaultViewport: { width: W, height: H } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + '#h=15&fixres&res=0.8');
await page.waitForFunction('window.__dbg && window.__dbg.frames > 3', { timeout: 180000 });
await new Promise(r => setTimeout(r, 10000));
for (const s of [0.75, 0.8, 0.75, 0.8]) {
  await page.evaluate(() => window.__dbg.paceStart());
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(s => { const p = window.__dbg.pipe; p.scale = s; p.setSize(innerWidth, innerHeight, p.pr); }, s);
  await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => window.__dbg.paceStop());
  const dts = r.map(e => e.dt.toFixed(0));
  const mx = Math.max(...r.map(e => e.dt));
  console.log('scale', s, 'max interval', mx.toFixed(1), 'frames', dts.join(' '));
}
await browser.close();
