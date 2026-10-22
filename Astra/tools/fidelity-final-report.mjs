import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const buildSha256=createHash('sha256').update(await readFile('Ascent.html')).digest('hex');
const read=async file=>JSON.parse(await readFile('captures/'+file,'utf8'));
const validation=await read('fidelity-8-validation.json');assert.equal(validation.buildSha256,buildSha256);
const pacing=[];
for(const [label,file]of [
 ['Medium native','benchmark-flight-native-medium-final.json'],
 ['Lite native','benchmark-flight-native-lite-final.json'],
 ['High native on 890M','benchmark-flight-native-high-final.json'],
 ['Medium oversized window','benchmark-flight-recording-medium-final.json'],
 ['High DPR 2 on 890M','benchmark-flight-native-high-final-retina.json']
]){
 const rows=await read(file);assert.equal(rows.length,1);const {samples,...result}=rows[0];assert.equal(result.buildSha256,buildSha256);assert.equal(result.file,'Ascent.html');assert.deepEqual(result.errors,[]);
 pacing.push({label,report:file,...result,framesOver16_8ms:samples.filter(s=>s.ms>16.8).length});
}
const flicker=[];
for(const tier of ['medium','lite','high']){
 const file=`flicker-${tier}-final.json`,{samples,...result}=await read(file);assert.equal(result.buildSha256,buildSha256);assert.deepEqual(result.errors,[]);assert.equal(result.scoredFrames,299);flicker.push({report:file,...result});
}
const lighting=await read('fidelity-final-after.json');assert.equal(lighting.buildSha256,buildSha256);assert.equal(lighting.report.length,6);assert.deepEqual(lighting.errors,[]);
const result={buildSha256,validation:'fidelity-8-validation.json',comparison:'fidelity-final-comparison.html',pacing,flicker,limitations:['All measurements use the Radeon 890M; discrete-GPU high-tier performance has not been certified.','No skipped application render is not proof that a separate screen recorder never duplicates frames.','Scene flicker scores include geometry/disocclusion/contrast changes and are not ground-truth shimmer measurements.']};
await writeFile('captures/fidelity-final-metrics.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({buildSha256,pacing:pacing.map(({label,fps,p95FrameMs,p99FrameMs,framesOver25ms,frameCount,renderSize,observerFramesWithoutRender})=>({label,fps,p95FrameMs,p99FrameMs,framesOver25ms,frameCount,renderSize,observerFramesWithoutRender})),flicker:flicker.map(({tier,wholeRms,cliffRms})=>({tier,wholeRms,cliffRms}))},null,2));
