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
  {name:'village',hour:9,eye:[200.17288396503918,123.59251308397177,85],target:[155.17288396503918,77.59251308397177,-70]},
  {name:'rock',hour:14,eye:[-185,145,500],target:[-255,100,340]},
  {name:'clouds',hour:12,eye:[0,160,600],target:[0,700,-1600]}
 ]){
  await page.evaluate(p=>{
   const a=__ascent;a.pause();a.setStorm(0);a.setHour(p.hour);a.hero.group.visible=false;a.setCamera(0);
   const offset=p.landmark?a.landmarks[p.landmark]:[0,0,0],eye=p.eye.map((v,i)=>v+offset[i]),target=p.target.map((v,i)=>v+offset[i]);
   if(!a.camera.reviewLook)a.camera.reviewLook=a.camera.lookAt;
   a.camera.lookAt=function(){this.position.set(...eye);this.reviewLook(...target);};
  },pose);
  await page.waitForTimeout(1000);await page.screenshot({path:`captures/${tag}-${pose.name}.png`});
  const result=await page.evaluate(()=>{const a=__ascent,p=a.camera.position;return {state:__state,cameraClearance:p.y-a.surfaceHeight(p.x,p.z),plots:a.world.settlement?.plots.length,assets:Object.values(a.assets).map(t=>({name:t.name,width:t.image.naturalWidth,height:t.image.naturalHeight}))};});
  if(result.cameraClearance<2)throw Error(`${pose.name} review camera intersects the terrain`);
  report.push({pose:pose.name,...result});
 }
 await writeFile(`captures/${tag}-review.json`,JSON.stringify({source,errors,report},null,2));
 console.log(JSON.stringify({source,errors,plots:report[0].plots}));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
