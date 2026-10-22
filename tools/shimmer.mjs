// Flicker benchmark. Two 5 second captures at a fixed 60 steps per second, every frame read back:
//   A: sun frozen, the shadow cascades sliding at balloon speed as if the camera moved
//   B: camera still, sun moving at the normal timelapse rate
// Prints the mean frame-to-frame luma change the smooth trend doesn't explain (second difference along
// each surface point's motion, 8-bit levels) over the whole frame and over a cliff-heavy crop. Lower is steadier. Runs on the shadow-only view by default
// (textures moving past the camera score too, and would bury the shadow numbers); FULL=1 for the image.
// usage: node tools/shimmer.mjs [A|B|C|P|F|K]   (F runs 60 s; N sets the frame count)   (env CAM overrides the view hash, RUNS repeats each test,
// SHOT=1 also saves the last frame and a heat map of where it flickered, EXTRA appends to the hash, e.g.
// EXTRA='&nocontact' for an A/B. Every test also splits its score by source: hero, fleet, ground, ...)
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
  // the real thing: the chase camera following the balloon's own flight, sun moving. Camera motion
  // means edges score too, so compare runs of F with each other rather than with A and B.
  F: `#h=15&sim=60&hold&fixdt&res=1`,
  // clouds: still camera looking up at the cloud layer, scored on the sky, full image
  K: `#h=16.9&fixdt&res=1&cam=0,260,0&look=2000,900,-600`,
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
  await page.evaluate((c, n, sky) => window.__dbg.shimmer(n, c, sky), t === 'K' ? [0, 0, 1, 0.5] : CROP, +(process.env.N || (t === 'F' ? 3600 : 300)), t === 'K');
  await page.waitForFunction('window.__dbg.shimmerResult()', { timeout: 3600000, polling: 1000 });
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
// SPIKES=1: frames that score well above their neighbours (a one-frame tick, such as a cascade jump)
const spikes = (r) => {
  const s = r.series, out = [];
  for (let i = 2; i < s.length - 2; i++) {
    const near = [s[i - 2], s[i - 1], s[i + 1], s[i + 2]].sort((a, b) => a - b), m = (near[1] + near[2]) / 2;
    if (s[i] > m * 1.25 + 0.02) out.push(`${i}:+${(s[i] - m).toFixed(2)}`);
  }
  return `${out.length} spikes ${out.slice(0, 12).join(' ')}`;
};
console.log('frame / crop, 8-bit levels' + (process.env.FULL ? ', full image' : ''));
for (const t of pick) for (let run = 0; run < +(process.env.RUNS || 1); run++) {
  if (process.env.FULL || t === 'K') { console.log(`${t}: ${f(await capture(t, ''))}`); continue; }
  // the flat-grey run scores everything that isn't the shadows (haze, the temporal resolve, edges
  // at the reprojection's limits); what the shadow view scores above that is the shadow flicker
  // VIEW=terrain scores the heightmap shadow alone: fixed in the world, so whatever it scores is the
  // metric's own response to shadow edges moving across the screen, not flicker
  const sv = '&shadowview' + (process.env.VIEW ? '=' + process.env.VIEW : '');
  const s = await capture(t, sv), c = await capture(t, '&shadowview=flat');
  console.log(`${t}: shadows ${f(s)}   flat ${f(c)}   flicker ${(s.frame - c.frame).toFixed(2)} / ${(s.crop - c.crop).toFixed(2)}   (${(s.valid * 100).toFixed(0)}% scored)`);
  // a moving camera slides every crisp shadow edge across the screen, and the score rises with that
  // even when nothing changes. So F also runs with the cascades held still in the world, and what
  // the live cascades add on top of that is the flicker.
  let h = null;
  if (t === 'F') {
    h = await capture(t, sv + '&shadowhold');
    console.log(`   held cascades ${f(h)}   flicker over held ${(s.frame - h.frame).toFixed(2)} / ${(s.crop - h.crop).toFixed(2)}`);
  }
  if (process.env.SPIKES) console.log(`   shadows ${spikes(s)}
   flat    ${spikes(c)}`);
  // per source (tests that move the camera mostly): shadow view, flat control, and what's left over
  if (s.sources) for (let i = 0; i < s.sources.length; i++) {
    const a = s.sources[i], b = c.sources[i], o = h ? h.sources[i] : null;
    if (a.area < 0.001) continue;
    console.log(`   ${a.name.padEnd(14)} ${a.score.toFixed(2)} - ${b.score.toFixed(2)} = ${(a.score - b.score).toFixed(2)}` + (o ? `   over held ${(a.score - o.score).toFixed(2)}` : '') + `   ${(a.area * 100).toFixed(1).padStart(5)}% of pixels, ${(a.share * 100).toFixed(0).padStart(3)}% of the shadow view's flicker`);
  }
}
await browser.close();
