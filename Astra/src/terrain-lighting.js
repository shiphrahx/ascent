import * as THREE from 'three';
import {createTextureTransition} from './texture-transition.js';
import {bakeTerrainHorizons} from './terrain-horizons.js';

const bounds=[-3000,-2400,3000,2400];
export const terrainLightUniforms={uTerrainLightEnabled:{value:0},uTerrainMeanBounce:{value:new THREE.Vector3()},uTerrainVisibility:{value:null},uTerrainBounce:{value:null},uTerrainRect:{value:new THREE.Vector4(-3000,-2400,1/6000,1/4800)},uTerrainTexel:{value:1},uBounceTexel:{value:1}};
let staticField;
function texture(data,size){const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.HalfFloatType);t.minFilter=t.magFilter=THREE.LinearFilter;t.needsUpdate=true;return t;}
const half=THREE.DataUtils.toHalfFloat;

export function createTerrainLighting(heightAt,tier,renderer){
 const size=tier.name==='lite'?129:257,directions=tier.name==='high'?16:8;
 const started=performance.now(),field=bakeTerrainHorizons({heightAt,bounds,size,directions}),encoded=new Uint16Array(size*size*4);
 for(let i=0;i<size*size;i++){encoded[i*4]=half(field.visibility[i]);encoded[i*4+1]=half(field.heights[i]);encoded[i*4+2]=half(1);encoded[i*4+3]=half(1);}
 staticField=field;
 const visibility=texture(encoded,size),bounceSize=tier.name==='high'?129:tier.name==='lite'?33:65;
 const bounceData=new Uint16Array(bounceSize*bounceSize*4),radiance=new Float32Array(bounceSize*bounceSize*3),scratch=radiance.slice(),blurred=radiance.slice(),bounce=texture(bounceData,bounceSize);
 const interval=tier.name==='lite'?1:.5,transition=tier.name==='high'?createTextureTransition(renderer,bounceSize,bounceSize):null;
 const fromMean=new THREE.Vector3(),targetMean=new THREE.Vector3();let meanStarted=-Infinity;
 terrainLightUniforms.uTerrainVisibility.value=visibility;terrainLightUniforms.uTerrainBounce.value=transition?transition.output.texture:bounce;terrainLightUniforms.uTerrainTexel.value=1/size;terrainLightUniforms.uBounceTexel.value=1/bounceSize;terrainLightUniforms.uTerrainLightEnabled.value=1;
 let lastTime=-Infinity,lastIntensity=-1,lastSnow=-1;const lastDirection=new THREE.Vector3(0,-1,0),lastColor=new THREE.Color();
 const stats={size,directions,bounceSize,bakeMs:performance.now()-started,updates:0,lastUpdateMs:0};
 return {field,visibility,bounce,transition,stats,setEnabled(value){terrainLightUniforms.uTerrainLightEnabled.value=value?1:0;},update(time,light){
  if(!light)return;
  const lightingClock=performance.now()/1000;transition?.update(lightingClock);
  terrainLightUniforms.uTerrainMeanBounce.value.lerpVectors(fromMean,targetMean,THREE.MathUtils.smoothstep(lightingClock-meanStarted,0,interval));
  const {direction,color,intensity,snow}=light,force=lastDirection.distanceToSquared(direction)>.01||Math.abs(lastIntensity-intensity)>.4||Math.abs(lastSnow-snow)>.1;
  if(!force&&time-lastTime<interval)return;
  if(!force&&lastDirection.distanceToSquared(direction)<1e-8&&Math.abs(lastIntensity-intensity)<.001&&Math.abs(lastSnow-snow)<.001&&lastColor.equals(color))return;
  const start=performance.now(),elevation=Math.atan2(direction.y,Math.hypot(direction.x,direction.z));
  const azimuth=(Math.atan2(direction.z,direction.x)/(Math.PI*2)+1)%1*directions,d0=Math.floor(azimuth),d1=(d0+1)%directions,fraction=azimuth-d0;
  fromMean.copy(terrainLightUniforms.uTerrainMeanBounce.value);const mean=targetMean;mean.set(0,0,0);
  for(let z=0;z<bounceSize;z++)for(let x=0;x<bounceSize;x++){
   const q=Math.round(z/(bounceSize-1)*(size-1))*size+Math.round(x/(bounceSize-1)*(size-1)),p=(z*bounceSize+x)*3;
   const horizon=field.angles[q*directions+d0]*(1-fraction)+field.angles[q*directions+d1]*fraction;
   const sunlight=THREE.MathUtils.smoothstep(elevation,horizon-.025,horizon+.025)*Math.max(0,field.normals[q*3]*direction.x+field.normals[q*3+1]*direction.y+field.normals[q*3+2]*direction.z);
   const soil=THREE.MathUtils.smoothstep(field.normals[q*3+1],.65,.94),snowCover=soil*Math.max(0,snow-.35)*.7;
   const energy=intensity*sunlight/Math.PI;
   radiance[p]=((.34-soil*.12)*(1-snowCover)+.75*snowCover)*color.r*energy;
   radiance[p+1]=((.25-soil*.07)*(1-snowCover)+.75*snowCover)*color.g*energy;
   radiance[p+2]=((.17-soil*.045)*(1-snowCover)+.75*snowCover)*color.b*energy;
   mean.x+=radiance[p];mean.y+=radiance[p+1];mean.z+=radiance[p+2];
  }
  mean.multiplyScalar(1/(bounceSize*bounceSize));
  // A small separable blur approximates radiance arriving from nearby terrain.
  for(let z=0;z<bounceSize;z++)for(let x=0;x<bounceSize;x++)for(let k=0;k<3;k++){
   const q=(z*bounceSize+x)*3+k,l=(z*bounceSize+Math.max(0,x-1))*3+k,r=(z*bounceSize+Math.min(bounceSize-1,x+1))*3+k;
   scratch[q]=radiance[l]*.25+radiance[q]*.5+radiance[r]*.25;
  }
  for(let z=0;z<bounceSize;z++)for(let x=0;x<bounceSize;x++)for(let k=0;k<3;k++){
   const q=(z*bounceSize+x)*3+k,lo=(Math.max(0,z-1)*bounceSize+x)*3+k,hi=(Math.min(bounceSize-1,z+1)*bounceSize+x)*3+k;
   blurred[q]=scratch[lo]*.25+scratch[q]*.5+scratch[hi]*.25;bounceData[(z*bounceSize+x)*4+k]=half(blurred[q]);
  }
  transition?.snapshot();bounce.needsUpdate=true;transition?.start(bounce,lightingClock,interval);
  meanStarted=lightingClock;if(stats.updates===0){fromMean.copy(targetMean);terrainLightUniforms.uTerrainMeanBounce.value.copy(targetMean);}
  lastTime=time;lastIntensity=intensity;lastSnow=snow;lastDirection.copy(direction);lastColor.copy(color);stats.updates++;stats.lastUpdateMs=performance.now()-start;
 }};
}

