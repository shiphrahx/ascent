import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const live=process.argv.includes('live')||process.argv.includes('--live');
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:process.argv.includes('--retina')?2:1});
 await page.goto(pathToFileURL(path.resolve('Ascent.html')).href);
 await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
 if(!live)await page.evaluate(()=>{__ascent.setHour(6.55);__ascent.setStorm(0);__ascent.position(35,130,600);__ascent.orbit(-.4,.2,96);});
 await page.waitForTimeout(live?12000:4000);
 const result=await page.evaluate(mode=>new Promise(resolve=>{
  const a=__ascent,gl=a.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const records={},pending=[];let activeQuery=false;
  function instrument(object,key,name){
   const original=object[key];
   object[key]=function(...args){
    if(name==='shadows'&&!args[0]?.length)return original.apply(this,args);
    const query=ext&&!activeQuery?gl.createQuery():null,start=performance.now();if(query){activeQuery=true;gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}
    const result=original.apply(this,args);
    if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);activeQuery=false;}
    (records[name]??=[]).push({cpu:performance.now()-start});
    if(query)pending.push({query,record:records[name].at(-1)});
    return result;
   };
  }
  instrument(a.atmo,'update','atmosphere');
  if(mode==='detail'){
   instrument(a.renderer.shadowMap,'render','shadows');
   const reflect=a.world.water.onBeforeRender;
   a.world.water.onBeforeRender=function(...args){const shadow=a.renderer.shadowMap.render;a.renderer.shadowMap.render=()=>{};try{return reflect.apply(this,args);}finally{a.renderer.shadowMap.render=shadow;}};
   instrument(a.world.water,'onBeforeRender','reflection');
  }else a.atmo.composer.passes.forEach((p,i)=>instrument(p,'render',['scene','fog','temporal','bloom','output','AA'][i]));
  let frame=0;
  function tick(){
   for(let i=pending.length-1;i>=0;i--){const p=pending[i];if(gl.getQueryParameter(p.query,gl.QUERY_RESULT_AVAILABLE)){p.record.gpu=gl.getQueryParameter(p.query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(p.query);pending.splice(i,1);}}
   if(++frame<240){requestAnimationFrame(tick);return;}
   const summary={};for(const [name,samples]of Object.entries(records)){summary[name]={cpu:samples.reduce((s,v)=>s+v.cpu,0)/samples.length,gpu:samples.reduce((s,v)=>s+(v.gpu??0),0)/samples.length,maxGPU:Math.max(...samples.map(v=>v.gpu??0))};}
   resolve({summary,state:__state,gpuTimer:!!ext,disjoint:ext?gl.getParameter(ext.GPU_DISJOINT_EXT):null});
  }requestAnimationFrame(tick);
 }),process.argv[2]);
 await writeFile('captures/render-profile.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 await page.screenshot({path:'captures/photoreal-dawn.png'});
}finally{await browser.close();}
