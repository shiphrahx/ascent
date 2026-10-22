import {THREE,rng} from './core.js';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
const nr=rng(341),noiseData=new Uint8Array(256*256*4),noiseBase=Uint8Array.from({length:65536},()=>nr()*255);for(let y=0;y<256;y++)for(let x=0;x<256;x++){let i=(x+y*256)*4;noiseData[i]=noiseBase[x+y*256];noiseData[i+1]=noiseBase[((x+37)%256)+((y+17)%256)*256];noiseData[i+2]=noiseData[i];noiseData[i+3]=255;}const noiseTex=new THREE.DataTexture(noiseData,256,256);noiseTex.wrapS=noiseTex.wrapT=THREE.RepeatWrapping;noiseTex.magFilter=THREE.LinearFilter;noiseTex.minFilter=THREE.LinearMipmapLinearFilter;noiseTex.generateMipmaps=true;noiseTex.needsUpdate=true;export const noiseUniform={value:noiseTex};
export const noiseGLSL=`
float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
uniform sampler2D uNoise;float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec2 uv=i.xy+vec2(37.,17.)*i.z+f.xy;vec2 rg=texture2DLodEXT(uNoise,(uv+.5)/256.,0.).rg;return mix(rg.r,rg.g,f.z);}
const mat3 noiseRotation=mat3(.00,.80,.60,-.80,.36,-.48,-.60,-.48,.64);
float fbm(vec3 p){float n=noise3(p)*.53;p=noiseRotation*p*2.03+3.;n+=noise3(p)*.28;p=noiseRotation*p*2.01+7.;return n+noise3(p)*.19;}
`;
export const cloudDensityGLSL=`
float density(vec3 p){
 float height=smoothstep(620.,690.,p.y)*(1.-smoothstep(810.,1250.,p.y));
 vec3 q=p*vec3(.0018,.0032,.0018)+vec3(uTime*.002,0.,uTime*.0007);
 float weather=noise3(vec3(q.x*.19,2.,q.z*.19));
 float shape=noise3(q)*.72+noise3(q*2.04+17.)*.28;
 float erosion=noise3(q*6.7+3.)*.12+noise3(q*13.1)*.04;
 // A flat condensation base and eroded, billowing tops. Density remapping
 // gives defined cloud edges without raising ray count or texture resolution.
 float body=shape+weather*.13-erosion-(1.-height)*.38;
 return clamp((body-(.55-uStorm*.24))*5.,0.,1.);
}
`;

export const cloudShadowUniforms={uCloudShadow:{value:null},uCloudPrevious:{value:null},uCloudBlend:{value:1},uCloudShadowEnabled:{value:0},uCloudRect:{value:new THREE.Vector4(-6000,-6000,1/12000,1/12000)},uCloudProjection:{value:new THREE.Vector2()}};

export function createCloudShadows(renderer){
 const tier=renderer.ascentQuality.name,size=tier==='high'?256:tier==='lite'?128:192,steps=tier==='high'?12:tier==='lite'?6:8,interval=tier==='high'?.25:tier==='lite'?1:.5;
 const targets=Array.from({length:2},()=>new THREE.WebGLRenderTarget(size,size,{type:THREE.HalfFloatType,depthBuffer:false}));
 const sun={value:new THREE.Vector3(0,1,0)},time={value:0},storm={value:0};
 const quad=new FullScreenQuad(new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{uNoise:noiseUniform,uTime:time,uStorm:storm,uShadowSun:sun},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
 varying vec2 vUv;uniform vec3 uShadowSun;uniform float uTime,uStorm;
 ${noiseGLSL}
 ${cloudDensityGLSL}
 void main(){
  vec2 ground=(vUv-.5)*12000.;float transmission=1.,dy=630./${steps}.;
  vec3 slope=uShadowSun/max(uShadowSun.y,.08);
  for(int i=0;i<${steps};i++){
   float height=620.+(float(i)+.5)*dy;
   vec3 p=vec3(ground.x,0.,ground.y)+slope*height;p.y=height;
   transmission*=exp(-density(p)*dy/max(uShadowSun.y,.08)*.007);
  }
  gl_FragColor=vec4(vec3(transmission),1.);
 }`}));
 let index=0,lastTime=-Infinity,lastStorm=-1,initialized=false;const lastSun=new THREE.Vector3(),stats={size,steps,interval,updates:0};
 cloudShadowUniforms.uCloudShadow.value=targets[0].texture;cloudShadowUniforms.uCloudPrevious.value=targets[0].texture;
 return {targets,stats,setEnabled(enabled){cloudShadowUniforms.uCloudShadowEnabled.value=enabled?1:0;},update(t,direction,weather){
  cloudShadowUniforms.uCloudProjection.value.set(direction.x,direction.z).multiplyScalar(1/Math.max(direction.y,.08));
  cloudShadowUniforms.uCloudBlend.value=tier==='high'?THREE.MathUtils.smoothstep(t-lastTime,0,interval):1;
  const force=!initialized||lastSun.distanceToSquared(direction)>.001||Math.abs(weather-lastStorm)>.05;
  if(!force&&t-lastTime<interval)return;
  const target=targets[index],previous=renderer.getRenderTarget();sun.value.copy(direction);time.value=t;storm.value=weather;
  try{renderer.setRenderTarget(target);quad.render(renderer);}finally{renderer.setRenderTarget(previous);}
  cloudShadowUniforms.uCloudPrevious.value=force?target.texture:targets[1-index].texture;
  cloudShadowUniforms.uCloudShadow.value=target.texture;cloudShadowUniforms.uCloudBlend.value=force?1:0;if(!initialized)cloudShadowUniforms.uCloudShadowEnabled.value=1;
  index=1-index;initialized=true;lastTime=t;lastStorm=weather;lastSun.copy(direction);stats.updates++;
 }};
}

export function cloudShadowGLSL(high){return `uniform sampler2D uCloudShadow,uCloudPrevious;uniform float uCloudBlend,uCloudShadowEnabled;uniform vec4 uCloudRect;uniform vec2 uCloudProjection;
 float cloudGroundShadow(vec3 world){
  vec2 uv=(world.xz-world.y*uCloudProjection-uCloudRect.xy)*uCloudRect.zw;
  float edge=(1.-smoothstep(.43,.5,max(abs(uv.x-.5),abs(uv.y-.5))))*(1.-smoothstep(550.,1000.,world.y));
  if(uCloudShadowEnabled<.5||edge<=0.)return 1.;
  float shade=texture2D(uCloudShadow,uv).r;
  ${high?'shade=mix(texture2D(uCloudPrevious,uv).r,shade,uCloudBlend);':''}
  return mix(1.,shade,edge*.85);
 }
 `;}

export function applyCloudShadows(shader,high,worldVarying){
 Object.assign(shader.uniforms,cloudShadowUniforms);
 shader.fragmentShader=cloudShadowGLSL(high)+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin);
 shader.fragmentShader=shader.fragmentShader.replace('IncidentLight directLight;',`float cloudVisibility=cloudGroundShadow(${worldVarying});\nIncidentLight directLight;`).replace(/getDirectionalLightInfo\([^;]+;/g,'$&\n directLight.color*=cloudVisibility;');
}
