import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const tier=process.argv[2]??'medium',browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['warning','error'].includes(m.type()))errors.push(m.text());});
 const url=pathToFileURL(path.resolve('Ascent.html'));url.searchParams.set('quality',tier);
 await page.goto(url.href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});await page.waitForFunction(()=>__state.elapsed>1);
 await page.evaluate(()=>{const a=__ascent;a.pause();a.setHour(9);a.setStorm(0);a.hero.group.visible=false;const look=a.camera.lookAt;a.camera.lookAt=function(){this.position.set(-30,22,570);look.call(this,-42,3.55,480);};});await page.waitForTimeout(2000);
 const report=await page.evaluate(()=>{
  const a=__ascent,w=a.world,trees=w.trees,grass=w.grass;let count=0,rootError=0,invalid=0;const versions=[];
  for(const batch of trees.children){count+=batch.count;versions.push(batch.instanceMatrix.version);const e=batch.instanceMatrix.array;
   for(let i=0;i<batch.count;i++){const q=i*16;rootError=Math.max(rootError,Math.abs(e[q+13]+.3-a.ground(e[q+12],e[q+14])));}
   for(const n of batch.geometry.attributes.position.array)if(!Number.isFinite(n))invalid++;
  }
  const visibleNear=grass.group.children.filter(c=>c.visible).length;grass.update({position:{x:10000,z:10000}});const visibleFar=grass.group.children.filter(c=>c.visible).length;grass.update(a.camera);
  return {tier:a.tier.name,count,versions,rootError,invalid,poplars:trees.userData.vegetation,groundCover:grass.group.userData.vegetation,ecology:w.ecology.stats,grassCells:grass.group.children.length,visibleNear,visibleFar};
 });
 assert.equal(report.count,tier==='high'?720:tier==='lite'?320:480);assert(report.versions.every(v=>v===0));assert(report.rootError<.001&&report.invalid===0);assert(report.ecology.orchards>20&&report.ecology.scrub>=600);assert(report.ecology.maxRootError<.001&&report.ecology.minObstacleClearance>=3);assert(report.visibleNear>0&&report.visibleNear<report.grassCells);assert.equal(report.visibleFar,0);assert.deepEqual(errors,[]);
 if(tier==='medium')await page.screenshot({path:'captures/vegetation-medium-close.png'});
 await writeFile(`captures/vegetation-${tier}.json`,JSON.stringify({...report,errors},null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
