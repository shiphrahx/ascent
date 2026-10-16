// Headful run on the default GPU (like a normal browser launch), sampling fps, frame time,
// GPU resource counts, JS heap and the browser's total memory over time.
// usage: node tools/stress.mjs seconds [W H DPR] [hash]
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
import { execSync } from 'child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const secs = +(process.argv[2] || 60);
const W = +(process.argv[3] || 1440), H = +(process.argv[4] || 900), DPR = +(process.argv[5] || 2);
const hash = process.argv[6] || '';
const browser = await puppeteer.launch({
  executablePath: EDGE, headless: false,
  args: [...(process.env.SW ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []), `--window-size=${W},${H + 80}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: DPR },
});
const pid = browser.process().pid;
const memOf = () => {
  try {
    const out = execSync(`powershell -NoProfile -c "(Get-CimInstance Win32_Process | ? { $_.Name -eq 'msedge.exe' -and ($_.ParentProcessId -eq ${pid} -or $_.ProcessId -eq ${pid}) } | Measure-Object WorkingSetSize -Sum).Sum / 1MB"`).toString().trim();
    return Math.round(+out) + 'MB';
  } catch { return '?'; }
};
const page = await browser.newPage();
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + hash);
await page.waitForFunction('window.__dbg && window.__dbg.frames > 3', { timeout: 180000 });
console.log(`first frame after ${Date.now() - t0}ms`);
const gpu = await page.evaluate(() => { const gl = window.__dbg.G.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
console.log('GPU:', gpu);
for (let t = 0; t < secs; t += 5) {
  await new Promise(r => setTimeout(r, 5000));
  const s = await page.evaluate(() => {
    const d = window.__dbg, e = d.extra(), m = d.G.renderer.info.memory;
    const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB' : '?';
    return `fps=${e.fps} ms=${e.ms} scale=${e.scale} ${e.W}x${e.H} tex=${m.textures} geo=${m.geometries} heap=${heap} h=${d.sky.hour.toFixed(1)}`;
  });
  console.log(`t+${t + 5}s ${s} browserMem=${memOf()}`);
}
console.log('logs:', logs.length); logs.slice(0, 10).forEach(l => console.log(' ', l));
await browser.close();
