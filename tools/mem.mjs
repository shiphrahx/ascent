// Watches memory over a long headful run while flying: JS heap, plus the working set of every
// Edge process (the GPU process holds the WebGL allocations). A steady climb means a leak.
// usage: node tools/mem.mjs [seconds]
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
import { execSync } from 'child_process';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = +(process.env.W || 2525), H = +(process.env.H || 1295);
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false, userDataDir: path.resolve('.memprofile'),
  args: [`--window-size=${W},${H + 80}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  defaultViewport: { width: W, height: H } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + (process.argv[3] || ''));
await page.waitForFunction('window.__dbg && window.__dbg.frames > 3', { timeout: 180000 });
const pid = browser.process().pid;
// all Edge processes started for this profile: the launcher's pid and its descendants
const procMB = () => {
  const out = execSync(`powershell -NoProfile -Command "$ids=@(${pid}); $all=Get-CimInstance Win32_Process; do { $n=$ids.Count; $ids=@($ids + ($all | ? { $ids -contains $_.ParentProcessId } | % ProcessId) | select -Unique) } while ($ids.Count -gt $n); ($all | ? { $ids -contains $_.ProcessId } | % { '{0} {1} {2}' -f $_.Name,($_.WorkingSetSize/1MB -as [int]),$_.CommandLine.Contains('--type=gpu-process') })"`).toString().trim().split(/\r?\n/);
  let total = 0, gpu = 0;
  for (const l of out) { const [, mb, g] = l.split(' '); total += +mb; if (g === 'True') gpu += +mb; }
  return { total, gpu };
};
const secs = +(process.argv[2] || 90);
await page.keyboard.down('KeyW');
for (let t = 0; t <= secs; t += 10) {
  const m = await page.metrics();
  const p = procMB();
  const e = await page.evaluate(() => window.__dbg.extra());
  console.log(`t=${String(t).padStart(3)}s heap=${(m.JSHeapUsedSize / 1048576).toFixed(0)}MB edge=${p.total}MB gpuProc=${p.gpu}MB fps=${e.fps} scale=${e.scale.toFixed(2)}`);
  if (t === 30) { await page.keyboard.up('KeyW'); await page.keyboard.down('KeyA'); }
  if (t === 50) { await page.keyboard.up('KeyA'); await page.keyboard.down('KeyW'); }
  await new Promise(r => setTimeout(r, 10000));
}
await browser.close();
