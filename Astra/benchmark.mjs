import {chromium} from 'playwright';
import {writeFile,readFile,access,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

// Run sequentially: concurrent browsers would compete for the same GPU.
const args=process.argv.slice(2),has=x=>args.includes('--'+x),option=(key,fallback)=>args.find(a=>a.startsWith('--'+key+'='))?.split('=')[1]??fallback;
const retina=has('retina'),live=has('live'),spatial=has('no-temporal'),launch=has('launch'),flight=has('flight'),recording=has('recording');
const seconds=Number(option('seconds',30)),tier=option('tier','medium'),tag=option('tag','baseline');
if(!Number.isFinite(seconds)||seconds<5||seconds>120||!['high','medium','lite'].includes(tier)||!/^[a-z0-9-]+$/i.test(tag))throw Error('Invalid seconds, tier or tag');
const files=args.filter(a=>!a.startsWith('--')),viewport=recording?{width:2848,height:1590}:{width:1440,height:900};
const suffix=flight?`-flight-${recording?'recording':'native'}-${tier}-${tag}`:`${retina?'-retina':''}${live?'-live':''}${launch?'-launch':''}${spatial?'-spatial':''}`;
const browser=await chromium.launch({channel:'chromium',headless:true}),results=[];
await mkdir('captures',{recursive:true});
try{
 for(const file of files.length?files:flight?['Ascent.html']:['captures/baseline.html','Ascent.html']){
  await access(file);
  const buildSha256=createHash('sha256').update(await readFile(file)).digest('hex');
  const page=await browser.newPage({viewport,deviceScaleFactor:retina?2:1}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const url=pathToFileURL(path.resolve(file));url.searchParams.set('quality',tier);
  await page.goto(url.href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
  await page.evaluate(({flight,spatial,live,launch})=>{
   const a=__ascent;if(spatial)a.atmo.temporal.enabled=false;
   // Count completed application renders, independently of the observer's rAF.
   const render=a.atmo.render;a.benchmarkFrames=0;a.atmo.render=function(){const value=render.apply(this,arguments);a.benchmarkFrames++;return value;};
   if(flight){
    a.setHour(8.5);a.setStorm(0);a.setCamera(0);
    const look=a.camera.lookAt;
    a.camera.lookAt=function(){
     const t=a.benchmarkStart===undefined?0:(performance.now()-a.benchmarkStart)/1000;
     const z=950-t*32,x=95*Math.sin(z*.004)+55*Math.sin(z*.008+1),y=142+12*Math.sin(t*.23),angle=-.35+.55*Math.sin(t*.36);
     a.position(x,y,z);this.position.set(x+Math.sin(angle)*96,y+34,z+Math.cos(angle)*96);
     look.call(this,x-Math.cos(angle)*17,y+22,z+Math.sin(angle)*17);
    };
   }else if(!live){a.setHour(launch?7.1:6.55);a.setStorm(0);if(launch){a.position(-73.25,52,986);a.orbit(-.65,.2,83);}else{a.position(35,130,600);a.orbit(-.4,.2,96);}}
  },{flight,spatial,live,launch});
  await page.waitForTimeout(live?12000:8000);
  const samples=await page.evaluate(({flight,seconds,count})=>new Promise(resolve=>{
   const frames=[];let previous,previousFrame,start;
   function sample(now){
    if(start===undefined){start=previous=now;previousFrame=__ascent.benchmarkFrames;if(flight)__ascent.benchmarkStart=performance.now();}
    else{
     const id=__ascent.benchmarkFrames;
     frames.push({t:now-start,ms:now-previous,applicationFrame:id,renderedFrames:id-previousFrame,applicationFrameMs:__state.frameMs??null,calls:__state.drawCalls,triangles:__state.triangles,hour:__state.hour,quality:__state.quality,camera:__state.camera,hero:__state.hero});
     previous=now;previousFrame=id;
    }
    if(flight?now-start<seconds*1000:frames.length<count)requestAnimationFrame(sample);else resolve(frames);
   }requestAnimationFrame(sample);
  }),{flight,seconds,count:live?360:180});
  const mean=key=>samples.reduce((sum,s)=>sum+s[key],0)/samples.length,times=samples.map(s=>s.ms).sort((a,b)=>a-b);
  const percentile=q=>{const i=(times.length-1)*q,lo=Math.floor(i);return times[lo]+(times[Math.ceil(i)]-times[lo])*(i-lo);};
  const info=await page.evaluate(()=>{const r=__ascent.renderer,gl=r.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');return {gpu:gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),tier:__ascent.tier?.name??'legacy',pixelRatio:r.getPixelRatio(),renderSize:[r.domElement.width,r.domElement.height],quality:__state.quality};});
  results.push({file,buildSha256,...info,viewport,deviceScaleFactor:retina?2:1,flight,seconds:samples.at(-1).t/1000,frameCount:samples.length,hourRange:[samples[0].hour,samples.at(-1).hour],fps:1000/mean('ms'),meanFrameMs:mean('ms'),medianFrameMs:percentile(.5),p95FrameMs:percentile(.95),p99FrameMs:percentile(.99),framesOver25ms:samples.filter(s=>s.ms>25).length,observerFramesWithoutRender:samples.filter(s=>s.renderedFrames===0).length,meanDrawCalls:mean('calls'),meanTriangles:mean('triangles'),errors,samples});
  await page.screenshot({path:`captures/benchmark${suffix}-${results.length}.png`});await page.close();
 }
 await writeFile(`captures/benchmark${suffix}.json`,JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(({samples,...summary})=>summary),null,2));
 if(results.some(r=>r.errors.length))process.exitCode=1;
}finally{await browser.close();}
