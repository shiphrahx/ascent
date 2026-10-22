// A/B a runtime toggle in one session, alternating several times so laptop GPU throttling drifts
// out of the comparison. Reports the mean GPU ms of one pass under each setting.
// usage: node tools/ab.mjs "#h=14.5" pass "jsA" "jsB" [rounds]
import puppeteer from 'puppeteer-core';
import path from 'path';
import { pathToFileURL } from 'url';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = +(process.env.W || 2525), H = +(process.env.H || 1295);
const [hash, pass, A, B, rounds = 4] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: EDGE, headless: false,
  args: [...(process.env.HP ? ['--force_high_performance_gpu'] : []), `--window-size=${W},${H + 80}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  defaultViewport: { width: W, height: H } });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve('cappadocia.html')).href + hash + `&gpuprof&res=${process.env.RES || 1}`);
await page.waitForFunction('window.__dbg && window.__dbg.frames > 3', { timeout: 180000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(6000);
const res = { A: [], B: [] };
for (let i = 0; i < +rounds; i++) for (const [k, js] of [['A', A], ['B', B]]) {
  await page.evaluate(js);
  await wait(3500);
  const r = await page.evaluate(() => window.__dbg.gpu());
  res[k].push(pass === 'total' ? r.total : r[pass]);
}
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
// the median holds up better when the laptop throttles partway through
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length & 1 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
console.log(`${pass}: A=${mean(res.A).toFixed(2)}ms B=${mean(res.B).toFixed(2)}ms  median A=${med(res.A).toFixed(2)} B=${med(res.B).toFixed(2)}  (A ${res.A.join(' ')} | B ${res.B.join(' ')})`);
await browser.close();
