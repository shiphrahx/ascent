import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(pathToFileURL(path.resolve('Ascent.html')).href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
 await page.evaluate(()=>{__ascent.setHour(6.55);__ascent.setStorm(0);__ascent.position(35,130,600);__ascent.orbit(-.4,.2,96);});
 await page.waitForTimeout(4000);await page.evaluate(()=>__ascent.pause(true));
 for(const enabled of[false,true]){
  await page.evaluate(enabled=>__ascent.atmo.temporal.enabled=enabled,enabled);await page.waitForTimeout(500);
  const values=await page.evaluate(()=>{
   const a=__ascent,at=a.atmo,r=a.renderer,values={};
   function half(h){const s=(h&0x8000)?-1:1,e=(h>>10)&31,m=h&1023;return s*(e?Math.pow(2,e-15)*(1+m/1024):Math.pow(2,-14)*m/1024);}
   const original=at.composer.passes.map(p=>p.render);
   at.composer.passes.forEach((p,i)=>p.render=function(...args){
    const t=i===0?at.scenePass.target:args[2],pixels=new Uint16Array(4);
    r.readRenderTargetPixels(t,Math.floor(t.width*.63),Math.floor(t.height*.47),1,1,pixels);
    values[i]=Array.from(pixels,half);return original[i].apply(this,args);
   });
   at.render();at.composer.passes.forEach((p,i)=>p.render=original[i]);return values;
  });
  console.log(enabled,values);await page.screenshot({path:`captures/temporal-color-${enabled}.png`});
 }
}finally{await browser.close();}
