import {openReview,saveReport,saveImages} from './plan2-harness.mjs';
import {createFlickerScorer} from '../tests/flicker-metric.mjs';
const run=await openReview();
try{
 const result=await run.page.evaluate(async factory=>{
  const a=__ascent,q=__review,r=a.renderer,g=r.getContext(),w=r.domElement.width,h=r.domElement.height,rgba=new Uint8Array(w*h*4);
  // Isolate landscape: moving actors and particles have their own reactive mask.
  a.hero.group.visible=false;a.fleet.forEach(b=>b.group.visible=false);a.scene.traverse(o=>{if(o.isPoints)o.visible=false;});
  q.eye=[-25,147,745];q.target=[90,88,300];
  const crop={x:1000,y:300,width:360,height:240},cases={},images={};
  for(const [name,moving,running]of [['A',false,false],['B',false,true],['C',true,false],['D',true,true]]){
   a.atmo.exposure.setFixed(null);
   for(let i=0;i<180;i++){q.eye[1]=147;q.target[1]=88;q.step(0,6.55,false,!running);await new Promise(resolve=>setTimeout(resolve,0));}
   // Same photographic exposure in all four cases; B/D isolate lighting changes.
   a.atmo.exposure.setFixed(1.8);
   const scorer=(0,eval)('('+factory+')')(w,h,crop),samples=[];
   for(let frame=0;frame<=600;frame++){
    const t=frame/60;q.eye[1]=147+(moving?t*4:0);q.target[1]=88+(moving?t*4:0);
    q.step(t,6.55+(running?t*.05:0),false,!running);
    g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,rgba);const sample=scorer.push(rgba);if(sample)samples.push(sample);
    if(frame===0||frame===600)images[name+'-'+(frame===0?'start':'end')]=r.domElement.toDataURL('image/png').split(',')[1];
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   cases[name]={moving,running,...scorer.result(),samples};
  }
  return {cases,images,crop};
 },createFlickerScorer.toString());
 await saveImages(`plan2-flicker-${run.tier}-${run.tag}`,result.images);
 await saveReport('flicker',run,{secondsPerCase:10,exposure:1.8,startHour:6.55,ascentSpeed:4,crop:result.crop,metric:'RMS of middle-frame linear-luminance residual',cases:result.cases});
 console.log(JSON.stringify(Object.fromEntries(Object.entries(result.cases).map(([k,{samples,...s}])=>[k,s])),null,2));
}finally{await run.browser.close();}
