import {chromium} from 'playwright';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {AgXToneMapping,ACESFilmicToneMapping} from 'three';
const [source='Ascent.html',tag='lighting',option]=process.argv.slice(2),compare=option==='--compare-tones';
const buildSha256=createHash('sha256').update(await readFile(source)).digest('hex');
if(!/^[a-z0-9-]+$/i.test(tag))throw Error('Invalid capture tag');
const poses=[{name:'sunrise',hour:6.55},{name:'midday',hour:12},{name:'snowstorm',hour:10.8,storm:1},{name:'golden-hour',hour:17.2},{name:'sunset',hour:18.2},{name:'night',hour:22}];
const browser=await chromium.launch({channel:'chromium',headless:true}),report=[],images=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
 await page.goto(pathToFileURL(path.resolve(source)).href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});await page.waitForFunction(()=>__state.elapsed>1);
 for(const pose of poses){
  await page.evaluate(({pose,tone})=>{
   const a=__ascent;a.pause();a.setHour(pose.hour);a.setStorm(pose.storm??0);a.setCamera(0);a.hero.group.visible=false;a.renderer.toneMapping=tone;a.atmo.exposure?.setFixed(null);
   if(!a.camera.reviewLook)a.camera.reviewLook=a.camera.lookAt;
   a.camera.lookAt=function(){this.position.set(-25,147,745);this.reviewLook(90,88,300);};
  },{pose,tone:AgXToneMapping});await page.waitForTimeout(1200);
  if(await page.evaluate(()=>!!__ascent.atmo.exposure)){
   const samples=await page.evaluate(()=>__ascent.atmo.exposure.stats.samples);await page.waitForFunction(start=>{const s=__ascent.atmo.exposure.stats;return s.samples>=start+3&&Math.abs(s.value-s.target)<.02;},samples,{timeout:15000});
   await page.evaluate(()=>__ascent.atmo.exposure.setFixed(__ascent.renderer.toneMappingExposure));
  }
  for(const [name,tone]of compare?[['agx',AgXToneMapping],['aces',ACESFilmicToneMapping]]:[['agx',AgXToneMapping]]){
   await page.evaluate(tone=>{const a=__ascent;a.renderer.toneMapping=tone;a.atmo.temporal.invalidate('tone comparison');a.atmo.render();},tone);await page.waitForTimeout(200);
   const file=`${tag}-${pose.name}${compare?'-'+name:''}.png`;await page.screenshot({path:'captures/'+file});images.push({name:pose.name+' / '+name,file});
   report.push({pose:pose.name,hour:pose.hour,storm:pose.storm??0,tone:name,...await page.evaluate(()=>({exposure:__ascent.renderer.toneMappingExposure,camera:__ascent.camera.position.toArray(),tier:__ascent.tier.name}))});
  }
 }
 await writeFile(`captures/${tag}.json`,JSON.stringify({source,buildSha256,compare,report,errors},null,2));
 const html='<!doctype html><meta charset="utf-8"><title>Lighting review</title><style>body{margin:0;background:#222;color:white;font:18px sans-serif}main{display:grid;grid-template-columns:1fr 1fr}figure{margin:4px}img{width:100%}</style><main>'+images.map(i=>`<figure><figcaption>${i.name}</figcaption><img src="${i.file}"></figure>`).join('')+'</main>';
 await writeFile(`captures/${tag}.html`,html);await page.setViewportSize({width:1600,height:1800});await page.goto(pathToFileURL(path.resolve(`captures/${tag}.html`)).href);await page.screenshot({path:`captures/${tag}-contact.png`,fullPage:true});
 console.log(JSON.stringify({source,compare,views:report.length,errors}));if(errors.length)process.exitCode=1;
}finally{await browser.close();}
