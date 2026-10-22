import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(pathToFileURL(path.resolve('Ascent.html')).href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
 const maps=await page.evaluate(()=>Object.entries(__ascent.assets).filter(([name])=>name.endsWith('Surface')).map(([name,map])=>{
  const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');ctx.drawImage(map.image,0,0);const pixels=ctx.getImageData(0,0,1024,1024).data;
  const minimum=[255,255,255],maximum=[0,0,0],mean=[0,0,0];let cavities=0;
  for(let i=0;i<pixels.length;i+=4){for(let k=0;k<3;k++){minimum[k]=Math.min(minimum[k],pixels[i+k]);maximum[k]=Math.max(maximum[k],pixels[i+k]);mean[k]+=pixels[i+k]/(1024*1024*255);}if(pixels[i+2]<230)cavities++;}
  return {name,colorSpace:map.colorSpace,width:map.image.width,height:map.image.height,minimum,maximum,mean,cavityFraction:cavities/(1024*1024),mipmaps:map.generateMipmaps,anisotropy:map.anisotropy};
 }));
 assert.equal(maps.length,3);
 for(const m of maps){assert.equal(m.colorSpace,'');assert(m.mipmaps&&m.anisotropy>=8);assert(m.minimum[0]>=180&&m.maximum[0]<=255);assert(m.maximum[1]-m.minimum[1]>40);assert(m.minimum[2]>=110&&m.maximum[2]===255);assert(m.mean[2]>.6&&m.cavityFraction>.001);}
 assert.deepEqual(errors,[]);await writeFile('captures/fidelity-2-materials.json',JSON.stringify({maps,errors},null,2));console.log(JSON.stringify(maps));
}finally{await browser.close();}
