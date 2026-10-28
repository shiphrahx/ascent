import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/landforms.js',import.meta.url),'utf8');
const {terraceHeight,valleyErosion,valleyTalus}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
for(const [x,z]of [[0,0],[-900,1400],[780,-1200]]){
 let previous=-Infinity,ledges=0,cliffs=0;
 for(let h=0;h<250;h+=.1){
  const y=terraceHeight(h,x,z),slope=(terraceHeight(h+.1,x,z)-y)/.1;
  assert(Number.isFinite(y)&&y>=previous,'Terracing preserves height order without folds');
  assert(Math.abs(y-h)<12,'Terrace displacement stays within one geological bed');
  if(slope<.25)ledges++;if(slope>2)cliffs++;previous=y;
 }
 assert(ledges>500&&cliffs>200,'The field has both shelves and steep bedding transitions');
}
for(let z=-1500;z<=1500;z+=7){
 assert.equal(valleyErosion(0,z,0),0,'The central flight/river corridor stays clear');
 assert.equal(valleyTalus(0,z,0),0,'Talus does not fill the central corridor');
 for(const d of [-400,-180,180,400])assert(valleyErosion(d,z,d)>=0,'Drainage removes material');
}
let nearCuts=0,nearFans=0;
for(let z=-1200;z<=1200;z+=8)for(const d of[-70,-40,40,70]){
 if(valleyErosion(d,z,d)>1)nearCuts++;
 const fan=valleyTalus(d,z,d);assert(fan>=0&&fan<=3.5);
 if(fan>.5)nearFans++;
}
assert(nearCuts>120&&nearFans>200,'Gullies and talus reach the near flight corridor');
console.log('Landforms: finite monotone strata, ledges, cliffs and protected river corridor passed.');
