// Which shader programs the driver warned about, with their loops and lookups, to find the GLSL
// behind a D3D warning like X3595. usage: node tools/shaderwarn.mjs (HP=1 for the RTX)
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--use-angle=d3d11', ...(process.env.HP ? ['--force_high_performance_gpu'] : []), '--enable-gpu'], defaultViewport: { width: 1600, height: 900 } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + '#h=15&freeze&res=1');
await page.waitForFunction('window.__dbg && window.__dbg.frames > 30', { timeout: 180000 });
const r = await page.evaluate(() => {
  const R = window.__dbg.G.renderer, gl = R.getContext(), out = [];
  for (const p of R.info.programs) {
    const log = gl.getProgramInfoLog(p.program) || '';
    if (!/X3595/.test(log)) continue;
    const srcs = gl.getAttachedShaders(p.program).map(x => [gl.getShaderParameter(x, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER ? 'FS' : 'VS', gl.getShaderSource(x)]);
    for (const [k, src] of srcs) {
      const lines = src.split('\n').filter(l => /texture\(|for \(|break;|continue;/.test(l));
      out.push(log.slice(0, 30) + ' ' + k + '\n' + lines.slice(0, 30).join('\n'));
    }
  }
  return out;
});
console.log(r.join('\n-----\n'));
await browser.close();
