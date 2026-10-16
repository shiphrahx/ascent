// Count draw calls and triangles per frame (all passes) to see the geometry load.
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + (process.argv[2] || ''));
await page.waitForFunction('window.__dbg && window.__dbg.frames > 30', { timeout: 120000 });
const r = await page.evaluate(async () => {
  const R = window.__dbg.G.renderer; R.info.autoReset = false;
  const out = {};
  // per-pass: wrap render to attribute calls to the active camera/target
  const orig = R.render.bind(R);
  R.render = (scene, cam) => { const b = R.info.render.triangles, c = R.info.render.calls; orig(scene, cam); const k = cam.isOrthographicCamera ? (cam.right - cam.left > 3 ? 'shadow' : 'fullscreen') : (R.getRenderTarget() && R.getRenderTarget().width < 1000 ? 'reflect' : 'main'); out[k] = out[k] || { tris: 0, calls: 0 }; out[k].tris += R.info.render.triangles - b; out[k].calls += R.info.render.calls - c; };
  R.info.reset();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  for (const k in out) { out[k].tris = Math.round(out[k].tris / 2); out[k].calls = Math.round(out[k].calls / 2); }
  return out;
});
console.log(JSON.stringify(r));
await browser.close();
