import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const tier=process.argv[2]??'medium',browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
 const url=pathToFileURL(path.resolve('Ascent.html'));url.searchParams.set('quality',tier);
 await page.goto(url.href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});await page.waitForFunction(()=>__state.elapsed>1);
 await page.evaluate(()=>{const a=__ascent;a.pause();a.setHour(8.5);a.setStorm(0);a.hero.group.visible=false;const look=a.camera.lookAt;a.camera.lookAt=function(){this.position.set(-25,147,745);look.call(this,90,88,300);};});
 await page.waitForTimeout(2000);
 const result=await page.evaluate(()=>{
  const a=__ascent,c=a.atmo.cloudShadows,r=a.renderer,u=a.atmo.fogPass.uniforms,dir=a.atmo.shadows.csm.lightDirection.clone().negate(),t=__state.elapsed;
  const half=n=>{const s=n&0x8000?-1:1,e=(n>>10)&31,m=n&1023;return e===0?s*m*2**-24:e===31?NaN:s*(1+m/1024)*2**(e-15);};
  function settle(){c.transition?.update(performance.now()/1000+c.stats.interval);}
  function field(){const target=c.targets.find(v=>v.texture===u.uCloudShadow.value),data=new Uint16Array(target.width*target.height*4);r.readRenderTargetPixels(target,0,0,target.width,target.height,data);const values=Array.from({length:data.length/4},(_,i)=>half(data[i*4]));return {values,min:Math.min(...values),max:Math.max(...values),mean:values.reduce((s,v)=>s+v,0)/values.length,finite:values.every(Number.isFinite)};}
  c.update(t,dir,0);const before=field(),updates=c.stats.updates;c.update(t,dir,0);const cached=c.stats.updates===updates;
  c.update(t+60,dir,0);settle();const moved=field();let motion=0;for(let i=0;i<before.values.length;i++)motion+=(moved.values[i]-before.values[i])**2;
  c.update(t+61,dir,1);const storm=field(),cutReset=u.uCloudShadow.value===u.uCloudPrevious.value;
  c.update(t+62,dir,0);a.atmo.exposure.setFixed(r.toneMappingExposure);
  const gl=r.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
  function image(enabled){c.setEnabled(enabled);a.atmo.temporal.invalidate('cloud comparison');a.atmo.render();const data=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);return {data,png:r.domElement.toDataURL('image/png').split(',')[1]};}
  const off=image(false),on=image(true);let difference=0;for(let i=0;i<on.data.length;i++)if(i%4!==3)difference+=(on.data[i]-off.data[i])**2;
  const summary=({values,...rest})=>rest;
  return {tier:a.tier.name,noLegacyFog:a.scene.fog===null,stats:c.stats,cached,cutReset,clear:summary(before),storm:summary(storm),motionRms:Math.sqrt(motion/before.values.length),imageRms:Math.sqrt(difference/(w*h*3))/255,images:{off:off.png,on:on.png}};
 });
 assert(result.noLegacyFog&&result.cached&&result.cutReset);assert(result.clear.finite&&result.storm.finite);assert(result.clear.min<.8&&result.clear.max>.99);assert(result.storm.mean<result.clear.mean-.1);assert(result.motionRms>.01);assert(result.imageRms>.0001&&result.imageRms<.2);assert.deepEqual(errors,[]);
 const {images,...report}=result;if(tier==='medium')for(const [name,data]of Object.entries(images))await writeFile(`captures/atmosphere-${tier}-${name}.png`,Buffer.from(data,'base64'));
 await writeFile(`captures/atmosphere-${tier}.json`,JSON.stringify({...report,errors},null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
