// What each shadow cascade draws: per caster mesh, its instance count and vertex count, for the
// layers each cascade camera sees. usage: node tools/casters.mjs ["#hash"] (HP=1 for the RTX)
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=d3d11', ...(process.env.HP ? ['--force_high_performance_gpu'] : []), '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1600, height: 900 } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + (process.argv[2] || '#h=15&sim=200'));
await page.waitForFunction('window.__dbg && window.__dbg.frames > 30', { timeout: 180000 });
const r = await page.evaluate(() => {
  const out = [];
  window.__dbg.scene.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const lay = [1, 3, 5].filter(l => o.layers.isEnabled(l));
    if (!lay.length) return;
    const g = o.geometry, v = g.index ? g.index.count : g.attributes.position.count;
    const n = o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1;
    out.push({ name: (o.parent && o.parent.type !== 'Scene' ? 'child ' : '') + (o.material.type) + ' ' + (o.name || ''), lay: lay.join(','), n, v, total: n * v });
  });
  return out.sort((a, b) => b.total - a.total).slice(0, 20);
});
console.log('layers  instances  indices/inst  total');
for (const x of r) console.log(x.lay.padEnd(7), String(x.n).padStart(9), String(x.v).padStart(13), String(x.total).padStart(10), x.name);
await browser.close();
