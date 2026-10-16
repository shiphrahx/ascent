// Runs the page for a while at accelerated time, sampling state and collecting console output.
// usage: node tools/longrun.mjs seconds "#ts=8"
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const file = pathToFileURL(path.resolve('cappadocia.html')).href;
const secs = +(process.argv[2] || 60), hash = process.argv[3] || '#ts=8';
const browser = await puppeteer.launch({
  executablePath: EDGE, headless: 'new',
  args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(file + hash);
await page.waitForFunction('window.__dbg && window.__dbg.frames > 3', { timeout: 120000 });
for (let t = 0; t < secs; t += 5) {
  await new Promise(r => setTimeout(r, 5000));
  const s = await page.evaluate(() => {
    const d = window.__dbg, e = d.extra(), L = d.loop();
    return `h=${d.sky.hour.toFixed(2)} mode=${e.mode} wp=${e.wp} pos=${e.pos} agl=${e.agl} fps=${e.fps} scale=${e.scale} loop=${L.phase}:${L.fade.toFixed(2)} nan=${isNaN(e.alt)}`;
  });
  console.log(`t+${t + 5}s ${s}`);
}
await page.screenshot({ path: 'shots/longrun.png' });
console.log('logs:', logs.length);
for (const l of logs.slice(0, 20)) console.log(l);
await browser.close();
