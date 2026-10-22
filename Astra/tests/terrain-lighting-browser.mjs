import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const tier=process.argv[2]??'medium',browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const url=pathToFileURL(path.resolve('Ascent.html'));url.searchParams.set('quality',tier);
 await page.goto(url.href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});await page.waitForFunction(()=>__state.elapsed>1);
 await page.evaluate(()=>{
  const a=__ascent;a.pause();a.setHour(9);a.setStorm(0);a.setCamera(0);a.hero.group.visible=false;a.fleet.forEach(b=>b.group.visible=false);
  const look=a.camera.lookAt;a.camera.lookAt=function(){this.position.set(-25,147,745);look.call(this,90,88,300);};
 });
 await page.waitForTimeout(1500);
 const result=await page.evaluate(()=>{
  const a=__ascent,t=a.world.terrainLighting,v=t.field.visibility;
  let min=1,max=0,sum=0,invalid=0;
  for(const n of v){min=Math.min(min,n);max=Math.max(max,n);sum+=n;if(!Number.isFinite(n))invalid++;}
  for(const n of t.bounce.image.data)if((n&0x7c00)===0x7c00)invalid++;
  let bakedValues=0;
  a.scene.traverse(o=>{const attribute=o.geometry?.attributes.aTerrainLight;if(attribute){bakedValues+=attribute.count;for(const value of attribute.array)if(!Number.isFinite(value)||value<0||value>1)invalid++;}});
  const r=a.renderer,gl=r.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
  a.atmo.exposure.setFixed(r.toneMappingExposure);
  function capture(enabled){t.setEnabled(enabled);a.atmo.temporal.invalidate('terrain lighting comparison');a.atmo.render();const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return {pixels,png:r.domElement.toDataURL('image/png').split(',')[1]};}
  const off=capture(false),on=capture(true);a.atmo.exposure.setFixed(null);let difference=0;
  for(let i=0;i<on.pixels.length;i++)if(i%4!==3)difference+=(on.pixels[i]-off.pixels[i])**2;
  return {tier:a.tier.name,stats:{...t.stats},visibility:{min,max,mean:sum/v.length},bakedValues,invalid,rms:Math.sqrt(difference/(w*h*3))/255,images:{off:off.png,on:on.png}};
 });
 assert.equal(result.invalid,0);assert(result.visibility.min<.9&&result.visibility.max>.99);assert(result.rms>.0001&&result.rms<.2);
 assert.equal(result.stats.size,tier==='lite'?129:257);assert.equal(result.stats.directions,tier==='high'?16:8);
 if(tier!=='high')assert(result.bakedValues>100000);
 assert.deepEqual(errors,[]);const {images,...report}=result;
 if(tier==='medium')for(const [name,data]of Object.entries(images))await writeFile(`captures/terrain-lighting-${tier}-${name}.png`,Buffer.from(data,'base64'));
 await writeFile(`captures/terrain-lighting-${tier}.json`,JSON.stringify({...report,errors},null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
