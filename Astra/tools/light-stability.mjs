import {openReview,saveReport,saveImages} from './plan2-harness.mjs';
import {analyseSignal} from './light-signal.mjs';
import {meanRegion} from './luminance-region.mjs';
const run=await openReview();
try{
 const result=await run.page.evaluate(async reader=>{
  const a=__ascent,q=__review,r=a.renderer,g=r.getContext(),w=r.domElement.width,h=r.domElement.height,pixels=new Uint8Array(w*h*4);
  dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));
  for(let i=0;i<90;i++){q.step(0,6,false);await new Promise(resolve=>setTimeout(resolve,0));}
  const samples=[],images={};
  const readRegion=(0,eval)('('+reader+')'),mean=(rect,subpixel=false)=>readRegion(pixels,w,h,rect,subpixel);
  for(let frame=0;frame<=1800;frame++){
   if(frame%600===0)console.info('plan2: sunrise frame '+frame+'/1800');
   const t=frame/60,hour=6+t*.05;q.step(t,hour);
   g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,pixels);
   const p=a.hero.group.position.clone();p.y+=18;p.project(a.camera);
   const envelope={x:(p.x*.5+.5)*w-20,y:(.5-p.y*.5)*h-24,width:40,height:48};
   samples.push({frame,t,hour,whole:mean({x:0,y:0,width:w,height:h}),envelope:mean(envelope,true),ground:mean({x:580,y:650,width:280,height:160}),far:mean({x:980,y:260,width:300,height:180}),burner:a.hero.burn.value,envelopeCrop:envelope});
   if([0,660,1800].includes(frame))images[String(hour.toFixed(2))]=r.domElement.toDataURL('image/png').split(',')[1];
   // Permit the asynchronous exposure readback to finish between rendered frames.
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  dispatchEvent(new KeyboardEvent('keyup',{code:'Space'}));
  return {samples,images,camera:q.eye,target:q.target};
 },meanRegion.toString());
 const signals=Object.fromEntries(['whole','envelope','ground','far'].map(k=>[k,analyseSignal(result.samples.map(s=>s[k]))]));
 await saveImages(`plan2-light-${run.tier}-${run.tag}`,result.images);
 await saveReport('light',run,{seconds:30,hourRange:[6,7.5],camera:result.camera,target:result.target,units:'sRGB luminance levels (0–255)',tracking:'bilinear subpixel envelope crop',trend:'middle frame minus adjacent-frame mean',signals,samples:result.samples});
 console.log(JSON.stringify(Object.fromEntries(Object.entries(signals).map(([k,s])=>[k,{jump:s.largestDetrendedJump,rms:s.residualRms,peaks:s.peaks.slice(0,3)}])),null,2));
}finally{await run.browser.close();}
