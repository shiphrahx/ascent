import {openReview,saveImages,saveReport} from './plan2-harness.mjs';
const run=await openReview();
try{
 const result=await run.page.evaluate(async()=>{
  dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));
  for(let i=0;i<180;i++){__review.step(11,6.55);await new Promise(resolve=>setTimeout(resolve,0));}
  const a=__ascent;a.atmo.render(); // Read in the render task; the default framebuffer is transient.
  return {image:a.renderer.domElement.toDataURL('image/png').split(',')[1],hour:6.55,eye:a.camera.position.toArray(),target:__review.target,hero:a.hero.group.position.toArray(),exposure:a.atmo.exposure.stats.value};
 });
 const {image,...state}=result;
 await saveImages(`plan2-${run.tag}`,{sunrise:image});await saveReport('capture',run,state);
}finally{await run.browser.close();}
