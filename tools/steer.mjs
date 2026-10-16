// Hold A then D and log heading, position and camera yaw to confirm the balloon turns.
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + (process.argv[2] || ''));
await page.waitForFunction('window.__dbg && window.__dbg.frames > 60', { timeout: 120000 });
const st = () => page.evaluate(() => { const F = window.__dbg.G.hero.flight; const c = window.__dbg.G.cams; const vh = Math.atan2(F.v.z, F.v.x); return `mode=${F.mode} alt=${F.p.y.toFixed(0)} agl=${(F.p.y - window.__dbg.G.terrainData.height(F.p.x, F.p.z)).toFixed(0)} heading=${(F.heading * 57.3).toFixed(0)} travel=${(vh * 57.3).toFixed(0)} spd=${Math.hypot(F.v.x, F.v.z).toFixed(1)} camYaw=${(c.yaw * 57.3 % 360).toFixed(0)}`; });
console.log('start', await st());
for (const [k, ms] of [['KeyA', 3000], ['KeyD', 3000]]) {
  await page.keyboard.down(k);
  for (let i = 0; i < 6; i++) { await new Promise(r => setTimeout(r, ms / 6)); console.log(k, await st()); }
  await page.keyboard.up(k);
}
await page.screenshot({ path: 'shots/steer.png' });
await browser.close();
