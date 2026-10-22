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
 await page.evaluate(()=>{const a=__ascent;a.pause();a.setHour(9);a.setStorm(0);a.hero.group.visible=false;const look=a.camera.lookAt;a.camera.lookAt=function(){this.position.set(-30,22,570);look.call(this,-42,3.55,480);};});
 await page.waitForTimeout(2500);
 const report=await page.evaluate(()=>{
  const a=__ascent,w=a.world.water,g=w.geometry,p=g.attributes.position,d=g.attributes.aWaterDepth,v=a.camera.position.clone();let depthError=0,finite=true;
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(w.matrixWorld);const expected=Math.max(0,3.55-a.ground(v.x,v.z));depthError=Math.max(depthError,Math.abs(expected-d.getX(i)));finite&&=Number.isFinite(d.getX(i));}
  const r=a.renderer,target=a.atmo.scenePass.target,data=new Uint16Array(target.width*target.height*4);r.readRenderTargetPixels(target,0,0,target.width,target.height,data);let invalid=0;for(const n of data)if((n&0x7c00)===0x7c00)invalid++;
  return {tier:a.tier.name,...w.userData.river,depthError,finite,invalid,softShore:w.material.transparent,cameraClearance:a.camera.position.y-a.surfaceHeight(a.camera.position.x,a.camera.position.z),reflectionSize:w.getRenderTarget().width};
 });
 assert(report.finite&&report.softShore);assert.equal(report.invalid,0);assert(report.depthError<.001&&report.maxShoreError<.01);assert(report.maxWidth-report.minWidth>8);assert(report.maxDepth>1.5&&report.maxDepth<2);assert(report.cameraClearance>2);assert.deepEqual(errors,[]);
 if(tier==='medium')await page.screenshot({path:'captures/river-medium-close.png'});
 await writeFile(`captures/river-${tier}.json`,JSON.stringify({...report,errors},null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
