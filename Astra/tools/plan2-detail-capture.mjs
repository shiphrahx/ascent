import {openReview,saveReport,saveImages,option} from './plan2-harness.mjs';
const view=option('view','terrain'),run=await openReview();
try{
 const result=await run.page.evaluate(async view=>{
  const a=__ascent,q=__review;a.hero.group.visible=false;a.fleet.forEach(b=>b.group.visible=false);a.scene.traverse(o=>{if(o.isPoints)o.visible=false;});
  q.setTime(100);
  const poses={terrain:{eye:[-25,100,745],target:[95,35,465],hour:8.5},river:{eye:[-30,22,570],target:[-42,3.55,480],hour:9},snow:{eye:[-25,100,745],target:[95,35,465],hour:12}};
  const pose=poses[view];if(!pose)throw Error('Unknown detail view');q.eye=pose.eye;q.target=pose.target;
  for(let i=0;i<240;i++){q.step(0,pose.hour,false,true);await new Promise(r=>setTimeout(r,0));}
  a.atmo.render();return {pose,images:{[view]:a.renderer.domElement.toDataURL('image/png').split(',')[1]}};
 },view);
 await saveImages('plan2-detail-'+run.tag,result.images);await saveReport('detail-'+view,run,{pose:result.pose});
}finally{await run.browser.close();}
