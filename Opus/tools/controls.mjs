// Press the flight keys and log how quickly the balloon responds.
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + '#sim=150');
await page.waitForFunction('window.__dbg && window.__dbg.frames > 60', { timeout: 120000 });
const st = () => page.evaluate(() => { const F = window.__dbg.G.hero.flight; return `alt=${F.p.y.toFixed(1)} vy=${F.v.y.toFixed(2)} yawRate=${F.yawRate.toFixed(2)} burn=${F.burn}`; });
const run = async (label, key, holdMs, afterMs) => {
  console.log('--', label);
  if (key) await page.keyboard.down(key);
  const t0 = Date.now();
  while (Date.now() - t0 < holdMs) { await new Promise(r => setTimeout(r, 250)); console.log(`  +${((Date.now() - t0) / 1000).toFixed(2)}s`, await st()); }
  if (key) await page.keyboard.up(key);
  const t1 = Date.now();
  while (Date.now() - t1 < afterMs) { await new Promise(r => setTimeout(r, 500)); console.log(`  released +${((Date.now() - t1) / 1000).toFixed(1)}s`, await st()); }
};
await run('settle', null, 0, 3000);
await run('burner', 'Space', 2000, 4000);
await run('vent', 'KeyS', 2000, 4000);
await run('turn', 'KeyA', 1500, 1000);
await browser.close();
