import {THREE,rng,TAU,ground,pathX,riverX,mat,instanceCells} from './core.js';
import {winterCrown} from './vegetation-shapes.js';

export function addOrchardsAndScrub(scene,tier,surfaceHeight,obstacles){
 const random=rng(58417),high=tier.name==='high',lite=tier.name==='lite',dummy=new THREE.Object3D(),orchard=[],scrub=[];
 const wood=mat('#6b5d46',{roughness:.94,vertexColors:true}),dry=mat('#807559',{roughness:1,vertexColors:true});
 const tree=winterCrown(rng(35),{height:5.2,width:2.4,limbs:9,segments:2,sides:4,forks:2,trunkSides:6,trunkSegments:4,poplar:false});
 const bush=winterCrown(rng(67),{height:1.05,width:.6,limbs:5,segments:1,sides:3,forks:1,trunkSides:4,trunkSegments:2,poplar:false});
 const stats={orchards:0,scrub:0,maxRootError:0,minObstacleClearance:Infinity,triangles:0};
 function place(list,x,z,scale,heightAt){
  const y=heightAt(x,z),slope=Math.hypot(heightAt(x+2,z)-heightAt(x-2,z),heightAt(x,z+2)-heightAt(x,z-2))/4;
  if(slope>.42||Math.abs(x-riverX(z))<24)return false;
  let clearance=Infinity;
  for(const o of obstacles){
   const dx=Math.abs(x-o.x),dz=Math.abs(z-o.z);
   clearance=Math.min(clearance,o.box?Math.hypot(Math.max(0,dx-o.rx),Math.max(0,dz-o.rz)):Math.hypot(dx,dz)-o.r);
  }
  if(clearance<3)return false;stats.minObstacleClearance=Math.min(stats.minObstacleClearance,clearance);
  dummy.position.set(x,y-.08,z);dummy.rotation.set(0,random()*TAU,0);dummy.scale.setScalar(scale);dummy.updateMatrix();list.push(dummy.matrix.clone());stats.maxRootError=Math.max(stats.maxRootError,Math.abs(dummy.position.y+.08-heightAt(x,z)));return true;
 }
 // Terraced apricot plots retain regular spacing, with small cultivation gaps.
 for(let f=0;f<7;f++){
  const z=-900+f*280,x=pathX(z)+140*(f%2?1:-1);
  for(let row=0;row<(high?6:lite?3:5);row++)for(let col=0;col<7;col++){
   const xx=x+row*6.8+(random()-.5),zz=z+62+col*7+(random()-.5);
   if(random()<.08||surfaceHeight(xx,zz)>ground(xx,zz)+.5)continue;
   place(orchard,xx,zz,.8+random()*.35,ground);
  }
 }
 // Scrub favours exposed terraces and plateau tops; steep cliff faces reject it.
 const wanted=high?2200:lite?600:1300;
 for(let attempt=0;scrub.length<wanted&&attempt<wanted*8;attempt++){
  const z=random()*2800-1400,x=pathX(z)+(random()<.5?-1:1)*(65+random()*620);
  if(surfaceHeight(x,z)<20)continue;place(scrub,x,z,.6+random()*1.3,surfaceHeight);
 }
 const trees=instanceCells(tree,wood,orchard,600,.5),bushes=instanceCells(bush,dry,scrub,600,.2);
 trees.name='Terraced apricot orchards';bushes.name='Plateau scrub';bushes.traverse(o=>{if(o.isMesh){o.castShadow=false;o.userData.noReflection=true;o.layers.disable(1);}});
 stats.orchards=orchard.length;stats.scrub=scrub.length;stats.triangles=(tree.index.count*orchard.length+bush.index.count*scrub.length)/3;
 scene.add(trees,bushes);return {trees,bushes,stats};
}
