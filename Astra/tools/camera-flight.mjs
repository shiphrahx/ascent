import {openReview,saveImages,saveReport} from './plan2-harness.mjs';
const run=await openReview();
try{
 const result=await run.page.evaluate(async()=>{
  const a=__ascent,q=__review,samples=[],images={};a.camera.lookAt=q.look;a.setCamera(0);a.setHour(6.55);a.pause(false);
  for(let frame=-90;frame<=600;frame++){
   const t=Math.max(0,frame)/60;
   a.position(35+Math.sin(t*.8)*30,140+t*2,600-t*10);a.orbit(-.65+Math.sin(t*.5)*.5,.2,83);
   q.clock+=1000/60;q.callback(q.clock);
   if(frame>=0){
    const centre=a.hero.group.position.clone().set(0,17,0);a.hero.group.localToWorld(centre);centre.project(a.camera);
    samples.push({t,horizontal:centre.x*.5,vertical:centre.y*.5,camera:a.camera.position.toArray(),hero:a.hero.group.position.toArray()});
    if(frame===0||frame===300||frame===600)images[String(frame)]=a.renderer.domElement.toDataURL('image/png').split(',')[1];
   }
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {samples,images,maxHorizontalFraction:Math.max(...samples.map(s=>Math.abs(s.horizontal)))};
 });
 await saveImages(`plan2-camera-${run.tag}`,result.images);
 const {images,...report}=result;await saveReport('camera',run,report);
 console.log('Maximum horizontal displacement from centre: '+(report.maxHorizontalFraction*100).toFixed(3)+'%');
 if(process.argv.includes('--expect-centred')&&report.maxHorizontalFraction>.05)throw Error('Envelope left the central 10% band');
}finally{await run.browser.close();}
