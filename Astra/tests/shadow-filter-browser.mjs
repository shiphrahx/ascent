import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
const tier=process.argv[2]??'medium',browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
 const url=pathToFileURL(path.resolve('Ascent.html'));url.searchParams.set('quality',tier);
 await page.goto(url.href);await page.waitForFunction(()=>window.__ready,null,{timeout:120000});await page.waitForFunction(()=>__state.elapsed>1);
 await page.evaluate(()=>{const a=__ascent;a.pause();a.setHour(9);a.setStorm(0);a.setCamera(0);const look=a.camera.lookAt;a.camera.lookAt=function(){this.position.set(-25,147,745);look.call(this,90,88,300);};});
 await page.waitForTimeout(1000);
 const result=await page.evaluate(async()=>{
  const a=__ascent,s=a.atmo.shadows,f=s.filtering,start=f.stats.updates.slice(),blends=[],gl=a.renderer.getContext(),get=gl.getParameter,unpack=new Set([gl.UNPACK_ROW_LENGTH,gl.UNPACK_IMAGE_HEIGHT,gl.UNPACK_SKIP_PIXELS,gl.UNPACK_SKIP_ROWS,gl.UNPACK_SKIP_IMAGES]);let unpackQueries=0;
  gl.getParameter=function(parameter){if(unpack.has(parameter))unpackQueries++;return get.call(this,parameter);};
  try{for(let i=0;i<40;i++){await new Promise(requestAnimationFrame);blends.push(f.blend.toArray());}}finally{gl.getParameter=get;}
  const snapping=s.csm.lights.map(l=>{const p=l.position.clone().applyQuaternion(l.shadow.camera.quaternion.clone().invert()),texel=(l.shadow.camera.right-l.shadow.camera.left)/l.shadow.mapSize.x;return Math.max(Math.abs(p.x/texel-Math.round(p.x/texel)),Math.abs(p.y/texel-Math.round(p.y/texel)));});
  return {tier:a.tier.name,unpackQueries,updates:f.stats.updates.map((n,i)=>n-start[i]),copies:f.stats.copies,blends,snapping,sizes:s.csm.lights.map(l=>l.shadow.mapSize.x),history:f.history.map(t=>t?[t.width,t.height]:null)};
 });
 assert.equal(result.unpackQueries,0,'Depth history must stay on GPU without synchronous unpack queries');assert(result.snapping.every(n=>n<.0001));
 if(tier==='high'){
  assert(result.updates[0]>=39);assert.deepEqual(result.updates,[result.updates[0],result.updates[0],result.updates[0]]);assert.equal(result.sizes[0],4096);assert.equal(result.copies,0);
 }else{
  assert(result.updates[0]>=13&&result.updates[0]<=25);assert(result.updates[1]<=12&&result.updates[2]<=6);assert(result.copies>0);assert(result.history.every(Boolean));
  assert(result.blends.some(b=>b.some(n=>n>0&&n<1)),'Cached maps must interpolate, not jump');
 }
 const moving=await page.evaluate(async()=>{
  const a=__ascent,s=a.atmo.shadows,start=s.filtering.stats.updates.slice(),snap=[];let height=147;
  const look=a.camera.lookAt;a.camera.lookAt=function(){look.call(this);this.position.y=height;this.updateMatrixWorld();};
  for(let i=0;i<40;i++){
   height+=4/60;a.setHour(6.55+i/1200);await new Promise(requestAnimationFrame);
   // Cached cascades retain the camera pose that rendered their depth map.
   snap.push(...s.csm.lights.map(l=>{const p=l.shadow.camera.position.clone().applyQuaternion(l.shadow.camera.quaternion.clone().invert()),texel=(l.shadow.camera.right-l.shadow.camera.left)/l.shadow.mapSize.x;return Math.max(Math.abs(p.x/texel-Math.round(p.x/texel)),Math.abs(p.y/texel-Math.round(p.y/texel)));}));
  }
  return {maxSnappingError:Math.max(...snap),updates:s.filtering.stats.updates.map((n,i)=>n-start[i]),radii:s.csm.lights.map(l=>l.shadow.radius)};
 });
 assert(moving.maxSnappingError<.0001,'CSM stays texel-snapped during ascent and sunrise');
 assert(moving.radii[0]>(tier==='high'?3.5:2),'Low sunlight broadens the fixed filter without extra taps');
 if(tier==='high')assert.equal(new Set(moving.updates).size,1,'High refreshes every cascade throughout ascent');
 result.moving=moving;
 assert.deepEqual(errors,[]);await writeFile(`captures/shadow-filter-${tier}.json`,JSON.stringify({...result,errors},null,2));console.log(JSON.stringify({...result,blends:result.blends.length}));
}finally{await browser.close();}
