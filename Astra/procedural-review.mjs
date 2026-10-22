import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const source=process.argv[2]??'Ascent.html',tag=process.argv[3]??'procedural';
const browser=await chromium.launch({channel:'chromium',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
try{
 await page.goto(pathToFileURL(path.resolve(source)).href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});await page.waitForTimeout(2000);
 const report=[];
 for(const pose of [
  {name:'valley',hour:8.5,eye:[-25,147,745],target:[90,88,300]},
  {name:'village',hour:9,landmark:'castle',eye:[45,68,155],target:[0,22,0]},
  {name:'rock',hour:14,eye:[-185,100,500],target:[-255,88,340]},
  {name:'clouds',hour:12,eye:[0,160,600],target:[0,700,-1600]}
 ]){
  await page.evaluate(p=>{
   const a=__ascent;a.pause();a.setStorm(0);a.setHour(p.hour);a.hero.group.visible=false;a.setCamera(0);
   const offset=p.landmark?a.landmarks[p.landmark]:[0,0,0],eye=p.eye.map((v,i)=>v+offset[i]),target=p.target.map((v,i)=>v+offset[i]);
   if(!a.camera.reviewLook)a.camera.reviewLook=a.camera.lookAt;
   a.camera.lookAt=function(){this.position.set(...eye);this.reviewLook(...target);};
  },pose);
  await page.waitForTimeout(1000);await page.screenshot({path:`captures/${tag}-${pose.name}.png`});
  report.push({pose:pose.name,...await page.evaluate(()=>({state:__state,plots:__ascent.world.settlement?.plots.length,assets:Object.values(__ascent.assets).map(t=>({name:t.name,width:t.image.naturalWidth,height:t.image.naturalHeight}))}))});
 }
 await writeFile(`captures/${tag}-review.json`,JSON.stringify({source,errors,report},null,2));
 console.log(JSON.stringify({source,errors,plots:report[0].plots}));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
