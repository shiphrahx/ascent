import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

await mkdir('captures',{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
const errors=[],warnings=[],requests=[],frames=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());});
page.on('request',r=>requests.push(r.url()));
const checks={};
try{
 await page.goto(pathToFileURL(path.resolve('Ascent.html')).href);
 await page.waitForFunction(()=>window.__ready,null,{timeout:120000});
 for(const pose of [
  {name:'dawn',hour:6.55,storm:0,z:680,y:120},
  {name:'midday',hour:12,storm:0,z:350,y:100},
  {name:'storm',hour:10.8,storm:1,z:250,y:100},
  {name:'night',hour:22,storm:0,z:-80,y:105},
  {name:'basket',hour:6.4,storm:0,z:600,y:115,mode:1}
 ]){
  await page.evaluate(p=>{const a=__ascent;a.setHour(p.hour);a.setStorm(p.storm);a.setCamera(p.mode??0);a.position(95*Math.sin(p.z*.004)+55*Math.sin(p.z*.008+1),p.y,p.z);a.orbit(-.4,.2,96);if(p.mode===1)a.look(0,1.45);},pose);
  await page.keyboard.down('Space');await page.waitForTimeout(1700);
  for(let frame=0;frame<3;frame++){
   const result=await page.evaluate(()=>{
    const a=__ascent,r=a.renderer,at=a.atmo;
    // A single NaN at an MSAA flame edge used to poison the entire bloom chain.
    // Inspect the actual GPU buffers instead of relying on WebGL console errors.
    const invalid={};let reactivePixels=0,stablePixels=0;
    for(const [name,target]of [['scene',at.scenePass.target],['post1',at.composer.renderTarget1],['post2',at.composer.renderTarget2],['history',at.temporal.history]]){
     const pixels=new Uint16Array(target.width*target.height*4);r.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
     let count=0;for(const half of pixels)if((half&0x7c00)===0x7c00)count++;
     invalid[name]=count;
     if(name==='scene')for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)reactivePixels++;if(pixels[i]===0x3c00)stablePixels++;}
    }
    const target=at.scenePass.target,pr=r.getPixelRatio(),batches=a.world.trees.children;
    return {invalid,pixelRatio:pr,samples:target.samples,width:target.width,height:target.height,
     sizeMatches:target.width===Math.floor(innerWidth*pr)&&target.height===Math.floor(innerHeight*pr),
     depthMatches:target.depthTexture.image.width===target.width&&target.depthTexture.image.height===target.height,
     temporal:{valid:at.temporal.valid,frames:at.temporal.stats.frames,reactivePixels,stablePixels,
      sizeMatches:at.temporal.history.width===target.width&&at.temporal.history.height===target.height,
      projectionUnchanged:a.camera.projectionMatrix.elements[8]===0&&a.camera.projectionMatrix.elements[9]===0},
     storm:at.fogPass.uniforms.uStorm.value,night:at.fogPass.uniforms.uNight.value,
     time:at.fogPass.uniforms.uTime.value,elapsed:__state.elapsed,
     trees:batches.reduce((sum,o)=>sum+o.count,0),treeVersions:batches.map(o=>o.instanceMatrix.version),
     contextLost:r.getContext().isContextLost()};
   });
   frames.push({pose:pose.name,...result});await page.waitForTimeout(100);
  }
  await page.keyboard.up('Space');
  await page.screenshot({path:`captures/graphics-${pose.name}.png`});
 }
 checks.finiteHDR=frames.every(f=>Object.values(f.invalid).every(n=>n===0));
 checks.hardwareAntialiasing=frames.every(f=>f.samples>=2);
 checks.nativeResolutionFloor=frames.every(f=>f.pixelRatio>=1);
 checks.resolvedDepthDimensions=frames.every(f=>f.sizeMatches&&f.depthMatches);
 checks.liveWeather=frames.filter(f=>f.pose==='storm').every(f=>f.storm===1)&&frames.filter(f=>f.pose==='night').every(f=>f.night>.99);
 checks.liveTime=frames.every(f=>Math.abs(f.time-f.elapsed)<.001);
 checks.stableTreeInstances=frames.every(f=>f.trees===240&&f.treeVersions.every(v=>v===0));
 checks.noContextLoss=frames.every(f=>!f.contextLost);
 checks.temporalHistory=frames.every(f=>f.temporal.valid&&f.temporal.frames>0&&f.temporal.sizeMatches&&f.temporal.projectionUnchanged);
 checks.reactiveActors=frames.every(f=>f.temporal.reactivePixels>100&&f.temporal.stablePixels>100);
 const geometry=await page.evaluate(()=>{
  const a=__ascent;let maxTerrainError=0,maxRidgePenetration=0,samples=0;
  for(const name of['Valley terrain',...Array.from({length:6},(_,i)=>`Eroded ridge ${i}`)]){
   for(const mesh of a.scene.getObjectByName(name).children){
    const g=mesh.geometry,p=g.attributes.position,indices=g.index;
    for(let face=0;face<indices.count/3;face+=Math.max(1,Math.floor(indices.count/36))){
     const vertices=[0,1,2].map(k=>indices.getX(face*3+k));
     const coordinate=axis=>vertices.reduce((sum,v)=>sum+p[axis](v),0)/3;
     const x=coordinate('getX'),y=coordinate('getY'),z=coordinate('getZ');
     if(name==='Valley terrain')maxTerrainError=Math.max(maxTerrainError,Math.abs(a.ground(x,z)-y));
     else maxRidgePenetration=Math.max(maxRidgePenetration,y-a.surfaceHeight(x,z));
     samples++;
    }
   }
  }
  return {maxTerrainError,maxRidgePenetration,samples,textures:Object.values(a.assets).map(t=>({name:t.name,width:t.image.naturalWidth,height:t.image.naturalHeight,decoded:t.image.complete,colorSpace:t.colorSpace})),cascades:a.atmo.shadows.csm.lights.length,plots:a.world.settlement.plots.length};
 });
 checks.embeddedMaterialTextures=geometry.textures.length===6&&geometry.textures.every(t=>t.decoded&&t.width===1024&&t.height===1024);
 checks.linearSurfaceMaps=geometry.textures.filter(t=>t.name.includes('cavity')).length===3&&geometry.textures.filter(t=>t.name.includes('cavity')).every(t=>t.colorSpace==='');
 checks.generatedVillage=geometry.plots>=25;
 checks.terrainMatchesCollision=geometry.maxTerrainError<.02&&geometry.maxRidgePenetration<.02;
 checks.valleyShadowCoverage=geometry.cascades===3;
 const shadowCasters=await page.evaluate(()=>{
  const a=__ascent,lights=a.atmo.shadows.csm.lights,cameras=lights.map(l=>l.shadow.camera),saved=[],small=[0,0,0],large=[0,0,0],mask=a.camera.layers.mask;
  a.scene.traverse(o=>{if(!o.isMesh||!o.castShadow)return;const callback=o.onBeforeShadow;saved.push([o,callback]);o.onBeforeShadow=function(...args){const i=cameras.indexOf(args[3]);if(i>=0)(o.layers.isEnabled(2)?large:small)[i]++;return callback.apply(this,args);};});
  try{lights.forEach(l=>l.shadow.needsUpdate=true);a.renderer.shadowMap.needsUpdate=true;a.atmo.render();}
  finally{saved.forEach(([o,callback])=>o.onBeforeShadow=callback);}
  return {small,large,viewLayersRestored:mask===a.camera.layers.mask};
 });
 checks.farShadowDetailCulling=shadowCasters.small[0]>0&&shadowCasters.small[1]===0&&shadowCasters.small[2]===0&&shadowCasters.large.every(n=>n>0)&&shadowCasters.viewLayersRestored;
 const presentation=await page.evaluate(()=>{
  const a=__ascent,gl=a.renderer.getContext(),t=a.atmo.temporal,w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
  // Compare the temporal toggle at an identical photographic exposure. The
  // blocking readback itself otherwise gives automatic adaptation time to move.
  a.atmo.exposure?.setFixed(a.renderer.toneMappingExposure);
  function sample(enabled){
   t.enabled=enabled;t.invalidate('presentation test');a.atmo.render();
   const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
  }
  let before,after;try{before=sample(false);after=sample(true);}finally{a.atmo.exposure?.setFixed(null);}let transparent=0,squareError=0,maxError=0;
  for(let i=0;i<after.length;i++){if(i%4===3){if(after[i]!==255||before[i]!==255)transparent++;}else{const d=Math.abs(after[i]-before[i]);squareError+=d*d;maxError=Math.max(maxError,d);}}
  return {transparent,rmse:Math.sqrt(squareError/(w*h*3))/255,maxError};
 });
 checks.opaquePresentation=presentation.transparent===0;
 checks.reactiveColorPreserved=presentation.rmse<.001&&presentation.maxError<=2;
 await page.evaluate(()=>{const a=__ascent;a.setHour(6.55);a.setStorm(0);a.setCamera(0);a.position(35,130,600);a.orbit(-.4,.2,96);});
 await page.waitForTimeout(1700);
 const slowFrames=await page.evaluate(async()=>{
  const a=__ascent,r=a.renderer,lights=a.atmo.shadows.csm.lights,counts={shadows:[0,0,0],reflections:0};
  const matrices=lights.map(light=>light.shadow.updateMatrices),render=r.render;
  lights.forEach((light,i)=>{light.shadow.updateMatrices=function(...args){counts.shadows[i]++;return matrices[i].apply(this,args);};});
  r.render=function(scene,camera){if(camera===a.world.water.camera)counts.reflections++;return render.call(this,scene,camera);};
  a.pause(true);
  try{
   // Simulate a slow device. Cached work must not expand to every slow frame
   // and create the feedback loop that prevented performance from recovering.
   for(let i=0;i<24;i++){await new Promise(requestAnimationFrame);const end=performance.now()+85;while(performance.now()<end){}}
   return counts;
  }finally{r.render=render;lights.forEach((light,i)=>light.shadow.updateMatrices=matrices[i]);a.pause(false);}
 });
 const highShadows=await page.evaluate(()=>__ascent.tier.name==='high');
 checks.boundedWorkOnSlowFrames=slowFrames.shadows[0]>=20&&(highShadows?slowFrames.shadows.every(n=>n===slowFrames.shadows[0]):slowFrames.shadows[1]<=8&&slowFrames.shadows[2]<=5)&&slowFrames.reflections>0&&slowFrames.reflections<=13;
 await page.setViewportSize({width:1100,height:700});await page.waitForTimeout(400);
 checks.resize=await page.evaluate(()=>{const a=__ascent,t=a.atmo.scenePass.target,h=a.atmo.temporal.history,pr=a.renderer.getPixelRatio();return t.width===Math.floor(1100*pr)&&t.height===Math.floor(700*pr)&&h.width===t.width&&h.height===t.height&&Math.abs(a.camera.aspect-1100/700)<.001;});
 checks.capture=await page.evaluate(()=>__ascent.capture().startsWith('data:image/png;base64,'));
 checks.offline=!requests.some(url=>/^https?:/.test(url));
 checks.noShaderErrors=errors.length===0&&warnings.length===0;
 await writeFile('captures/graphics-report.json',JSON.stringify({checks,errors,warnings,geometry,presentation,shadowCasters,slowFrames,frames},null,2));
 console.log(JSON.stringify({checks,errors,warnings},null,2));
 if(Object.values(checks).some(x=>!x))process.exitCode=1;
}finally{await browser.close();}
