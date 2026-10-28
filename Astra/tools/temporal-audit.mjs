import {openReview,saveReport,saveImages} from './plan2-harness.mjs';
const run=await openReview();
try{
 const result=await run.page.evaluate(async()=>{
  const a=__ascent,q=__review;a.hero.group.visible=false;a.fleet.forEach(b=>b.group.visible=false);a.scene.traverse(o=>{if(o.isPoints)o.visible=false;});
  q.setTime(190);q.eye=[-25,147,745];q.target=[90,88,300];a.atmo.exposure.setFixed(1.8);
  for(let i=0;i<280;i++){q.eye[1]=147+i*4/60;q.target[1]=88+i*4/60;q.step(i/60,6.55+i/1200,false,false);await new Promise(r=>setTimeout(r,0));}
  const pass=a.atmo.temporal,mat=pass.material;
  mat.fragmentShader=mat.fragmentShader.replace('vec3 resolved=source.rgb;','vec3 resolved=source.rgb;vec3 debug=vec3(stable,0.,0.);').replace('bool sameSurface=abs(historyDepth-previous.w)<depthTolerance;','bool sameSurface=abs(historyDepth-previous.w)<depthTolerance;debug.y=sameSurface?1.:0.;').replace('resolved=mix(source.rgb,','debug.z=feedback;resolved=mix(source.rgb,').replace('vec4(resolved,','vec4(debug,');mat.needsUpdate=true;
  q.eye[1]+=4/60;q.target[1]+=4/60;q.step(280/60,6.55+280/1200,false,false);
  const target=pass.history,data=new Uint16Array(target.width*target.height*4);a.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,data);
  function half(n){const sign=(n&32768)?-1:1,e=(n>>10)&31,m=n&1023;return sign*(e?Math.pow(2,e-15)*(1+m/1024):Math.pow(2,-14)*m/1024);}
  const regions=[];for(let y=0;y<900;y+=180)for(let x=0;x<1440;x+=180){const sum=[0,0,0];for(let j=y;j<y+180;j++)for(let i=x;i<x+180;i++){const p=((899-j)*1440+i)*4;for(let k=0;k<3;k++)sum[k]+=half(data[p+k]);}regions.push({x,y,stable:sum[0]/32400,depthMatch:sum[1]/32400,feedback:sum[2]/32400});}
  return {regions,images:{mask:a.renderer.domElement.toDataURL('image/png').split(',')[1]}};
 });
 await saveImages(`plan2-temporal-audit-${run.tier}-${run.tag}`,result.images);await saveReport('temporal-audit',run,{regions:result.regions});console.log(JSON.stringify(result.regions));
}finally{await run.browser.close();}
