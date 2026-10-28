import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

export const option=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
export async function openReview(){
 const tier=option('tier','medium'),tag=option('tag','baseline'),source=option('source','Ascent.html');
 if(!['high','medium','lite'].includes(tier)||!/^[a-z0-9-]+$/i.test(tag))throw Error('Invalid tier/tag');
 await mkdir('captures',{recursive:true});
 const browser=await chromium.launch({channel:'chromium',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['warning','error'].includes(m.type()))errors.push(m.text());});
 page.on('console',m=>{if(m.text().startsWith('plan2:'))console.log(m.text());});
 await page.addInitScript(()=>{
  const raf=requestAnimationFrame.bind(window),clock=performance.now.bind(performance);
  window.__review={manual:false,callback:null,clock:0};
  window.requestAnimationFrame=fn=>{__review.callback=fn;return __review.manual?0:raf(fn);};
  performance.now=()=>__review.manual?__review.clock:clock();
 });
 const url=pathToFileURL(path.resolve(source));url.searchParams.set('quality',tier);
 await page.goto(url.href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});await page.waitForTimeout(1800);
 await page.evaluate(()=>{
  const a=__ascent,q=__review;q.clock=performance.now();q.manual=true;a.setStorm(0);a.setCamera(0);
  q.look=a.camera.lookAt;q.eye=[-25,180,745];q.target=[35,168,600];
  a.camera.lookAt=function(){this.position.fromArray(q.eye);return q.look.apply(this,q.target);};
  // Seed simulation time through the review API shared by the archived and new
  // builds. Finish with ordinary fixed-clock frames for exact fractional time.
  q.setTime=seconds=>{
   const steps=Math.max(0,Math.floor((seconds-__state.elapsed)*10)-1);
   a.simulate(steps/10);q.callback(q.clock);a.pause(false);
   while(__state.elapsed<seconds-1e-8){q.clock+=1000*Math.min(.05,seconds-__state.elapsed);q.callback(q.clock);}
   a.pause(true);
  };
  q.step=(t,hour,ascending=true,frozen=false)=>{
   a.position(35,130+(ascending?t:0),600);a.setHour(hour);a.pause(frozen);
   q.clock+=1000/60;q.callback(q.clock);
  };
 });
 await page.waitForTimeout(50); // Let the last native callback hand over to the fixed clock.
 const buildSha256=createHash('sha256').update(await readFile(source)).digest('hex');
 const info=await page.evaluate(()=>{const r=__ascent.renderer,g=r.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {gpu:g.getParameter(e?.UNMASKED_RENDERER_WEBGL??g.RENDERER),width:r.domElement.width,height:r.domElement.height};});
 return {browser,page,tier,tag,errors,meta:{source,buildSha256,tier,...info,stepsPerSecond:60}};
}
export async function saveReport(kind,run,report){
 const result={...run.meta,...report,errors:run.errors};
 await writeFile(`captures/plan2-${kind}-${run.tier}-${run.tag}.json`,JSON.stringify(result,null,2));
 if(run.errors.length)process.exitCode=1;
 return result;
}
export async function saveImages(prefix,images){for(const [name,data]of Object.entries(images))await writeFile(`captures/${prefix}-${name}.png`,Buffer.from(data,'base64'));}
