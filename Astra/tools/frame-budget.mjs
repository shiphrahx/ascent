import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const args=process.argv.slice(2),tier=args.find(a=>a.startsWith('--tier='))?.slice(7)??'medium',tag=args.find(a=>a.startsWith('--tag='))?.slice(6)??'budget';
const source=args.find(a=>!a.startsWith('--'))??'Ascent.html';
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
 await page.goto(pathToFileURL(path.resolve(source)).href+'?quality='+tier);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
 await page.evaluate(()=>{const a=__ascent;a.setHour(6.55);a.setStorm(0);a.position(35,140,600);a.orbit(-.65,.2,83);});await page.waitForTimeout(3500);
 await page.evaluate(detail=>window.__budgetDetail=detail,args.includes('--detail'));
 const result=await page.evaluate(()=>new Promise(resolve=>{
  const a=__ascent,gl=a.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if(!ext){resolve({supported:false});return;}
  const pending=[],samples=[],restore=[];let frame=0,disjoint=false,active=false;
  function wrap(object,key,label){const original=object[key];restore.push(()=>object[key]=original);object[key]=function(...args){
   if(frame>=300||active)return original.apply(this,args);active=true;
   const query=gl.createQuery(),start=performance.now();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
   try{return original.apply(this,args);}finally{gl.endQuery(ext.TIME_ELAPSED_EXT);active=false;pending.push({query,label,frame,cpuMs:performance.now()-start});}
  };}
  wrap(a.atmo,'update','lighting caches');wrap(a.world,'update','world and bounce');
  if(window.__budgetDetail){wrap(a.renderer.shadowMap,'render','shadow maps');wrap(a.world.water,'onBeforeRender','river reflection');}
  else wrap(a.atmo.scenePass,'render','scenePass');
  for(const name of['fogPass','temporal','bloom','output'])wrap(a.atmo[name],'render',name);
  function poll(){
   disjoint||=!!gl.getParameter(ext.GPU_DISJOINT_EXT);
   while(pending.length&&gl.getQueryParameter(pending[0].query,gl.QUERY_RESULT_AVAILABLE)){
    const {query,...sample}=pending.shift();sample.gpuMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(query);samples.push(sample);
   }
   if(frame>=300&&!pending.length){restore.forEach(fn=>fn());resolve({supported:true,gpu:a.tier.gpu,disjoint,samples});return;}
   if(frame<300){a.setHour(6.55+frame/1200);frame++;}requestAnimationFrame(poll);
  }requestAnimationFrame(poll);
 }));
 const summary={};for(const label of new Set(result.samples?.map(s=>s.label)??[])){
  const rows=result.samples.filter(s=>s.label===label);summary[label]={};
  for(const key of['gpuMs','cpuMs']){const v=rows.map(s=>s[key]).sort((a,b)=>a-b);summary[label][key]={mean:v.reduce((a,b)=>a+b,0)/v.length,p95:v[Math.floor((v.length-1)*.95)],p99:v[Math.floor((v.length-1)*.99)]};}
 }
 const report={source,tier,buildSha256:createHash('sha256').update(await readFile(source)).digest('hex'),...result,summary,errors};
 await writeFile(`captures/plan2-frame-budget-${tier}-${tag}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({summary,disjoint:result.disjoint,errors},null,2));
 if(errors.length)process.exitCode=1;
}finally{await browser.close();}
