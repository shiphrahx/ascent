import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';

// GPU elapsed queries distinguish rendering cost from browser presentation
// cadence. Query results are collected asynchronously; no gl.finish/readback.
const args=process.argv.slice(2),tier=args.find(x=>x.startsWith('--tier='))?.slice(7)??'medium',tag=args.find(x=>x.startsWith('--tag='))?.slice(6)??'budget';
if(!['high','medium','lite'].includes(tier)||!/^[a-z0-9-]+$/i.test(tag))throw Error('Invalid tier or tag');
const files=args.filter(x=>!x.startsWith('--')),browser=await chromium.launch({channel:'chromium',headless:true}),reports=[];
const percentile=(values,p)=>{const a=[...values].sort((a,b)=>a-b),i=(a.length-1)*p;return a[Math.floor(i)]+(a[Math.ceil(i)]-a[Math.floor(i)])*(i%1);};
try{
 for(const file of files.length?files:['Ascent.html']){
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
  const url=pathToFileURL(path.resolve(file));url.searchParams.set('quality',tier);await page.goto(url.href);
  await page.waitForFunction(()=>window.__ready,null,{timeout:120000});await page.waitForFunction(()=>__state.elapsed>1);
  await page.evaluate(()=>{
   const a=__ascent;a.pause();a.setHour(8.5);a.setStorm(0);a.setCamera(0);a.atmo.exposure.setFixed(.78);
   const look=a.camera.lookAt;a.camera.lookAt=function(){this.position.set(-25,147,745);look.call(this,90,88,300);};
  });
  await page.waitForTimeout(5000);
  const result=await page.evaluate(()=>new Promise(resolve=>{
   const a=__ascent,r=a.renderer,gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
   if(!ext){resolve({supported:false});return;}
   const render=a.atmo.render,pending=[],samples=[];let submitted=0,disjoint=false,finished=false;
   function poll(){
    disjoint||=!!gl.getParameter(ext.GPU_DISJOINT_EXT);
    while(pending.length&&gl.getQueryParameter(pending[0].query,gl.QUERY_RESULT_AVAILABLE)){
     const item=pending.shift(),gpuMs=gl.getQueryParameter(item.query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(item.query);const {query,...sample}=item;samples.push({...sample,gpuMs});
    }
    if(submitted===240&&pending.length===0&&!finished){finished=true;a.atmo.render=render;resolve({supported:true,disjoint,gpu:a.tier.gpu,samples});}
   }
   a.atmo.render=function(){
    poll();if(submitted===240)return render.apply(this,arguments);
    const query=gl.createQuery(),start=performance.now();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
    try{return render.apply(this,arguments);}finally{gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push({query,cpuMs:performance.now()-start,draws:r.info.render.calls,triangles:r.info.render.triangles});submitted++;}
   };
  }));
  const summary={};if(result.supported)for(const key of ['gpuMs','cpuMs']){const v=result.samples.map(x=>x[key]);summary[key]={mean:v.reduce((a,b)=>a+b,0)/v.length,median:percentile(v,.5),p95:percentile(v,.95),p99:percentile(v,.99)};}
  reports.push({file,tier,...result,summary,errors});console.log(JSON.stringify({file,tier,supported:result.supported,disjoint:result.disjoint,summary,errors}));
  if(errors.length)process.exitCode=1;await page.close();
 }
 await writeFile(`captures/gpu-budget-${tier}-${tag}.json`,JSON.stringify(reports,null,2));
}finally{await browser.close();}
