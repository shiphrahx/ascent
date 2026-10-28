import {openReview,saveReport,saveImages,option} from './plan2-harness.mjs';
import {createFlickerScorer} from '../tests/flicker-metric.mjs';
const selected=option('case',null),cases={};let reportRun;
// Fresh scenes give all four cases identical vegetation, cloud and water phases.
for(const [name,moving,running]of [['A',false,false],['B',false,true],['C',true,false],['D',true,true]].filter(([n])=>!selected||selected.includes(n))){
 const run=await openReview();reportRun=run;
 try{
  const result=await run.page.evaluate(async({factory,name,moving,running})=>{
   const a=__ascent,q=__review,r=a.renderer,g=r.getContext(),w=r.domElement.width,h=r.domElement.height,rgba=new Uint8Array(w*h*4);
   a.hero.group.visible=false;a.fleet.forEach(b=>b.group.visible=false);a.scene.traverse(o=>{if(o.isPoints)o.visible=false;});
   q.eye=[-25,147,745];q.target=[90,88,300];q.setTime(100);
   console.info('plan2: landscape case '+name);
   a.atmo.exposure.setFixed(null);
   for(let i=0;i<180;i++){q.step(0,6.55,false,true);await new Promise(resolve=>setTimeout(resolve,0));}
   if(a.atmo.fogPass.uniforms.uFade.value!==0)throw Error('Review transition must finish before scoring');
   a.atmo.exposure.setFixed(1.8);
   const crop={x:1000,y:300,width:360,height:240},simulationStart=__state.elapsed;
   const scorer=(0,eval)('('+factory+')')(w,h,crop,180),samples=[],images={};
   for(let frame=0;frame<=600;frame++){
    const t=frame/60;q.eye[1]=147+(moving?t*4:0);q.target[1]=88+(moving?t*4:0);
    q.step(t,6.55+(running?t*.05:0),false,!running);
    g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,rgba);const sample=scorer.push(rgba);if(sample)samples.push(sample);
    if(frame===0||frame===600)images[name+'-'+(frame===0?'start':'end')]=r.domElement.toDataURL('image/png').split(',')[1];
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   return {case:{moving,running,simulationStart,...scorer.result(),samples},images,crop};
  },{factory:createFlickerScorer.toString(),name,moving,running});
  cases[name]=result.case;await saveImages('plan2-flicker-'+run.tier+'-'+run.tag,result.images);
  if(run.errors.length)throw Error(run.errors.join('\n'));
 }finally{await run.browser.close();}
}
await saveReport('flicker',reportRun,{secondsPerCase:10,exposure:1.8,startHour:6.55,ascentSpeed:4,simulationSeed:100,independentScenes:true,crop:{x:1000,y:300,width:360,height:240},metric:'RMS of middle-frame linear-luminance residual',cases});
console.log(JSON.stringify(Object.fromEntries(Object.entries(cases).map(([k,{samples,regions,...s}])=>[k,s])),null,2));
