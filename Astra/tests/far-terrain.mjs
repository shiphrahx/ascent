import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const tier=process.argv[2]??'medium';
const browser=await chromium.launch({channel:'chromium',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 const url=pathToFileURL(path.resolve('Ascent.html'));url.searchParams.set('quality',tier);
 await page.goto(url.href);await page.waitForFunction(()=>__ready,null,{timeout:120000});await page.waitForTimeout(2000);
 const result=await page.evaluate(()=>{
  const a=__ascent,far=a.world.farTerrain,r=a.renderer,c=a.camera,gl=r.getContext();a.pause();a.setHour(8.5);a.setStorm(0);a.hero.group.visible=false;
  a.atmo.temporal.enabled=false;a.atmo.skyU.uTime.value=12;a.atmo.fogPass.uniforms.uBurn.value=0;
  const image=far.texture.image,{width:size,data}=image,cell=65536/(size-1),p=far.skirt.geometry.attributes.position;
  const sample=(x,z)=>{const u=(x+32768)/cell,v=(z+32768)/cell,i=Math.floor(u),j=Math.floor(v),fx=u-i,fz=v-j;return (data[j*size+i]*(1-fx)+data[j*size+i+1]*fx)*(1-fz)+(data[(j+1)*size+i]*(1-fx)+data[(j+1)*size+i+1]*fx)*fz;};
  const coarse=(x,z,step)=>{const px=Math.floor(x/step)*step,pz=Math.floor(z/step)*step,u=(x-px)/step,v=(z-pz)/step,a=sample(px,pz),b=sample(px+step,pz),c=sample(px,pz+step),d=sample(px+step,pz+step);return u+v<=1?a+u*(b-a)+v*(c-a):d+(1-u)*(c-d)+(1-v)*(b-d);};
  let minOverlap=Infinity,maxOverlap=-Infinity;
  // During the valley flight, even lite keeps 128 m spacing across the entire
  // detailed border. Its 256 m transition begins beyond 5.12 km from the eye.
  for(let i=0;i<p.count;i+=2)for(const step of a.tier.name==='lite'?[128]:[32,64,128]){const gap=p.getY(i)-coarse(p.getX(i),p.getZ(i),step);minOverlap=Math.min(minOverlap,gap);maxOverlap=Math.max(maxOverlap,gap);}
  const snap=a.tier.name==='lite'?256:128,boundary=snap*.5;
  c.position.set(boundary,220,600);c.lookAt(boundary,160,-2600);c.updateMatrixWorld();
  const render=side=>{const state=a.atmo.update(12,8.5,a.hero.group.position,0,0,1);state.hero=a.hero.group.position;a.world.update(12,0,state);far.update({position:{x:boundary+side*.0001,z:600}});r.shadowMap.needsUpdate=true;a.atmo.render();};
  for(let i=0;i<6;i++)render(-1);
  const pixels=new Uint8Array(r.domElement.width*r.domElement.height*4);gl.readPixels(0,0,r.domElement.width,r.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  const before=r.domElement.toDataURL('image/png').split(',')[1];render(1);
  const next=new Uint8Array(pixels.length);gl.readPixels(0,0,r.domElement.width,r.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,next);
  let sum=0,changed=0;for(let i=0;i<pixels.length;i+=4){let peak=0;for(let k=0;k<3;k++){const d=(pixels[i+k]-next[i+k])/255;sum+=d*d;peak=Math.max(peak,Math.abs(d));}if(peak>2/255)changed++;}
  return {tier:a.tier.name,fieldSize:size,finite:data.every(Number.isFinite),rings:far.rings.children.length,triangles:far.rings.children.reduce((n,m)=>n+m.geometry.index.count/3,0),minOverlap,maxOverlap,boundaryRms:Math.sqrt(sum/(pixels.length/4*3)),boundaryChangedFraction:changed/(pixels.length/4),before,after:r.domElement.toDataURL('image/png').split(',')[1]};
 });
 const {before,after,...report}=result;report.errors=errors;
 await writeFile(`captures/far-terrain-${tier}-boundary-before.png`,Buffer.from(before,'base64'));await writeFile(`captures/far-terrain-${tier}-boundary-after.png`,Buffer.from(after,'base64'));
 await writeFile(`captures/far-terrain-${tier}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 assert.equal(report.rings,4);assert(report.finite);assert.deepEqual(errors,[]);
 assert(report.minOverlap>=0&&report.maxOverlap<80,'The detailed border overlaps the coarse field within its skirt');
 assert(report.boundaryRms<.003&&report.boundaryChangedFraction<.02,'LOD boundary shifts must preserve the image');
}finally{await browser.close();}
