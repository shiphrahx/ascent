// Flicker benchmark. Two 5 second captures at a fixed 60 steps per second, every frame read back:
//   A: sun frozen, the shadow cascades sliding at balloon speed as if the camera moved
//   B: camera still, sun moving at the normal timelapse rate
// Prints the mean frame-to-frame luma change the smooth trend doesn't explain (second difference along
// each surface point's motion, 8-bit levels) over the whole frame and over a cliff-heavy crop. Lower is steadier. Runs on the shadow-only view by default
// (textures moving past the camera score too, and would bury the shadow numbers); FULL=1 for the image.
// usage: node tools/shimmer.mjs [A|B|C|P]   (env CAM overrides the view hash, RUNS repeats each test,
// SHOT=1 also saves the last frame and a heat map of where it flickered)
import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = 1600, H = 900;
const CAM = process.env.CAM || 'at=church&d=150&up=55';
const CROP = (process.env.CROP || '0.05,0.05,0.95,0.6').split(',').map(Number);
const tests = {
  // the camera stays still: sliding it past hard edges scores high even when nothing flickers, as
  // the reprojection resamples them. Sliding the shadow centres alone is what a moving balloon does
  // to the shadows. P is the camera really panning, for the whole picture.
  A: `#h=15&freeze&hold&fixdt&res=1&${CAM}&shadowpan=4,3`,
  P: `#h=15&freeze&hold&fixdt&res=1&${CAM}&pan=5,0,0`,
  B: `#h=15&hold&fixdt&res=1&${CAM}`,
  // reference: nothing moves, so this is the floor the jitter and the noise leave behind
  C: `#h=15&freeze&fixdt&res=1&${CAM}`,
};
const pick = process.argv[2] ? [process.argv[2]] : ['A', 'B'];
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new',
  args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 } });
const url = pathToFileURL(path.resolve('cappadocia.html')).href;
const capture = async (t, view) => {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(url + tests[t] + view + (process.env.EXTRA || ''));
  await page.waitForFunction('window.__dbg && window.__dbg.frames > 3', { timeout: 180000 });
  // let shader compiles finish and the temporal history settle
  await new Promise(r => setTimeout(r, 5000));
  await page.evaluate(c => window.__dbg.shimmer(300, c), CROP);
  await page.waitForFunction('window.__dbg.shimmerResult()', { timeout: 300000, polling: 500 });
  const r = await page.evaluate(() => window.__dbg.shimmerResult());
  if (process.env.SHOT && view !== '&shadowview=flat') {
    await page.screenshot({ path: `shots/shimmer_${t}.png` });
    const png = await page.evaluate(() => window.__dbg.shimmerMap());
    fs.writeFileSync(`shots/shimmer_${t}_heat.png`, Buffer.from(png.split(',')[1], 'base64'));
  }
  if (errs.length) console.log('  errors:', errs.join('; '));
  await page.close();
  return r;
};
const f = (r) => `${r.frame.toFixed(2)} / ${r.crop.toFixed(2)}`;
console.log('frame / crop, 8-bit levels' + (process.env.FULL ? ', full image' : ''));
for (const t of pick) for (let run = 0; run < +(process.env.RUNS || 1); run++) {
  if (process.env.FULL) { console.log(`${t}: ${f(await capture(t, ''))}`); continue; }
  // the flat-grey run scores everything that isn't the shadows (haze, the temporal resolve, edges
  // at the reprojection's limits); what the shadow view scores above that is the shadow flicker
  const s = await capture(t, '&shadowview'), c = await capture(t, '&shadowview=flat');
  console.log(`${t}: shadows ${f(s)}   flat ${f(c)}   flicker ${(s.frame - c.frame).toFixed(2)} / ${(s.crop - c.crop).toFixed(2)}   (${(s.valid * 100).toFixed(0)}% scored)`);
}
await browser.close();
