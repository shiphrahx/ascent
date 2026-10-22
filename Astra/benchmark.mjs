import {chromium} from 'playwright';
import {writeFile,access} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

// Run sequentially so browser instances do not compete for the same GPU.
const browser=await chromium.launch({channel:'chromium',headless:true});
const results=[];
try{
 const retina=process.argv.includes('--retina'),live=process.argv.includes('--live'),spatial=process.argv.includes('--no-temporal'),launch=process.argv.includes('--launch'),files=process.argv.slice(2).filter(arg=>!['--retina','--live','--no-temporal','--launch'].includes(arg));
 for(const file of files.length?files:['captures/baseline.html','Ascent.html']){
  await access(file);
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:retina?2:1});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve(file)).href);
  await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
  if(spatial)await page.evaluate(()=>__ascent.atmo.temporal.enabled=false);
  if(!live)await page.evaluate(launch=>{__ascent.setHour(launch?7.1:6.55);__ascent.setStorm(0);if(launch){__ascent.position(-73.25,52,986);__ascent.orbit(-.65,.2,83);}else{__ascent.position(35,130,600);__ascent.orbit(-.4,.2,96);}},launch);
  await page.waitForTimeout(live?12000:8000);
  const samples=await page.evaluate(count=>new Promise(resolve=>{
   const frames=[];let previous=performance.now();
   function frame(now){frames.push({ms:now-previous,calls:__state.drawCalls,triangles:__state.triangles,hour:__state.hour});previous=now;if(frames.length<count)requestAnimationFrame(frame);else resolve(frames.slice(1));}
   requestAnimationFrame(frame);
  }),live?360:180);
  const mean=key=>samples.reduce((sum,s)=>sum+s[key],0)/samples.length;
  const times=samples.map(s=>s.ms).sort((a,b)=>a-b);
  const info=await page.evaluate(()=>{const gl=__ascent.renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');return {gpu:gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),pixelRatio:__ascent.renderer.getPixelRatio(),quality:__state.quality};});
  results.push({file,...info,hourRange:[samples[0].hour,samples.at(-1).hour],fps:1000/mean('ms'),meanFrameMs:mean('ms'),p95FrameMs:times[Math.floor(times.length*.95)],meanDrawCalls:mean('calls'),meanTriangles:mean('triangles'),errors});
  await page.screenshot({path:`captures/benchmark-${results.length}.png`});await page.close();
 }
 await writeFile(`captures/benchmark${retina?'-retina':''}${live?'-live':''}${launch?'-launch':''}${spatial?'-spatial':''}.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
