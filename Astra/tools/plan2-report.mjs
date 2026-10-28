import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const exists=async file=>{try{await access('captures/'+file);return true;}catch{return false;}};
const read=async file=>JSON.parse(await readFile('captures/'+file,'utf8'));
const buildSha256=createHash('sha256').update(await readFile('Ascent.html')).digest('hex');
const phases=['0-3','1-1','1-2','1-3','1-4','1-5','1-6','2','3-1','3-2','3-3','3-4','4-1','4-2','4-3','5-1','5-2','5-3','5-4'];
let html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Astra Plan 2 review</title><style>body{margin:24px;background:#1c2026;color:#e7e9ed;font:16px system-ui}a{color:#b9d7ff}h1,h2{font-weight:600}section{margin:32px 0}figure{margin:0}figcaption{padding:8px 0}img,video{width:100%;display:block}main{max-width:1600px;margin:auto}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}table{border-collapse:collapse}th,td{padding:8px 14px;border-bottom:1px solid #4a515a;text-align:right}th:first-child,td:first-child{text-align:left}code{overflow-wrap:anywhere}@media(max-width:750px){.pair{grid-template-columns:1fr}}</style><main><h1>Astra — Plan 2 review</h1><p>Matched sunrise captures at 6.55 hours. Full numerical results and remaining acceptance limits are in <a href="../FIDELITY_PLAN_2.md">the plan</a>.</p><p>Current build: <code>'+buildSha256+'</code></p>';
const figure=(file,label)=>`<figure><figcaption>${label}</figcaption><img loading="lazy" src="${file}"></figure>`;
let previous=null;
for(const phase of phases){
 const file=`plan2-${phase}-sunrise.png`;
 if(!await exists(file))continue;
 if(previous)html+=`<section><h2>Task ${phase.replaceAll('-','.')}</h2><div class="pair">${figure(previous.file,'Before — '+previous.phase)}${figure(file,'After — '+phase)}</div><p><a href="plan2-validation-${phase}.json">Regression checks and build hash</a></p></section>`;
 previous={file,phase};
}
if(await exists('plan2-camera-before-300.png')&&await exists('plan2-camera-after-300.png'))html+='<section><h2>Chase-camera framing during a turn</h2><div class="pair">'+figure('plan2-camera-before-300.png','Before')+figure('plan2-camera-after-300.png','After')+'</div></section>';
for(const view of ['terrain','river','snow'])if(await exists('plan2-detail-'+view+'-after-'+view+'.png'))html+='<section><h2>'+view+' detail</h2><div class="pair">'+figure('plan2-detail-'+view+'-before-'+view+'.png','Before')+figure('plan2-detail-'+view+'-after-'+view+'.png','After')+'</div></section>';
const poses=['sunrise','midday','snowstorm','golden-hour','sunset','night'];
for(const pose of poses)if(await exists(`plan2-final-after-${pose}.png`))html+=`<section><h2>${pose}</h2><div class="pair">${figure('plan2-final-before-'+pose+'.png','Baseline')}${figure('plan2-final-after-'+pose+'.png','Final')}</div></section>`;
if(await exists('plan2-flight.webm'))html+='<section><h2>Scripted flight</h2><video controls preload="metadata" src="plan2-flight.webm" poster="plan2-flight-end.png"></video></section>';
const tiers=[];
for(const tier of['lite','medium','high']){
 const file=`benchmark-flight-native-${tier}-plan2-final.json`;
 if(!await exists(file))continue;
 const row=(await read(file))[0];if(row.buildSha256!==buildSha256)throw Error('Stale final pacing report: '+tier);tiers.push(row);
}
if(tiers.length)html+='<section><h2>Final pacing at 1440 × 900, DPR 1</h2><table><tr><th>Tier</th><th>FPS</th><th>Median ms</th><th>p95 ms</th><th>p99 ms</th><th>&gt;25 ms</th></tr>'+tiers.map(r=>`<tr><td>${r.tier}</td><td>${r.fps.toFixed(2)}</td><td>${r.medianFrameMs.toFixed(2)}</td><td>${r.p95FrameMs.toFixed(2)}</td><td>${r.p99FrameMs.toFixed(2)}</td><td>${r.framesOver25ms}/${r.frameCount}</td></tr>`).join('')+'</table></section>';
if(await exists('plan2-final-metrics.json')){
 const metrics=await read('plan2-final-metrics.json');if(metrics.buildSha256!==buildSha256)throw Error('Stale final stability metrics');
 html+='<section><h2>Stability measurements</h2><p>The 70% landscape-flicker reduction target remains open. The owner authorized proceeding with the remaining visual work while retaining this shortfall.</p><table><tr><th>Tier</th><th>Largest light jump (levels)</th><th>D whole / foreground RMS</th><th>D reduction whole / foreground</th></tr>'+metrics.rows.map(r=>'<tr><td>'+r.tier+'</td><td>'+Math.max(...Object.values(r.jumps)).toFixed(3)+'</td><td>'+r.cases.D.whole.toFixed(6)+' / '+r.cases.D.foreground.toFixed(6)+'</td><td>'+(r.reductions.whole*100).toFixed(1)+'% / '+(r.reductions.foreground*100).toFixed(1)+'%</td></tr>').join('')+'</table><p><a href="plan2-final-metrics.json">Full final summary and build hash</a></p></section>';
}
html+='</main>';await writeFile('captures/plan2-comparison.html',html);
console.log('Created captures/plan2-comparison.html');
