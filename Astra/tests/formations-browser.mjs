import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const tier=process.argv[2]??'medium',browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const url=pathToFileURL(path.resolve('Ascent.html'));url.searchParams.set('quality',tier);
 await page.goto(url.href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
 await page.waitForFunction(()=>__state.elapsed>1); // Let the launch fade finish before pausing.
 const report=await page.evaluate(()=>{
  const a=__ascent,formations=a.world.formations;
  let minimumBurial=Infinity;
  for(const f of formations){
   const p=a.world.formationGeometry[f.v].attributes.position,c=Math.cos(f.yaw),s=Math.sin(f.yaw);
   for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i))<.00001){
    const x=p.getX(i)*f.r,z=p.getZ(i)*f.r*f.depth;
    minimumBurial=Math.min(minimumBurial,a.ground(f.x+x*c+z*s,f.z-x*s+z*c)-f.y);
   }
  }
  return {tier:a.tier.name,count:formations.length,clusters:new Set(formations.map(f=>f.cluster)).size,caps:formations.filter(f=>f.cap).length,
   minimumBurial,variants:new Set(formations.map(f=>f.v)).size,carvings:a.world.formationCarvings.map(c=>{
    const pixels=c.mask.image.getContext('2d').getImageData(0,0,c.mask.image.width,c.mask.image.height).data;let cut=0;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]<32)cut++;
    return {count:c.count,width:c.mask.image.width,cutPixels:cut,shadowCut:!!c.rock.customDepthMaterial,position:c.position,entrance:c.entrance};
   }),contextLost:a.renderer.getContext().isContextLost()};
 });
 assert(report.count>40&&report.clusters>=15,'Cliff feet retain many visible formations');
 assert(report.caps>=8&&report.variants>=6,'Capped and uncapped families survive terrain rejection');
 assert(report.minimumBurial>0,'Every actual base vertex is below the collision terrain');
 assert.equal(report.carvings.length,tier==='high'?5:tier==='lite'?2:3);
 for(const c of report.carvings){assert(c.cutPixels>50&&c.shadowCut);assert.equal(c.width,512);assert.equal(c.count,2);}
 const p=[...report.carvings[0].position];p[1]=report.carvings[0].entrance;
 await page.evaluate(p=>{
  const a=__ascent;a.pause();a.setHour(14);a.setStorm(0);a.hero.group.visible=false;a.fleet.forEach(b=>b.group.visible=false);
  const look=a.camera.lookAt;a.camera.lookAt=function(){this.position.set(p[0]+24,p[1]+18,p[2]+70);look.call(this,p[0],p[1]+8,p[2]);};
 },p);
 await page.waitForTimeout(1500);await page.screenshot({path:`captures/formations-${tier}.png`});
 assert.equal(report.contextLost,false);assert.deepEqual(errors,[]);
 await writeFile(`captures/formations-${tier}.json`,JSON.stringify({...report,errors},null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
