import {THREE,archShape,mesh,mat} from './core.js';

// A projected mask cuts the front skin while real chamber geometry supplies
// the reveals and back wall. The same cut is applied to the shadow material.
export function carveOpenings(rock,parent,openings,stone,fitCarving,maskWidth=1024){
 rock.updateWorldMatrix(true,false);
 const bounds=new THREE.Box3().setFromObject(rock),width=bounds.max.x-bounds.min.x,height=bounds.max.y-bounds.min.y;
 const canvas=document.createElement('canvas');canvas.width=maskWidth;canvas.height=maskWidth*1.5;
 const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='black';
 const origin=parent.getWorldPosition(new THREE.Vector3());
 for(const o of openings){
  const pts=archShape(o.w,o.h).getPoints(20);ctx.beginPath();
  pts.forEach((p,i)=>{const x=(origin.x+o.x+p.x-bounds.min.x)/width*canvas.width,y=(1-(origin.y+o.y+p.y-bounds.min.y)/height)*canvas.height;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();ctx.fill();
 }
 const mask=new THREE.CanvasTexture(canvas);mask.minFilter=THREE.LinearMipmapLinearFilter;mask.anisotropy=8;
 const rectangle=new THREE.Vector4(bounds.min.x,bounds.min.y,1/width,1/height),front=rock.getWorldPosition(new THREE.Vector3()).z;
 function maskShader(shader,depth=false){
  Object.assign(shader.uniforms,{uCaveMask:{value:mask},uCaveRect:{value:rectangle},uCaveFront:{value:front}});
  if(depth){
   shader.vertexShader='varying vec3 vWorld;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
   shader.fragmentShader='varying vec3 vWorld;\n'+shader.fragmentShader;
  }
  shader.fragmentShader='uniform sampler2D uCaveMask;uniform vec4 uCaveRect;uniform float uCaveFront;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`
   vec2 caveUv=(vWorld.xy-uCaveRect.xy)*uCaveRect.zw;
   if(vWorld.z>uCaveFront&&all(greaterThanEqual(caveUv,vec2(0.)))&&all(lessThanEqual(caveUv,vec2(1.))))diffuseColor.a*=texture2D(uCaveMask,caveUv).r;
   #include <alphatest_fragment>`);
 }
 const material=rock.material.clone(),previous=rock.material.onBeforeCompile;
 material.alphaTest=.5;material.alphaToCoverage=true;
 material.onBeforeCompile=shader=>{previous(shader);maskShader(shader);};
 material.customProgramCacheKey=()=> 'carved-tuff';rock.material=material;
 const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,alphaTest:.5});depth.onBeforeCompile=s=>maskShader(s,true);depth.customProgramCacheKey=()=> 'carved-tuff-shadow';rock.customDepthMaterial=depth;
 const dark=mat('#25201b',{roughness:1}),reveal=stone.clone();
 reveal.onBeforeCompile=stone.onBeforeCompile;reveal.customProgramCacheKey=stone.customProgramCacheKey;reveal.side=THREE.DoubleSide;
 for(const o of openings){
  const group=new THREE.Group();group.position.set(o.x,o.y,30);parent.add(group);
  const points=archShape(o.w,o.h).getPoints(20),ps=[],ix=[],ao=[],length=3.6+o.w*.7;
  for(const point of points){ps.push(point.x,point.y,0,point.x,point.y,-length);ao.push(.72,.12);}
  for(let i=0;i<points.length-1;i++){const q=i*2;ix.push(q,q+1,q+2,q+1,q+3,q+2);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setAttribute('aSurfaceAO',new THREE.Float32BufferAttribute(ao,1));g.setIndex(ix);g.computeVertexNormals();
  // The winding faces into the tunnel; retain the interior in grazing views.
  mesh(g,reveal,group);mesh(new THREE.ShapeGeometry(archShape(o.w,o.h)),dark,group,[0,0,-length]);
  fitCarving(group,rock);
 }
 return {mask,count:openings.length};
}
