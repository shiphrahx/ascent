// Scripted hand flight: holds keys in sequence and logs speed, heading, altitude and clearance,
// so the controls can be checked without a person at the keyboard.
// usage: node tools/fly.mjs ["#hash"]
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + (process.argv[2] || ''));
await page.waitForFunction('window.__dbg && window.__dbg.frames > 60', { timeout: 120000 });
const st = () => page.evaluate(() => {
  const F = window.__dbg.G.hero.flight, D = window.__dbg.G.terrainData;
  return `manual=${F.manual ? 1 : 0} spd=${Math.hypot(F.v.x, F.v.z).toFixed(1).padStart(4)} vy=${F.v.y.toFixed(1).padStart(4)} hdg=${(F.heading * 57.3 % 360).toFixed(0).padStart(4)} alt=${F.p.y.toFixed(0)} agl=${(F.p.y - D.height(F.p.x, F.p.z)).toFixed(0)} pos=${F.p.x.toFixed(0)},${F.p.z.toFixed(0)} clr=${F.clearance.toFixed(1)} burn=${F.burn}`;
});
const seq = (process.env.SEQ || 'KeyW:4000,KeyA:3000,KeyD:2000,Space:3000,-:2000,ShiftLeft:3000,-:2000,KeyS:3000,-:3000').split(',');
console.log('start      ', await st());
for (const step of seq) {
  const [k, ms] = step.split(':');
  const keys = k === '-' ? [] : k.split('+');
  for (const kk of keys) await page.keyboard.down(kk);
  for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, +ms / 4)); console.log(k.padEnd(11), await st()); }
  for (const kk of keys) await page.keyboard.up(kk);
}
await page.screenshot({ path: 'shots/fly.png' });
if (errs.length) console.log('errors', errs);
await browser.close();
