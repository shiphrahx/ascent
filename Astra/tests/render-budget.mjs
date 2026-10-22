import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {QUALITY_TIERS}=await import('data:text/javascript;base64,'+Buffer.from(await readFile('src/quality.js','utf8')).toString('base64'));
const source=await readFile('src/rendering.js','utf8'),code=source.slice(source.indexOf('export function renderPixelRatio')).replace('export ','');
const renderPixelRatio=new Function('QUALITY_TIERS',code+';return renderPixelRatio;')(QUALITY_TIERS);
for(const tier of Object.values(QUALITY_TIERS))for(const dpr of [1,2])for(const quality of [.4,1]){
 const native=renderPixelRatio(1440,900,dpr,quality,tier);assert(native>=1);assert(native<=dpr);
 for(const [w,h]of [[1440,900],[2848,1590],[3840,2160]]){
  const ratio=renderPixelRatio(w,h,dpr,quality,tier);assert(w*h*ratio*ratio<=tier.pixelBudget+1);assert(ratio>0);
  if(w*h>tier.pixelBudget)assert.equal(ratio,renderPixelRatio(w,h,dpr,1,tier),'Oversized windows keep a fixed scale when quality adapts');
 }
}
console.log('Render budgets: native 1440 x 900 floor, per-tier caps and stable oversized-window scaling passed.');
