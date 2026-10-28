import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const buildSha256=createHash('sha256').update(await readFile('Ascent.html')).digest('hex');
const baselineSha256=createHash('sha256').update(await readFile('captures/plan2-baseline.html')).digest('hex');
const read=async file=>JSON.parse(await readFile('captures/'+file,'utf8'));
const rows=[];
for(const tier of['lite','medium','high']){
 const light=await read('plan2-light-'+tier+'-final.json'),flicker=await read('plan2-flicker-'+tier+'-final.json');
 const baseline=await read('plan2-flicker-'+tier+'-baseline-isolated.json');
 const pacing=(await read('benchmark-flight-native-'+tier+'-plan2-final.json'))[0];
 for(const report of[light,flicker,pacing]){
  if(report.buildSha256!==buildSha256)throw Error('Stale final report: '+tier);
  if(report.errors.length)throw Error('Browser errors: '+tier);
 }
 if(!flicker.independentScenes||!baseline.independentScenes||baseline.buildSha256!==baselineSha256||baseline.errors.length)throw Error('Use independent, identically seeded cases');
 for(const name of ['A','B','C','D'])if(!flicker.cases[name]||Math.abs(flicker.cases[name].simulationStart-100)>1e-5)throw Error('Missing or incorrectly seeded case '+name);
 if(Math.abs(baseline.cases.D.simulationStart-100)>1e-5)throw Error('Incorrect baseline seed');
 const jumps=Object.fromEntries(Object.entries(light.signals).map(([name,s])=>[name,s.largestDetrendedJump]));
 const peak=light.signals.envelope.peaks[0],d=flicker.cases.D,b=baseline.cases.D;
 const reductions={whole:1-d.wholeRms/b.wholeRms,foreground:1-d.cliffRms/b.cliffRms};
 rows.push({tier,jumps,envelopePeak:peak,cases:Object.fromEntries(Object.entries(flicker.cases).map(([name,c])=>[name,{whole:c.wholeRms,foreground:c.cliffRms,simulationStart:c.simulationStart}])),baselineD:{whole:b.wholeRms,foreground:b.cliffRms},reductions,pacing:{fps:pacing.fps,median:pacing.medianFrameMs,p95:pacing.p95FrameMs,p99:pacing.p99FrameMs,over25:pacing.framesOver25ms,frames:pacing.frameCount},lightJumpTargetMet:Math.max(...Object.values(jumps))<.5,flickerTargetMet:Math.min(...Object.values(reductions))>=.7,pacingP99TargetMet:pacing.p99FrameMs<=pacing.medianFrameMs*1.5});
}
await writeFile('captures/plan2-final-metrics.json',JSON.stringify({buildSha256,rows},null,2));
const fixed=(x,n=3)=>x.toFixed(n),pair=c=>fixed(c.whole,6)+' / '+fixed(c.foreground,6);
let text='### Final per-tier measurements\n\nAll final traces use build `'+buildSha256+'`, the Radeon 890M, 1440 x 900 and DPR 1. Light values are display-luminance levels; flicker values are linear-luminance RMS. Raw reports retain every frame.\n\n';
text+='| Tier | Whole jump | Envelope jump | Ground jump | Far jump | Largest envelope 1–10 Hz maximum (amplitude / Hz) |\n|---|---:|---:|---:|---:|---:|\n';
for(const r of rows)text+='| '+r.tier+' | '+['whole','envelope','ground','far'].map(k=>fixed(r.jumps[k])).join(' | ')+' | '+fixed(r.envelopePeak.amplitude)+' / '+fixed(r.envelopePeak.hz,2)+' |\n';
text+='\nNonzero spectral maxima are reported explicitly. The strong original 3 Hz burner modulation was removed; this is not a claim of a mathematically zero spectrum.\n\n';
text+='| Tier | A whole / foreground | B whole / foreground | C whole / foreground | D whole / foreground |\n|---|---:|---:|---:|---:|\n';
for(const r of rows)text+='| '+r.tier+' | '+['A','B','C','D'].map(k=>pair(r.cases[k])).join(' | ')+' |\n';
text+='\n| Tier | Archived-build D whole / foreground | Final D whole / foreground | Reduction whole / foreground |\n|---|---:|---:|---:|\n';
for(const r of rows)text+='| '+r.tier+' | '+pair(r.baselineD)+' | '+pair(r.cases.D)+' | '+fixed(r.reductions.whole*100,1)+'% / '+fixed(r.reductions.foreground*100,1)+'% |\n';
text+='\nThe 70% flicker requirement remains a separate acceptance gate; the owner authorized continuing visual work while reporting the shortfall. Baseline and final cases use fresh scenes, simulation time 100, identical cameras and exposure, and a completed opening fade.\n\n';
text+='| Tier | FPS | Median ms | p95 ms | p99 ms | Frames >25 ms | p99 / median |\n|---|---:|---:|---:|---:|---:|---:|\n';
for(const r of rows){const p=r.pacing;text+='| '+r.tier+' | '+fixed(p.fps,2)+' | '+fixed(p.median,2)+' | '+fixed(p.p95,2)+' | '+fixed(p.p99,2)+' | '+p.over25+'/'+p.frames+' | '+fixed(p.p99/p.median,2)+' |\n';}
text+='\nThese are measured 30-second runs, not guarantees for every device, camera or long session. Medium is the default tier on this integrated GPU; high retains its larger rendering budget.\n';
const file='FIDELITY_PLAN_2.md',start='<!-- plan2-final-metrics:start -->',end='<!-- plan2-final-metrics:end -->';
let document=await readFile(file,'utf8');const block=start+'\n'+text+end;
if(document.includes(start)){const a=document.indexOf(start),b=document.indexOf(end,a);if(b<0)throw Error('Unclosed results marker');document=document.slice(0,a)+block+document.slice(b+end.length);}else document+='\n\n'+block+'\n';
await writeFile(file,document);console.log(JSON.stringify({buildSha256,rows},null,2));
