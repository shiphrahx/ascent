// Flicker benchmark. Two 5 second captures at a fixed 60 steps per second, every frame read back:
//   A: sun frozen, camera sliding sideways at balloon speed
//   B: camera still, sun moving at the normal timelapse rate
// Prints the mean unexplained frame-to-frame luma change (second difference, 8-bit levels) over the
// whole frame and over a cliff-heavy crop. Lower is steadier. Runs on the shadow-only view by default
// (textures moving past the camera score too, and would bury the shadow numbers); FULL=1 for the image.
// usage: node tools/shimmer.mjs [A|B|C]   (env CAM overrides the view hash, RUNS repeats each test)
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = 1600, H = 900;
const CAM = process.env.CAM || 'at=church&d=150&up=55';
const CROP = (process.env.CROP || '0.05,0.05,0.95,0.6').split(',').map(Number);
const tests = {
  A: `#h=15&freeze&hold&fixdt&res=1&${CAM}&pan=5,0,0`,
  B: `#h=15&hold&fixdt&res=1&${CAM}`,
  // reference: nothing moves, so this is the floor the jitter and the noise leave behind
  C: `#h=15&freeze&fixdt&res=1&${CAM}`,
};
const pick = process.argv[2] ? [process.argv[2]] : ['A', 'B'];
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new',
  args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 } });
const url = pathToFileURL(path.resolve('cappadocia.html')).href;
for (const t of pick) for (let run = 0; run < +(process.env.RUNS || 1); run++) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(url + tests[t] + (process.env.FULL ? '' : '&shadowview') + (process.env.EXTRA || ''));
  await page.waitForFunction('window.__dbg && window.__dbg.frames > 3', { timeout: 180000 });
  // let shader compiles finish and the temporal history settle
  await new Promise(r => setTimeout(r, 5000));
  await page.evaluate(c => window.__dbg.shimmer(300, c), CROP);
  await page.waitForFunction('window.__dbg.shimmerResult()', { timeout: 300000, polling: 500 });
  const r = await page.evaluate(() => window.__dbg.shimmerResult());
  if (process.env.SHOT) await page.screenshot({ path: `shots/shimmer_${t}.png` });
  console.log(`${t}: frame ${r.frame.toFixed(3)}  crop ${r.crop.toFixed(3)}  (${r.frames} frames)${errs.length ? ' errors: ' + errs.join('; ') : ''}`);
  await page.close();
}
await browser.close();
