// Per-object triangle budget for the current frame (index count x instance count).
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + (process.argv[2] || ''));
await page.waitForFunction('window.__dbg && window.__dbg.frames > 30', { timeout: 120000 });
const rows = await page.evaluate(() => {
  const out = [];
  window.__dbg.scene.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry;
    const per = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const n = o.isInstancedMesh ? o.count : (g.isInstancedBufferGeometry ? g.instanceCount : 1);
    const caster = o.layers.test({ mask: 2 }) ? 'C' : ' ';
    let name = o.parent && o.parent.type === 'Group' ? 'group' : '';
    out.push({ tris: Math.round(per * n), per: Math.round(per), n, caster, layer: o.layers.mask, name: (o.material.defines && Object.keys(o.material.defines).join(',')) || '' });
  });
  return out.sort((a, b) => b.tris - a.tris).slice(0, 25);
});
for (const r of rows) console.log(String(r.tris).padStart(9), String(r.per).padStart(7), 'x', String(r.n).padEnd(6), r.caster, r.layer, r.name);
await browser.close();
