// Screenshot harness: opens the built page in Edge, waits, captures frames and console output.
// usage: node tools/shot.mjs name "#hash" [waitMs] [name2 "#hash2" wait2 ...]
import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const file = 'file:///' + path.resolve('cappadocia.html').replace(/\\/g, '/');
const args = process.argv.slice(2);
const jobs = [];
for (let i = 0; i < args.length; i += 3) jobs.push({ name: args[i], hash: args[i + 1] || '', wait: +(args[i + 2] || 6000) });
fs.mkdirSync('shots', { recursive: true });

const W = +(process.env.W || 1600), H = +(process.env.H || 900), DPR = +(process.env.DPR || 1);
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: process.env.HEADFUL ? false : 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-features=CalculateNativeWinOcclusion', `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: DPR },
});
for (const job of jobs) {
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', r => logs.push(`[requestfailed] ${r.url()}`));
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) logs.push(`[external-request] ${r.url()}`); });
  const t0 = Date.now();
  await page.goto(file + job.hash, { waitUntil: 'load' });
  await page.waitForFunction('window.__dbg && window.__dbg.frames > 3', { timeout: 120000 }).catch(e => logs.push('[timeout] ' + e.message));
  const tReady = Date.now() - t0;
  await new Promise(r => setTimeout(r, job.wait));
  const info = await page.evaluate(() => {
    const d = window.__dbg; if (!d) return null;
    const gl = d.G.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { frames: d.frames, fps: d.fps, hour: d.sky.hour.toFixed(2), gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?', info: d.G.renderer.info.render, extra: d.extra ? d.extra() : null };
  }).catch(e => ({ err: e.message }));
  await page.screenshot({ path: `shots/${job.name}.png` });
  console.log(`== ${job.name} ready ${tReady}ms`, JSON.stringify(info));
  for (const l of logs) console.log('  ', l.slice(0, 400));
  await page.close();
}
await browser.close();
