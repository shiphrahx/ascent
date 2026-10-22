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
  const a=__ascent;a.pause();a.setHour(6.8);a.setStorm(0);a.setCamera(0);a.hero.group.visible=false;a.fleet.forEach(b=>b.group.visible=false);
  const look=a.camera.lookAt;a.camera.lookAt=function(){this.position.set(-1200,750,2200);look.call(this,700,180,-3000);};
 });
 await page.waitForTimeout(2500);
 const result=await page.evaluate(()=>{
  const a=__ascent,t=a.world.terrainShadows,r=a.renderer,gl=r.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
  let invalid=0;for(const n of t.texture.image.data)if((n&0x7c00)===0x7c00)invalid++;
  a.atmo.exposure.setFixed(r.toneMappingExposure);
  function capture(enabled){t.setEnabled(enabled);a.atmo.temporal.invalidate('terrain shadow comparison');a.atmo.render();const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return {pixels,png:r.domElement.toDataURL('image/png').split(',')[1]};}
  const off=capture(false),on=capture(true);let difference=0,changed=0;
  for(let i=0;i<on.pixels.length;i++)if(i%4!==3){difference+=(on.pixels[i]-off.pixels[i])**2;if(Math.abs(on.pixels[i]-off.pixels[i])>2)changed++;}
  const version=t.texture.version,direction=a.atmo.shadows.csm.lightDirection.clone().negate();
  for(let i=0;i<20;i++)t.update({direction:direction.clone().setX(direction.x+i*.001).normalize()});
  const stableTexture=t.texture.version===version;t.update({direction});a.atmo.exposure.setFixed(null);
  return {tier:a.tier.name,stats:t.stats,invalid,stableTexture,changedChannels:changed,rms:Math.sqrt(difference/(w*h*3))/255,images:{off:off.png,on:on.png}};
 });
 assert.equal(result.invalid,0);assert.equal(result.stableTexture,true);assert(result.rms>.0001&&result.rms<.2);assert(result.changedChannels>100);
 assert.equal(result.stats.size,tier==='high'?256:128);assert.equal(result.stats.directions,tier==='high'?16:8);
 assert.deepEqual(errors,[]);const {images,...report}=result;
 if(tier==='medium')for(const [name,data]of Object.entries(images))await writeFile(`captures/terrain-shadows-${tier}-${name}.png`,Buffer.from(data,'base64'));
 await writeFile(`captures/terrain-shadows-${tier}.json`,JSON.stringify({...report,errors},null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
