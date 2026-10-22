import {THREE,rand,rng,TAU,ground,pathX,riverX,riverBanks,mat,uniforms,rod,combine,lerp,instanceCells} from './core.js';
import {winterCrown} from './vegetation-shapes.js';

export function addWinterTrees(scene,tier){
 const high=tier.name==='high',lite=tier.name==='lite',count=high?720:lite?320:480;
 const wood=mat('#62594b',{roughness:.94,vertexColors:true});
 const geometries=Array.from({length:4},(_,i)=>{const random=rng(11+i*47);return winterCrown(random,{height:14+random()*2,width:2.1,limbs:high?24:lite?14:18,segments:high?4:lite?2:3,sides:high?5:lite?3:4,forks:lite?2:3,trunkSides:high?8:6,trunkSegments:high?9:8});});
 // Deform the crown, leaving the roots fixed. The shadow material uses the
 // identical deformation; static instance matrices never need re-uploading.
 const bend=`vec3 treeBase=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
 float gust=sin(uTime*1.2-treeBase.x*.012-treeBase.z*.009)*(1.+uStorm*3.);
 vec2 bend=vec2(gust*.0011,sin(uTime*.9+treeBase.z*.015)*.00075*(1.+uStorm*2.));`;
 const deform=shader=>{
  shader.uniforms.uTime=uniforms.time;shader.uniforms.uStorm=uniforms.storm;
  shader.vertexShader='uniform float uTime,uStorm;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\n${bend}\ntransformed.xz+=bend*position.y*position.y;`);
  shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>\n{${bend}\nobjectNormal.y-=dot(objectNormal.xz,bend)*2.*position.y;}`);
 };
 wood.onBeforeCompile=deform;
 const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});depth.onBeforeCompile=deform;
 const matrices=Array.from({length:4},()=>[]),dummy=new THREE.Object3D(),extraPlacement=rng(4181);
 for(let i=0;i<count;i++){
  const placement=i<240?rand:extraPlacement;
  const z=-1400+i/count*2800+placement()*4,banks=riverBanks(z),side=i%2,x=banks[side]+(side?1:-1)*(8+placement()*12);
  dummy.position.set(x,ground(x,z)-.3,z);dummy.rotation.y=placement()*TAU;dummy.scale.setScalar(.65+placement()*.55);dummy.updateMatrix();matrices[i%4].push(dummy.matrix.clone());
 }
 const trees=new THREE.Group();geometries.forEach((geo,i)=>{const cells=instanceCells(geo,wood,matrices[i],240,3);while(cells.children.length)trees.add(cells.children[0]);});
 trees.name='Winter poplars';trees.userData.vegetation={count,triangles:geometries[0].index.count/3*count};trees.traverse(o=>{if(o.isMesh)o.customDepthMaterial=depth;});scene.add(trees);
 return trees;
}

// Curved winter grass blades share the spatial gust phase used by the flight model.
export function addWinterGrass(scene,tier,heightAt=ground){
 const high=tier.name==='high',lite=tier.name==='lite',perCell=high?768:lite?192:384,rows=high?4:3;
 const random=rng(8831),positions=[],indices=[],colors=[];
 for(let blade=0;blade<6;blade++){
  const angle=blade*TAU/6,height=.35+random()*.65,lean=.12+random()*.25;
  for(let row=0;row<rows;row++){
   const t=row/(rows-1),width=.038*(1-t)+.003,bend=t*t*lean;
   for(const side of[-1,1]){positions.push(Math.cos(angle)*bend-Math.sin(angle)*width*side,t*height,Math.sin(angle)*bend+Math.cos(angle)*width*side);colors.push(.7+t*.25,.67+t*.18,.52+t*.15);}
   if(row<rows-1){const q=blade*rows*2+row*2;indices.push(q,q+2,q+1,q+1,q+2,q+3);}
  }
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
 const material=mat('#a59a78',{vertexColors:true,side:THREE.DoubleSide});
 material.onBeforeCompile=s=>{s.uniforms.uTime=uniforms.time;s.uniforms.uStorm=uniforms.storm;s.uniforms.uSnow=uniforms.snow;s.vertexShader='uniform float uTime,uStorm;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vec3 base=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;float gust=(sin(uTime*.73-base.x*.012-base.z*.009)+.4*sin(uTime*1.6+base.z*.018))*(1.+uStorm*2.);transformed.x+=position.y*position.y*gust*.15;transformed.z-=position.y*position.y*(.12+gust*.08);transformed*=1.-smoothstep(80.,140.,length(base.xz-cameraPosition.xz));`);s.fragmentShader='uniform float uSnow;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.61,.68,.72),uSnow*.45);');};
 const grass=new THREE.Group(),dummy=new THREE.Object3D(),cellSize=96;let count=0;
 // Fixed terrain patches carry dense local scatter. Only nearby patches draw;
 // the 80-140 m shader fade reaches zero before a patch is culled.
 for(let iz=-15;iz<15;iz++){
  const z0=iz*cellSize,centre=pathX(z0+cellSize*.5),first=Math.floor((centre-480)/cellSize),last=Math.ceil((centre+480)/cellSize);
  for(let ix=first;ix<last;ix++){
   const placement=rng(8831+ix*928371+iz*3647),batch=new THREE.InstancedMesh(geo,material,perCell);let n=0;
   for(let i=0;i<perCell;i++){
    const x=(ix+placement())*cellSize,z=z0+placement()*cellSize;
    if(Math.abs(x-riverX(z))<15||heightAt(x,z)<4.5)continue;
    dummy.position.set(x,heightAt(x,z)-.025,z);dummy.scale.setScalar(.65+placement()*.7);dummy.rotation.y=placement()*TAU;dummy.updateMatrix();batch.setMatrixAt(n++,dummy.matrix);
   }
   batch.count=n;count+=n;batch.computeBoundingSphere();batch.boundingSphere.radius+=2;batch.castShadow=false;batch.receiveShadow=true;batch.userData.noReflection=true;batch.layers.disable(1);grass.add(batch);
  }
 }
 grass.name='Near winter ground cover';grass.userData.vegetation={count,triangles:geo.index.count/3*count,perCell,cellSize,fade:[80,140]};scene.add(grass);
 return {group:grass,update(camera){for(const cell of grass.children){const b=cell.boundingSphere;cell.visible=Math.hypot(camera.position.x-b.center.x,camera.position.z-b.center.z)<140+b.radius;}}};
}
