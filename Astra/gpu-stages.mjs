import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const [source='Ascent.html',tag='stages']=process.argv.slice(2);
if(!/^[a-z0-9-]+$/i.test(tag))throw Error('Invalid tag');
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
 const url=pathToFileURL(path.resolve(source));url.searchParams.set('quality','medium');await page.goto(url.href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
 await page.evaluate(()=>{const a=__ascent;a.setHour(8.5);a.setStorm(0);a.atmo.exposure.setFixed(.78);const look=a.camera.lookAt;a.camera.lookAt=function(){this.position.set(-25,147,745);look.call(this,90,88,300);};});await page.waitForTimeout(5000);
 const result=await page.evaluate(()=>new Promise(resolve=>{
  const a=__ascent,r=a.renderer,gl=r.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');if(!ext){resolve({supported:false});return;}
  const originals={update:a.atmo.update,render:a.atmo.render},counts={update:0,render:0},pending=[],samples=[];let disjoint=false;
  function poll(){
   disjoint||=!!gl.getParameter(ext.GPU_DISJOINT_EXT);
   while(pending.length&&gl.getQueryParameter(pending[0].query,gl.QUERY_RESULT_AVAILABLE)){const {query,...item}=pending.shift();samples.push({...item,gpuMs:gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6});gl.deleteQuery(query);}
   if(counts.render>=240&&!pending.length){Object.assign(a.atmo,originals);resolve({supported:true,disjoint,samples});}
  }
  for(const stage of ['update','render'])a.atmo[stage]=function(...args){
   if(stage==='update')poll();if(counts[stage]>=240)return originals[stage].apply(this,args);
   const query=gl.createQuery(),start=performance.now();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
   try{return originals[stage].apply(this,args);}finally{gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push({query,stage,frame:counts[stage]++,cpuMs:performance.now()-start});}
  };
 }));
 const summary={};for(const stage of ['update','render']){
  const samples=result.samples?.filter(s=>s.stage===stage)??[];summary[stage]={};for(const key of ['cpuMs','gpuMs']){const values=samples.map(s=>s[key]).sort((a,b)=>a-b);summary[stage][key]={mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values[Math.floor(values.length*.95)],max:values.at(-1)};}
 }
 await writeFile(`captures/gpu-stages-${tag}.json`,JSON.stringify({source,...result,summary,errors},null,2));console.log(JSON.stringify({summary,errors}));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
