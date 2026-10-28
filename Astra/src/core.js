import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {tuffAlbedo,soilAlbedo,tuffSurface,soilSurface,masonryAlbedo,masonrySurface} from './material-assets.js';
import {terraceHeight,valleyErosion,valleyTalus} from './landforms.js';
import {materialStrataGLSL} from './material-strata.js';
import {snowCoverageGLSL} from './snow.js';
export {THREE,mergeGeometries};
export const TAU=Math.PI*2,clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp,smooth=THREE.MathUtils.smoothstep;
export function rng(seed=4){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export const rand=rng(7631);
export function noise(x,z){return(Math.sin(x*.013+Math.sin(z*.019))*Math.cos(z*.011)+.5*Math.sin(x*.039+z*.025)+.24*Math.sin(x*.091-z*.078))/.99;}
export function pathX(z){return 95*Math.sin(z*.004)+55*Math.sin(z*.008+1);}
export function riverX(z){return pathX(z)-62+30*Math.sin(z*.009);}
function rawGround(x,z){
 const d=x-pathX(z);let h=86+noise(x,z)*9-70*Math.exp(-d*d/34000);
 h-=25*Math.exp(-Math.pow((x+250+120*Math.sin(z*.004))/85,2));
 h+=Math.abs(Math.sin(x*.016+z*.008))*8*smooth(Math.abs(d),130,380);
 h-=valleyErosion(x,z,d);
 h=terraceHeight(h,x,z,.82*smooth(Math.abs(d),24,115));
 h+=valleyTalus(x,z,d);
 const bank=Math.abs(x-riverX(z)),width=7.7+Math.sin(z*.029)*2.1+Math.sin(z*.007+1.3)*1.4;
 const depth=1.15+.55*(.5+.5*Math.sin(z*.013));
 if(bank<width)return 3.55-depth*(1-Math.pow(bank/width,2.4));
 // Low bars and gently rising wet margins precede the valley slopes.
 const bar=(.5+.5*Math.sin(z*.037+x*.14))*.22*smooth(bank,width,width+4);
 return lerp(3.55+(bank-width)*.065+bar,Math.max(h,4),smooth(bank,width+3,width+42));
}
// A river-aligned adaptive grid spends vertices on the banks, where a regular
// 14 m grid missed the entire channel. The flight/camera solver samples the
// exact same triangles as the visible mesh, without evaluating terrain noise.
let terrainOffsets,terrainRows,terrainStep,terrainColumns,terrainHeights,terrainCenters;
export function configureTerrain(tier){
 if(terrainHeights)return; // Fixed for the session: no moving geometry or LOD swaps.
 const high=tier.name==='high',bankOffsets=[];
 terrainStep=high?4:8;terrainRows=4000/terrainStep;
 for(let d=0;d<=12;d++)bankOffsets.push(d);
 for(let d=14;d<=40;d+=2)bankOffsets.push(d);
 if(high){
  for(let d=44;d<=800;d+=4)bankOffsets.push(d);
  for(let d=864;d<2600;d+=64)bankOffsets.push(d);bankOffsets.push(2600);
 }else{
  for(let d=48;d<=160;d+=8)bankOffsets.push(d);
  for(let d=180;d<=2600;d+=20)bankOffsets.push(d);
 }
 terrainOffsets=[...bankOffsets.slice(1).reverse().map(d=>-d),...bankOffsets];terrainColumns=terrainOffsets.length;
 terrainHeights=new Float32Array((terrainRows+1)*terrainColumns);terrainCenters=new Float64Array(terrainRows+1);
 for(let j=0;j<=terrainRows;j++){
  const z=j*terrainStep-2000,center=riverX(z);terrainCenters[j]=center;
  for(let k=0;k<terrainColumns;k++)terrainHeights[j*terrainColumns+k]=rawGround(center+terrainOffsets[k],z);
 }
}
export function ground(x,z){
 if(!terrainHeights)configureTerrain({name:'medium'});
 const pz=(z+2000)/terrainStep,j=Math.floor(pz),fz=pz-j;
 if(j<0||j>=terrainRows)return rawGround(x,z);
 const u=x-lerp(terrainCenters[j],terrainCenters[j+1],fz);
 if(u<terrainOffsets[0]||u>=terrainOffsets[terrainColumns-1])return rawGround(x,z);
 let lo=0,hi=terrainColumns-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(terrainOffsets[mid]>u)hi=mid;else lo=mid;}
 const fx=(u-terrainOffsets[lo])/(terrainOffsets[hi]-terrainOffsets[lo]),q=j*terrainColumns+lo;
 const a=terrainHeights[q],b=terrainHeights[q+1],c=terrainHeights[q+terrainColumns],d=terrainHeights[q+terrainColumns+1];
 return fx+fz<=1?a+fx*(b-a)+fz*(c-a):d+(1-fx)*(c-d)+(1-fz)*(b-d);
}
export function terrainGeometry(){
 if(!terrainHeights)configureTerrain({name:'medium'});
 const positions=[],uv=[],indices=[];
 for(let j=0;j<=terrainRows;j++)for(let k=0;k<terrainColumns;k++){
  const z=j*terrainStep-2000,x=terrainCenters[j]+terrainOffsets[k],q=j*terrainColumns+k;
  positions.push(x,terrainHeights[q],z);uv.push(x*.1,z*.1);
  if(j<terrainRows&&k<terrainColumns-1)indices.push(q,q+terrainColumns,q+1,q+1,q+terrainColumns,q+terrainColumns+1);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function terrainBoundary(){
 const point=(j,k)=>[terrainCenters[j]+terrainOffsets[k],terrainHeights[j*terrainColumns+k],j*terrainStep-2000];
 return [Array.from({length:terrainColumns},(_,k)=>point(0,k)),Array.from({length:terrainRows+1},(_,j)=>point(j,terrainColumns-1)),Array.from({length:terrainColumns},(_,k)=>point(terrainRows,terrainColumns-1-k)),Array.from({length:terrainRows+1},(_,j)=>point(terrainRows-j,0))];
}
export function riverBanks(z){
 const center=riverX(z),banks=[];
 for(const side of[-1,1]){let lo=0,hi=30;for(let i=0;i<12;i++){const mid=(lo+hi)*.5;if(ground(center+side*mid,z)<3.55)lo=mid;else hi=mid;}banks.push(center+side*(lo+hi)*.5);}
 return banks;
}
export function wind(x,y,z,t,storm=0){const q=smooth(y,40,180),a=lerp(-.95,.95,q)+.2*Math.sin(t*.023),g=(Math.sin(t*.73-x*.012-z*.009)+.4*Math.sin(t*1.6+z*.018))*(1+storm*2);return new THREE.Vector3(-4.6*(.38*Math.cos(z*.004)+.44*Math.cos(z*.008+1))+Math.sin(a)*4.5*smooth(y,5,50)+g*.65,.3*Math.sin(t*.7+x*.02),-4.9+q*.6+g*.5);}
export const uniforms={time:{value:0},sun:{value:new THREE.Vector3(.7,.1,-.6)},day:{value:1},night:{value:0},storm:{value:0},snow:{value:.35},frost:{value:1},wind:{value:new THREE.Vector3()},flame:{value:0}};
export function mat(color,opts={}){return new THREE.MeshStandardMaterial({color,roughness:.9,...opts});}
function occlusionAttribute(geometry,material){if(material.userData.surfaceOcclusion&&!geometry.attributes.aSurfaceAO){const values=new Float32Array(geometry.attributes.position.count);values.fill(1);geometry.setAttribute('aSurfaceAO',new THREE.BufferAttribute(values,1));}}
export function mesh(geo,material,parent,pos=[0,0,0],scale){if(material.vertexColors&&!geo.attributes.color){const c=new Float32Array(geo.attributes.position.count*3);c.fill(1);geo.setAttribute("color",new THREE.BufferAttribute(c,3));}occlusionAttribute(geo,material);const m=new THREE.Mesh(geo,material);m.position.set(...pos);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;if(parent)parent.add(m);return m;}
export function sphere(parent,material,pos,scale,detail=16){return mesh(new THREE.SphereGeometry(1,detail,Math.max(8,detail/2)),material,parent,pos,scale);}
export function box(parent,material,pos,scale){return mesh(new THREE.BoxGeometry(...scale),material,parent,pos);}
export function rod(parent,a,b,r,material,segments=8,r2=r){a=new THREE.Vector3(...a);b=new THREE.Vector3(...b);const m=mesh(new THREE.CylinderGeometry(r2,r,a.distanceTo(b),segments),material,parent,a.clone().add(b).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());return m;}
export function tube(parent,points,r,material,segments=50){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(new THREE.TubeGeometry(curve,segments,r,5,false),material,parent);}
export function combine(group){const map=new Map();group.updateMatrixWorld(true);group.traverse(o=>{if(o.isMesh&&!Array.isArray(o.material)){const key=o.material;let gs=map.get(key);if(!gs){gs=[];map.set(key,gs);}const g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(g.index)gs.push(g.toNonIndexed());else gs.push(g);}});const result=new THREE.Group();for(const [m,gs]of map){const g=mergeGeometries(gs,false);if(g)mesh(g,m,result);gs.forEach(g=>g.dispose());}return result;}
export function canvasTexture(size,paint){const c=document.createElement('canvas');c.width=c.height=size;paint(c.getContext('2d'),size);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=8;return tex;}
// Small spatial batches allow camera and shadow frusta to reject unseen objects.
// Padding includes all shader wind displacement, avoiding edge-of-screen popping.
export function instanceCells(geometry,material,matrices,cellSize=600,padding=0){
 occlusionAttribute(geometry,material);
 const cells=new Map(),group=new THREE.Group();
 for(const matrix of matrices){const e=matrix.elements,key=`${Math.floor(e[12]/cellSize)},${Math.floor(e[14]/cellSize)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(matrix);}
 for(const entries of cells.values()){
  const batch=new THREE.InstancedMesh(geometry,material,entries.length);
  entries.forEach((matrix,i)=>batch.setMatrixAt(i,matrix));
  batch.computeBoundingSphere();batch.boundingSphere.radius+=padding;
  batch.castShadow=batch.receiveShadow=true;group.add(batch);
 }
 return group;
}
// Split large landscape surfaces without changing their vertices or normals.
// Camera, reflection and each shadow cascade can then reject whole regions.
export function landscapeCells(geometry,material,parent,cellSize=500){
 const position=geometry.attributes.position,index=geometry.index,cells=new Map();
 for(let i=0;i<index.count;i+=3){
  const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
  const x=(position.getX(a)+position.getX(b)+position.getX(c))/3,z=(position.getZ(a)+position.getZ(b)+position.getZ(c))/3;
  const key=`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`;
  if(!cells.has(key))cells.set(key,[]);cells.get(key).push(a,b,c);
 }
 const result=new THREE.Group();
 for(const indices of cells.values()){
  const remap=new Map(),vertices=[],local=[];
  for(const source of indices){if(!remap.has(source)){remap.set(source,vertices.length);vertices.push(source);}local.push(remap.get(source));}
  const g=new THREE.BufferGeometry();
  for(const [name,attribute]of Object.entries(geometry.attributes)){
   const data=new Float32Array(vertices.length*attribute.itemSize);
   vertices.forEach((source,i)=>{for(let k=0;k<attribute.itemSize;k++)data[i*attribute.itemSize+k]=attribute.array[source*attribute.itemSize+k];});
   g.setAttribute(name,new THREE.BufferAttribute(data,attribute.itemSize));
  }
  g.setIndex(local);g.computeBoundingSphere();const part=mesh(g,material,result);part.matrixAutoUpdate=false;
 }
 geometry.dispose();parent.add(result);return result;
}
export const rockTexture=tuffAlbedo;
export function stoneMaterial(color='#c8a78d',type=0,soilDetail=true){
 const masonry=type===5,terrain=type===4||type===6;
 const m=mat(color,{map:masonry?masonryAlbedo:rockTexture,bumpMap:masonry?masonrySurface:tuffSurface,bumpScale:.1,vertexColors:true});
 m.userData.surfaceOcclusion=true;
 m.color.lerp(new THREE.Color('#ffffff'),type===2?.12:.45);
 m.onBeforeCompile=s=>{
  Object.assign(s.uniforms,{uSnow:uniforms.snow,uFrost:uniforms.frost,uStorm:uniforms.storm,uSoil:{value:soilAlbedo},uSoilSurface:{value:soilSurface}});
  s.vertexShader='varying vec3 vWorld;varying vec3 vWN;attribute float aSurfaceAO;varying float vSurfaceAO;\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
   vec4 rockWorld=vec4(transformed,1.0);
   #ifdef USE_INSTANCING
   rockWorld=instanceMatrix*rockWorld;
   #endif
   vWorld=(modelMatrix*rockWorld).xyz;vWN=normalize(inverseTransformDirection(transformedNormal,viewMatrix));vSurfaceAO=aSurfaceAO;`);
  s.fragmentShader=`varying vec3 vWorld;varying vec3 vWN;varying float vSurfaceAO;uniform float uSnow,uFrost,uStorm;uniform sampler2D uSoil,uSoilSurface;
   float rh(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
   float rn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(rh(i),rh(i+vec2(1,0)),f.x),mix(rh(i+vec2(0,1)),rh(i+vec2(1,1)),f.x),f.y);}
   ${materialStrataGLSL}
   ${snowCoverageGLSL}
   `+s.fragmentShader;
  // World-space mapping removes stretched UVs on steep rock faces. Texture
  // mipmaps and derivative filtering suppress subpixel strata and frost sparkle.
  s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`
   vec3 triWeight=pow(abs(normalize(vWN)),vec3(4.));triWeight/=max(dot(triWeight,vec3(1.)),.001);
   vec3 rockUV=vWorld*.25;
   vec3 texel=texture2D(map,rockUV.zy).rgb*triWeight.x+texture2D(map,rockUV.xz).rgb*triWeight.y+texture2D(map,rockUV.xy).rgb*triWeight.z;
   vec3 surface=texture2D(bumpMap,rockUV.zy).rgb*triWeight.x+texture2D(bumpMap,rockUV.xz).rgb*triWeight.y+texture2D(bumpMap,rockUV.xy).rgb*triWeight.z;
   vec3 broadUV=vWorld*.027;
   ${terrain||masonry?'':`vec3 broad=texture2D(map,vec2(broadUV.x+broadUV.z,broadUV.y)+vec2(.37,.63)).rgb;
   texel=mix(texel,broad,.22);`}
   ${terrain?`float soilBlend=smoothstep(.64,.94,normalize(vWN).y);
   vec3 soil=texture2D(uSoil,vWorld.xz*.34).rgb;
   float soilPatch=rn(vWorld.xz*.014)*.65+rn(vWorld.xz*.045)*.35;
   float dryGrass=smoothstep(.44,.66,soilPatch)*smoothstep(.74,.96,normalize(vWN).y);
   soil*=mix(vec3(.92,.84,.73),vec3(.76,.82,.56),dryGrass);
   texel=mix(texel,soil,soilBlend*.93);`:''}
   ${terrain?(soilDetail?'surface=mix(surface,texture2D(uSoilSurface,vWorld.xz*.34).rgb,soilBlend);':'surface.r=mix(surface.r,.93,soilBlend);surface.b=mix(surface.b,.92,soilBlend);'):''}
   diffuseColor.rgb*=texel;
   // Fine colour/relief comes from mipmapped baked fields. Removing the old
   // extra procedural grain avoids shimmer and pays for metre-scale strata.
   float stoneHeight=surface.g*${masonry?'.045':terrain?'mix(.16,.045,soilBlend)':'.16'};`);
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   ${masonry?'':`diffuseColor.rgb*=mineralTint(vWorld);`}
   ${masonry||type===2?'':`diffuseColor.rgb*=mix(vec3(1.),strataTint(vWorld),${terrain?'1.-soilBlend*.85':'.8'});`}
   float drift=rn(vWorld.xz*.025)*.5+rn(vWorld.xz*.08+5.)*.32+rn(vWorld.xz*.27)*.18;
   float snowSky=1.;
   float cover=snowCoverage(normalize(vWN),snowSky,uSnow,drift,fwidth(drift));
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.76,.81,.85)*(.96+.04*surface.g),cover*.96);
   diffuseColor.rgb*=1.-(1.-uSnow)*.045;
   ${type===4?`float river=95.*sin(vWorld.z*.004)+55.*sin(vWorld.z*.008+1.)-62.+30.*sin(vWorld.z*.009);
   float wetBank=(1.-smoothstep(7.,28.,abs(vWorld.x-river)))*(1.-smoothstep(3.6,5.4+rn(vWorld.xz*.17)*.45,vWorld.y));
   diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.62,.57,.46),wetBank);`:''}
   `);
  s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`
   float bumpFade=1.-smoothstep(.3,1.5,length(fwidth(vWorld)));
   normal=perturbNormalArb(-vViewPosition,normal,vec2(dFdx(stoneHeight),dFdy(stoneHeight))*bumpFade*(1.-cover*.85),faceDirection);`);
  s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
   roughnessFactor=mix(surface.r,.88,cover);${type===4?'roughnessFactor=mix(roughnessFactor,.6,wetBank*(1.-cover));':''}`);
  s.fragmentShader=s.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
   reflectedLight.indirectDiffuse*=vSurfaceAO*surface.b;
   reflectedLight.indirectSpecular*=mix(1.,vSurfaceAO*surface.b,.7);`);
  if(type===3)s.fragmentShader=s.fragmentShader.replace('#include <fog_fragment>', '#ifdef USE_FOG\nfloat fogFactor=1.-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth*(.025+uStorm*.975));gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogFactor);\n#endif');
 };
 m.customProgramCacheKey=()=>`tuff-material-${type}-${soilDetail}-snow-aspect`;
 return m;
}
export function colors(geo,f){const p=geo.attributes.position,a=[];for(let i=0;i<p.count;i++){const c=f(p.getX(i),p.getY(i),p.getZ(i),i);a.push(c.r,c.g,c.b);}geo.setAttribute('color',new THREE.Float32BufferAttribute(a,3));return geo;}
export function archShape(w,h){const s=new THREE.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(w/2,h-w/2);s.absarc(0,h-w/2,w/2,0,Math.PI,false);s.lineTo(-w/2,0);return s;}