// Lower tiers bake static terrain visibility once. A shared geometry wrapper
// keeps existing vertex/index buffers; instances receive one value per footing.
export function bakeStaticTerrainLighting(object){
 if(!staticField||!object.isMesh||object.name.startsWith('Far terrain ring ')||![].concat(object.material??[]).some(m=>m.userData.surfaceOcclusion))return;
 const source=object.geometry,geometry=new THREE.BufferGeometry();
 geometry.index=source.index;geometry.attributes={...source.attributes};geometry.groups=source.groups.slice();geometry.drawRange={...source.drawRange};geometry.boundingBox=source.boundingBox;geometry.boundingSphere=source.boundingSphere;
 const count=object.isInstancedMesh?object.count:source.attributes.position.count,values=new Float32Array(count*2),point=new THREE.Vector3(),matrix=new THREE.Matrix4(),f=staticField;
 const sample=(data,x,z)=>{const ix=Math.min(f.size-2,Math.floor(x)),iz=Math.min(f.size-2,Math.floor(z)),fx=x-ix,fz=z-iz,q=iz*f.size+ix;return (data[q]*(1-fx)+data[q+1]*fx)*(1-fz)+(data[q+f.size]*(1-fx)+data[q+f.size+1]*fx)*fz;};
 for(let i=0;i<count;i++){
  if(object.isInstancedMesh){object.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);}else point.fromBufferAttribute(source.attributes.position,i);
  point.applyMatrix4(object.matrixWorld);
  const u=(point.x-bounds[0])/(bounds[2]-bounds[0]),v=(point.z-bounds[1])/(bounds[3]-bounds[1]),edge=1-THREE.MathUtils.smoothstep(Math.max(Math.abs(u-.5),Math.abs(v-.5)),.43,.5);
  let sky=1,bounce=0;
  if(edge>0){const x=u*(f.size-1),z=v*(f.size-1),above=Math.max(0,point.y-sample(f.heights,x,z));sky=1+(Math.max(.18,sample(f.visibility,x,z))-1)*edge*(1-THREE.MathUtils.smoothstep(above,20,140));bounce=edge*Math.exp(-above/80)*(1-THREE.MathUtils.smoothstep(above,140,240))*.8;}
  values[i*2]=sky;values[i*2+1]=bounce;
 }
 geometry.setAttribute('aTerrainLight',object.isInstancedMesh?new THREE.InstancedBufferAttribute(values,2):new THREE.BufferAttribute(values,2));object.geometry=geometry;
}

