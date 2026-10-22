import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createFlickerScorer} from './tests/flicker-metric.mjs';

const args=process.argv.slice(2),option=(key,value)=>args.find(a=>a.startsWith('--'+key+'='))?.split('=')[1]??value;
const source=args.find(a=>!a.startsWith('--'))??'Ascent.html',tier=option('tier','medium'),tag=option('tag','baseline');
if(!['high','medium','lite'].includes(tier)||!/^[a-z0-9-]+$/i.test(tag))throw Error('Invalid tier or artifact tag');
const browser=await chromium.launch({channel:'chromium',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await mkdir('captures',{recursive:true});
try{
 await page.addInitScript(()=>{
  const raf=window.requestAnimationFrame.bind(window),now=performance.now.bind(performance);
  window.requestAnimationFrame=callback=>{const id=raf(callback);window.__flickerRAF=id;return id;};
  // Fixed wall-clock steps also drive the cached shadow/reflection refreshes.
  performance.now=()=>window.__flickerClock??now();
 });
 const url=pathToFileURL(path.resolve(source));url.searchParams.set('quality',tier);
 await page.goto(url.href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});await page.waitForTimeout(2000);
 // Meter the actual test view, then lock it so exposure adaptation is not
 // counted as flicker. Older comparison builds have no automatic exposure.
 if(await page.evaluate(()=>!!__ascent.atmo.exposure)){
  const samples=await page.evaluate(()=>{
   const a=__ascent;a.pause();a.setHour(8.5);a.setStorm(0);a.hero.group.visible=false;a.fleet.forEach(b=>b.group.visible=false);a.scene.traverse(o=>{if(o.isPoints)o.visible=false;});
   a.camera.__flickerLook=a.camera.lookAt;a.camera.lookAt=function(){this.position.set(-25,147,745);this.__flickerLook(90,88,300);};
   return a.atmo.exposure.stats.samples;
  });
  await page.waitForFunction(start=>{const s=__ascent.atmo.exposure.stats;return s.samples>=start+4&&Math.abs(s.value-s.target)<.02;},samples,{timeout:15000});
  await page.evaluate(()=>{const a=__ascent;a.atmo.exposure.setFixed(a.atmo.exposure.stats.value);a.camera.lookAt=a.camera.__flickerLook;});
 }
 const result=await page.evaluate(({factory})=>{
  const a=__ascent,r=a.renderer,c=a.camera;cancelAnimationFrame(window.__flickerRAF);a.pause();a.setHour(8.5);a.setStorm(0);a.setCamera(0);
  a.hero.group.visible=false;a.fleet.forEach(b=>b.group.visible=false);a.scene.traverse(o=>{if(o.isPoints)o.visible=false;});
  a.position(35,142,600);a.atmo.skyU.uTime.value=12;a.atmo.fogPass.uniforms.uBurn.value=0;
  const width=r.domElement.width,height=r.domElement.height,crop={x:1000,y:300,width:360,height:240};
  if(width!==1440||height!==900)throw Error('Flicker comparisons require 1440×900 native resolution');
  const metric=(0,eval)('('+factory+')')(width,height,crop),gl=r.getContext(),rgba=new Uint8Array(width*height*4),samples=[],images={};
  const startClock=performance.now()+1000;
  for(let frame=-30;frame<=300;frame++){
   window.__flickerClock=startClock+frame*1000/60;
   const shift=Math.max(0,frame)/60*1.2;
   c.position.set(-25+shift,147,745);c.lookAt(90+shift,88,300);c.updateMatrixWorld();
   const state=a.atmo.update(12,8.5,a.hero.group.position,0,0,1);state.hero=a.hero.group.position;a.world.update(12,0,state);
   r.info.reset();r.shadowMap.needsUpdate=true;a.atmo.render();
   if(frame<0)continue;
   gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
   const sample=metric.push(rgba);if(sample)samples.push(sample);
   if(frame===0||frame===300)images[frame===0?'start':'end']=r.domElement.toDataURL('image/png').split(',')[1];
  }
  const extension=gl.getExtension('WEBGL_debug_renderer_info');
  return {source:null,tier:a.tier.name,gpu:gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),exposure:a.atmo.exposure?.stats.value,width,height,hour:8.5,seconds:5,stepsPerSecond:60,slideMetres:6,crop,metric:'RMS of middle-frame linear-luminance residual L[t] - (L[t-1] + L[t+1])/2',...metric.result(),samples,images};
 },{factory:createFlickerScorer.toString()});
 const {images,...report}=result;report.source=source;report.errors=errors;
 for(const [name,data]of Object.entries(images))await writeFile(`captures/flicker-${tier}-${tag}-${name}.png`,Buffer.from(data,'base64'));
 await writeFile(`captures/flicker-${tier}-${tag}.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,samples:undefined},null,2));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
