import {THREE,rand,rng,TAU,ground,pathX,riverX,mat,uniforms,rod,combine,lerp,instanceCells} from './core.js';

export function addWinterTrees(scene){
 const wood=mat('#62594b',{roughness:.94,vertexColors:true});
 function shape(seed){
  const random=rng(seed),positions=[],indices=[],colors=[];
  // Tapered, curved branches share connected endpoints. Four seeded crowns
  // avoid repeating one silhouette, with no visibility swaps or LOD dithering.
  function branch(start,end,radius,tipRadius,bow,segments=4,sides=5){
   const first=positions.length/3,axis=end.clone().sub(start).normalize(),tangent=new THREE.Vector3(0,0,1).cross(axis).normalize(),bitangent=tangent.clone().cross(axis).normalize();
   for(let j=0;j<=segments;j++){
    const t=j/segments,center=start.clone().lerp(end,t).addScaledVector(bow,Math.sin(t*Math.PI)),r=lerp(radius,tipRadius,t);
    for(let k=0;k<=sides;k++){
     const a=k/sides*TAU,p=center.clone().addScaledVector(tangent,Math.cos(a)*r).addScaledVector(bitangent,Math.sin(a)*r);
     positions.push(p.x,p.y,p.z);const color=.72+.24*(.5+.5*Math.sin(a*3+seed));colors.push(color,color*.97,color*.9);
     if(j<segments&&k<sides){const q=first+j*(sides+1)+k;indices.push(q,q+sides+1,q+1,q+1,q+sides+1,q+sides+2);}
    }
   }
  }
  const top=new THREE.Vector3((random()-.5)*.8,14+random()*2,(random()-.5)*.8);
  branch(new THREE.Vector3(),top,.29,.025,new THREE.Vector3(.12,0,-.08),9,8);
  for(let j=0;j<24;j++){
   const y=2.1+j*.47,a=j*2.399+random()*.65,span=(1.1+random()*2)*(1-Math.pow(y/19,2));
   const start=top.clone().multiplyScalar(y/top.y),tip=new THREE.Vector3(Math.cos(a)*span,y+2.2+random()*3,Math.sin(a)*span);
   branch(start,tip,.085*(1-y/24),.015,new THREE.Vector3(Math.cos(a)*.2,-.22,Math.sin(a)*.2),4);
   for(let k=0;k<3;k++){
    const fork=start.clone().lerp(tip,.42+k*.19),angle=a+(k%2?-.65:.7),end=tip.clone().add(new THREE.Vector3(Math.cos(angle)*(.4+random()*.6),.5+random()*1.1,Math.sin(angle)*(.4+random()*.6)));
    branch(fork,end,.027,.006,new THREE.Vector3(0,-.12,0),2,3);
   }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
 }
 const geometries=Array.from({length:4},(_,i)=>shape(11+i*47));
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
 const matrices=Array.from({length:4},()=>[]),dummy=new THREE.Object3D(),placement=rand;
 for(let i=0;i<240;i++){
  const z=-1400+i/240*2800+placement()*10,x=riverX(z)+(i%2?1:-1)*(22+placement()*14);
  dummy.position.set(x,ground(x,z)-.3,z);dummy.rotation.y=placement()*TAU;dummy.scale.setScalar(.65+placement()*.55);dummy.updateMatrix();matrices[i%4].push(dummy.matrix.clone());
 }
 const trees=new THREE.Group();geometries.forEach((geo,i)=>{const cells=instanceCells(geo,wood,matrices[i],240,3);while(cells.children.length)trees.add(cells.children[0]);});
 trees.name='Winter poplars';trees.traverse(o=>{if(o.isMesh)o.customDepthMaterial=depth;});scene.add(trees);
 return trees;
}

// Curved winter grass blades share the spatial gust phase used by the flight model.
export function addWinterGrass(scene){
 const random=rng(8831),positions=[],indices=[],colors=[];
 for(let blade=0;blade<6;blade++){
  const angle=blade*TAU/6,height=.35+random()*.65,lean=.12+random()*.25;
  for(let row=0;row<4;row++){
   const t=row/3,width=.038*(1-t)+.003,bend=t*t*lean;
   for(const side of[-1,1]){positions.push(Math.cos(angle)*bend-Math.sin(angle)*width*side,t*height,Math.sin(angle)*bend+Math.cos(angle)*width*side);colors.push(.7+t*.25,.67+t*.18,.52+t*.15);}
   if(row<3){const q=blade*8+row*2;indices.push(q,q+2,q+1,q+1,q+2,q+3);}
  }
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
 const material=mat('#a59a78',{vertexColors:true,side:THREE.DoubleSide});
 material.onBeforeCompile=s=>{s.uniforms.uTime=uniforms.time;s.uniforms.uStorm=uniforms.storm;s.uniforms.uSnow=uniforms.snow;s.vertexShader='uniform float uTime,uStorm;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vec3 base=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;float gust=(sin(uTime*.73-base.x*.012-base.z*.009)+.4*sin(uTime*1.6+base.z*.018))*(1.+uStorm*2.);transformed.x+=position.y*position.y*gust*.15;transformed.z-=position.y*position.y*(.12+gust*.08);`);s.fragmentShader='uniform float uSnow;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.61,.68,.72),uSnow*.45);');};
 const matrices=[],dummy=new THREE.Object3D();
 while(matrices.length<4200){const z=random()*2700-1350,x=pathX(z)+(random()-.5)*700;if(Math.abs(x-riverX(z))<25)continue;dummy.position.set(x,ground(x,z)-.02,z);dummy.scale.setScalar(.65+random()*.7);dummy.rotation.y=random()*TAU;dummy.updateMatrix();matrices.push(dummy.matrix.clone());}
 const grass=instanceCells(geo,material,matrices,240,2);grass.traverse(o=>{if(o.isMesh){o.castShadow=false;o.layers.disable(1);}});scene.add(grass);
}
