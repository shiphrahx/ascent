// Frame pacing: flies the balloon by hand for 30 s straight, then 30 s weaving left and right along
// the valley (the river swings in and out of view), logging every frame's interval, CPU and GPU time,
// render scale and which occasional passes ran. Smooth means even frame times, not a good average.
// Headful on the default GPU like a normal launch; HP=1 for the RTX.
// usage: node tools/pacing.mjs ["#hash"] [seconds per leg]
import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// Cassia's window by default (her screenshots come out 2532x1293)
const W = +(process.env.W || 2525), H = +(process.env.H || 1295), DPR = +(process.env.DPR || 1);
const secs = +(process.argv[3] || 30);
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false,
  args: [...(process.env.HP ? ['--force_high_performance_gpu'] : []), `--window-size=${W},${H + 80}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: DPR } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + (process.argv[2] || '#h=15'));
await page.waitForFunction('window.__dbg && window.__dbg.frames > 3', { timeout: 180000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
// shader compiles and the resolution governor settle first
await wait(12000);
const info = await page.evaluate(() => { const gl = window.__dbg.G.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)).replace(/ANGLE \(|Direct3D.*$/g, '') + ' tier ' + window.__dbg.G.tier; });
console.log(info, `${W}x${H}@${DPR}`);

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = x => x === undefined || x === null ? '-' : x.toFixed(1);
function report(name, r) {
  const dt = r.map(e => e.dt), cpu = r.map(e => e.cpu), gpu = r.map(e => e.gpu).filter(x => x !== null);
  // the alternating part of the frame time: how much odd frames differ from even ones on average
  let alt = 0;
  for (let i = 1; i < dt.length - 1; i++) alt += (i & 1 ? 1 : -1) * (dt[i] - (dt[i - 1] + dt[i + 1]) / 2);
  alt = Math.abs(alt / (dt.length - 2));
  let altG = 0, nG = 0;
  for (let i = 1; i < r.length - 1; i++) if (r[i].gpu !== null && r[i - 1].gpu !== null && r[i + 1].gpu !== null) { altG += (i & 1 ? 1 : -1) * (r[i].gpu - (r[i - 1].gpu + r[i + 1].gpu) / 2); nG++; }
  altG = Math.abs(altG / Math.max(1, nG));
  const scales = r.filter((e, i) => i && e.scale !== r[i - 1].scale).map(e => e.scale);
  console.log(`== ${name}: ${r.length} frames`);
  console.log(`   interval  median ${f1(q(dt, 0.5))}  p95 ${f1(q(dt, 0.95))}  p99 ${f1(q(dt, 0.99))}  max ${f1(Math.max(...dt))}  over 20 ms ${dt.filter(x => x > 20).length}  odd/even ${f1(alt)}`);
  console.log(`   cpu       median ${f1(q(cpu, 0.5))}  p95 ${f1(q(cpu, 0.95))}  p99 ${f1(q(cpu, 0.99))}  max ${f1(Math.max(...cpu))}`);
  if (gpu.length) console.log(`   gpu       median ${f1(q(gpu, 0.5))}  p95 ${f1(q(gpu, 0.95))}  p99 ${f1(q(gpu, 0.99))}  max ${f1(Math.max(...gpu))}  odd/even ${f1(altG)}  (${gpu.length} timed)`);
  console.log(`   scale     ${r[0].scale} -> ${r[r.length - 1].scale}, ${scales.length} changes ${scales.slice(0, 10).join(' ')}`);
  // what the occasional passes cost: frames with the tag against frames without
  const tags = new Set(r.flatMap(e => e.tags ? e.tags.split(' ') : []));
  for (const t of tags) {
    const w = r.filter(e => e.tags.split(' ').includes(t)), wo = r.filter(e => !e.tags.split(' ').includes(t));
    const mg = a => { const g = a.map(e => e.gpu).filter(x => x !== null); return g.length ? q(g, 0.5) : null; };
    console.log(`   ${t.padEnd(12)} in ${(w.length / r.length * 100).toFixed(0).padStart(3)}% of frames   gpu with ${f1(mg(w))} without ${f1(mg(wo))}   cpu with ${f1(q(w.map(e => e.cpu), 0.5))} without ${f1(q(wo.map(e => e.cpu), 0.5))}`);
  }
}

const legs = [
  ['straight', [['KeyW', secs * 1000]]],
  // weave: turns long enough to swing the view across the valley and back
  ['side to side', Array.from({ length: Math.round(secs / 2.5) }, (_, i) => [i & 1 ? 'KeyW+KeyD' : 'KeyW+KeyA', 2500])],
];
const out = {};
for (const [name, seq] of legs) {
  await page.evaluate(() => window.__dbg.paceStart());
  for (const [k, ms] of seq) {
    const keys = k.split('+');
    for (const kk of keys) await page.keyboard.down(kk);
    await wait(ms);
    for (const kk of keys) await page.keyboard.up(kk);
  }
  const r = await page.evaluate(() => window.__dbg.paceStop());
  report(name, r);
  out[name] = r;
}
if (process.env.LOG) fs.writeFileSync(process.env.LOG, JSON.stringify(out));
if (errs.length) console.log('errors', errs);
await browser.close();
