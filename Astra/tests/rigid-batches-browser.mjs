import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const tier=process.argv[2]??'medium',browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['warning','error'].includes(m.type()))errors.push(m.text());});
 const url=pathToFileURL(path.resolve('Ascent.html'));url.searchParams.set('quality',tier);await page.goto(url.href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});await page.waitForFunction(()=>__state.elapsed>1);
 const results=[];
 for(const heroVisible of [true,false,true]){
  await page.evaluate(visible=>{__ascent.hero.group.visible=visible;},heroVisible);await page.waitForTimeout(250);
  results.push(await page.evaluate(()=>{
   const a=__ascent,b=a.rigidBatches;let error=0,missing=0,duplicates=0;
   for(const {mesh,sources}of b.batches){let count=0;for(const s of sources){if(s.layers.mask!==0)duplicates++;let visible=true;for(let p=s;p&&p!==a.scene;p=p.parent)if(!p.visible){visible=false;break;}if(!visible)continue;
     for(let j=0;j<16;j++)error=Math.max(error,Math.abs(mesh.instanceMatrix.array[count*16+j]-s.matrixWorld.elements[j]));count++;
    }if(count!==mesh.count)missing+=Math.abs(count-mesh.count);
   }
   return {...b.stats,error,missing,duplicates,draws:__state.drawCalls,triangles:__state.triangles};
  }));
 }
 assert(results.every(r=>r.parts>150&&r.batches<r.parts/3&&r.error<.0002&&r.missing===0&&r.duplicates===0));assert(results[1].visibleParts<results[0].visibleParts);assert.equal(results[0].visibleParts,results[2].visibleParts);assert.deepEqual(errors,[]);
 await writeFile(`captures/rigid-batches-${tier}.json`,JSON.stringify({tier,results,errors},null,2));console.log(JSON.stringify({tier,results,errors}));
}finally{await browser.close();}