// High evaluates local radiance per pixel. Medium/lite use baked visibility
// and the field's mean warm bounce, with no lighting texture fetches per frame.
export function applyTerrainLighting(shader,perFragment=true){
 Object.assign(shader.uniforms,terrainLightUniforms);
 const uniforms='uniform float uTerrainLightEnabled,uTerrainTexel,uBounceTexel;uniform vec4 uTerrainRect;uniform sampler2D uTerrainVisibility,uTerrainBounce;\n';
 const evaluate=`vec4 terrainLightAt(vec3 world,vec3 worldNormal){
  vec2 uv=(world.xz-uTerrainRect.xy)*uTerrainRect.zw;
  float edge=1.-smoothstep(.43,.5,max(abs(uv.x-.5),abs(uv.y-.5)));
  if(edge<=0.)return vec4(0.,0.,0.,1.);
  vec4 field=texture2D(uTerrainVisibility,uv*(1.-uTerrainTexel)+uTerrainTexel*.5);
  float heightAbove=max(0.,world.y-field.g),nearGround=1.-smoothstep(20.,140.,heightAbove);
  if(heightAbove>=240.)return vec4(0.,0.,0.,1.);
  float sky=mix(1.,max(.18,field.r),edge*nearGround);
  vec3 groundRadiance=texture2D(uTerrainBounce,uv*(1.-uBounceTexel)+uBounceTexel*.5).rgb;
  float facingGround=.18+.65*(1.-max(0.,normalize(worldNormal).y));
  return vec4(groundRadiance*(facingGround*edge*exp(-heightAbove/80.)*(1.-smoothstep(140.,240.,heightAbove))*.8),sky);
 }\n`;
 const varying=perFragment?'varying vec3 vTerrainWorld,vTerrainNormal;\n':'varying vec4 vTerrainLight;\n';
 shader.vertexShader=varying+(perFragment?'':'attribute vec2 aTerrainLight;uniform float uTerrainLightEnabled;uniform vec3 uTerrainMeanBounce;\n')+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
  vec4 terrainWorld=vec4(transformed,1.);
  #ifdef USE_INSTANCING
  terrainWorld=instanceMatrix*terrainWorld;
  #endif
  vec3 terrainPosition=(modelMatrix*terrainWorld).xyz,terrainNormal=normalize(inverseTransformDirection(transformedNormal,viewMatrix));
  ${perFragment?'vTerrainWorld=terrainPosition;vTerrainNormal=terrainNormal;':'vTerrainLight=uTerrainLightEnabled>.5?vec4(uTerrainMeanBounce*aTerrainLight.y*(.18+.65*(1.-max(0.,terrainNormal.y))),aTerrainLight.x):vec4(0.,0.,0.,1.);'}`);
 shader.fragmentShader=varying+(perFragment?uniforms+evaluate:'')+shader.fragmentShader;
  // Reuse the same sky visibility for snow retention and indirect lighting.
  // Moving the evaluation earlier avoids an extra texture query on high.
  shader.fragmentShader=shader.fragmentShader.replace('void main() {',`void main() {
   ${perFragment?'vec4 terrainLight=uTerrainLightEnabled>.5?terrainLightAt(vTerrainWorld,vTerrainNormal):vec4(0.,0.,0.,1.);':'vec4 terrainLight=vTerrainLight;'}`);
  shader.fragmentShader=shader.fragmentShader.replace('float snowSky=1.;','float snowSky=terrainLight.a;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`
  reflectedLight.indirectDiffuse*=terrainLight.a;
  reflectedLight.indirectSpecular*=mix(1.,terrainLight.a,clamp(roughnessFactor+.15,0.,1.));
  reflectedLight.indirectDiffuse+=material.diffuseColor*terrainLight.rgb;
  #include <aomap_fragment>`);
}
