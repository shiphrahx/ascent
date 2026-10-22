import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{const raf=requestAnimationFrame;window.requestAnimationFrame=callback=>{const id=raf(callback);window.__exposureRAF=id;return id;};});
 await page.goto(pathToFileURL(path.resolve('Ascent.html')).href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
 await page.waitForFunction(()=>__ascent.atmo.exposure.stats.samples>=2);
 await page.evaluate(()=>{cancelAnimationFrame(window.__exposureRAF);__ascent.pause();});
 await page.waitForFunction(()=>!__ascent.atmo.exposure.stats.pending);
 const results=[];
 for(const luminance of [.18,.01,4]){
  await page.evaluate(level=>{
   const a=__ascent,r=a.renderer,e=a.atmo.exposure,fixture=new a.scene.constructor();
   e.setFixed(1);e.setFixed(null);
   fixture.background=a.atmo.skyU.uTop.value.clone().setRGB(level,level,level);
   // Complete a render, which resolves the MSAA colour target for sampling.
   r.setRenderTarget(a.atmo.scenePass.target);r.render(fixture,a.camera);r.setRenderTarget(null);
   e.sample();
   // An ordinary synchronous capture must remain valid while the PBO fence is pending.
   const pixel=new Uint16Array(4);r.readRenderTargetPixels(a.atmo.scenePass.target,0,0,1,1,pixel);
   if(r.getContext().getError()!==0)throw Error('Metering interfered with synchronous readback');
  },luminance);
  await page.waitForFunction(()=>!__ascent.atmo.exposure.stats.pending);
  results.push({luminance,...await page.evaluate(()=>({...__ascent.atmo.exposure.stats}))});
 }
 console.log(JSON.stringify(results));
 assert(Math.abs(Math.log2(results[0].target))<.2);assert.equal(results[1].target,1.8);assert.equal(results[2].target,.45);
 assert(results.every(r=>!r.error&&Number.isFinite(r.meanEV)));
 const lighting=await page.evaluate(()=>{let hemispheres=0;__ascent.scene.traverse(o=>{if(o.isHemisphereLight)hemispheres++;});return {hemispheres,environment:!!__ascent.scene.environment};});
 assert.equal(lighting.hemispheres,0);assert(lighting.environment);assert.deepEqual(errors,[]);
 await writeFile('captures/exposure.json',JSON.stringify({results,lighting,errors},null,2));console.log(JSON.stringify({results,lighting,errors}));
}finally{await browser.close();}
