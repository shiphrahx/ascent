// Final check: page loads standalone, renders, no visible text, no external requests, no console errors.
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const issues = [], requests = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning' || m.type() === 'warn') issues.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
page.on('pageerror', e => issues.push(`[pageerror] ${e.message}`));
page.on('request', r => requests.push(r.url().slice(0, 60)));
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href);
await page.waitForFunction('window.__dbg && window.__dbg.frames > 30', { timeout: 120000 });
// exercise the controls: burner, vent, rotate, every camera, fast-forward, mute
const k = async (key, ms = 600) => { await page.keyboard.down(key); await new Promise(r => setTimeout(r, ms)); await page.keyboard.up(key); };
await k('Space', 2500); await k('KeyS', 1200); await k('KeyA', 800); await k('KeyD', 800);
for (let i = 0; i < 3; i++) { await k('KeyC', 100); await new Promise(r => setTimeout(r, 2500)); }
await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(900, 380, { steps: 10 }); await page.mouse.up();
await page.mouse.wheel({ deltaY: 300 });
await k('KeyT', 3000); await k('KeyM', 100);
await new Promise(r => setTimeout(r, 3000));
const res = await page.evaluate(() => ({
  text: document.body.innerText.trim(),
  textNodes: [...document.querySelectorAll('body *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim() && e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE')).length,
  frames: window.__dbg.frames, extra: window.__dbg.extra(),
}));
await page.screenshot({ path: 'shots/verify.png' });
const external = requests.filter(u => !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:'));
console.log('visible text:', JSON.stringify(res.text), 'text nodes:', res.textNodes);
console.log('frames:', res.frames, 'fps:', res.extra.fps, 'scale:', res.extra.scale, 'size:', res.extra.W + 'x' + res.extra.H, 'mode:', res.extra.mode);
console.log('external requests:', external.length, external);
console.log('console issues:', issues.length); issues.slice(0, 10).forEach(i => console.log(' ', i));
await browser.close();
