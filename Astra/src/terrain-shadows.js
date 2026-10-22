import * as THREE from 'three';
import {bakeTerrainShadowField} from './terrain-shadow-field.js';

const uniforms={uTerrainShadowEnabled:{value:0},uTerrainHorizon:{value:null},uHorizonSun:{value:new THREE.Vector2()},uHorizonRect:{value:new THREE.Vector4(-16384,-16384,1/32768,1/32768)},uHorizonTexel:{value:1}};
export function createTerrainShadows(heightAt,renderer){
 const tier=renderer.ascentQuality.name,gl=renderer.getContext(),size=Math.min(tier==='high'?256:128,gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)),directions=tier==='high'?16:8;
 const started=performance.now(),field=bakeTerrainShadowField({heightAt,bounds:[-16384,-16384,16384,16384],size,directions});
 const encoded=new Uint16Array(field.data.length);
 for(let i=0;i<encoded.length;i++)encoded[i]=THREE.DataUtils.toHalfFloat(field.data[i]);
 const texture=new THREE.Data3DTexture(encoded,size,size,directions);
 texture.format=THREE.RGBAFormat;texture.type=THREE.HalfFloatType;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.wrapR=THREE.RepeatWrapping;texture.needsUpdate=true;
 uniforms.uTerrainHorizon.value=texture;uniforms.uHorizonTexel.value=1/size;uniforms.uTerrainShadowEnabled.value=1;
 const stats={size,directions,bytes:encoded.byteLength,bakeMs:performance.now()-started};
 return {texture,stats,setEnabled(enabled){uniforms.uTerrainShadowEnabled.value=enabled?1:0;},update(light){
  if(!light)return;const s=light.direction;
  uniforms.uHorizonSun.value.set(Math.atan2(s.z,s.x)/(2*Math.PI)+.5/directions,s.y/Math.max(.001,Math.hypot(s.x,s.z)));
 }};
}

export function applyTerrainShadows(shader,worldVarying){
 Object.assign(shader.uniforms,uniforms);
 // Reuse the surface shader's world position instead of exporting another
 // interpolator on every vertex. Lower tiers restrict this to static stone.
 shader.fragmentShader=`uniform float uTerrainShadowEnabled,uHorizonTexel;
 uniform highp sampler3D uTerrainHorizon;
 uniform vec2 uHorizonSun;uniform vec4 uHorizonRect;
 float distantTerrainShadow(float viewDepth,vec3 world){
  float distanceFade=smoothstep(1600.,1900.,viewDepth);
  if(uTerrainShadowEnabled<.5||distanceFade<=0.)return 1.;
  vec2 uv=(world.xz-uHorizonRect.xy)*uHorizonRect.zw;
  float edge=1.-smoothstep(.46,.5,max(abs(uv.x-.5),abs(uv.y-.5)));
  if(edge<=0.)return 1.;
  vec4 horizon=texture(uTerrainHorizon,vec3(uv*(1.-uHorizonTexel)+uHorizonTexel*.5,uHorizonSun.x));
  float slope=horizon.r-max(0.,world.y-horizon.g)*horizon.b;
  float penumbra=max(.012,fwidth(slope)*1.5);
  return mix(1.,smoothstep(slope-penumbra,slope+penumbra,uHorizonSun.y),edge*distanceFade);
 }
 `+shader.fragmentShader;
 // Evaluate once, then attenuate only directional light. Local lamps, sky
 // illumination and emission must not acquire a terrain cast shadow.
 const lights=THREE.ShaderChunk.lights_fragment_begin.replace(/getDirectionalLightInfo\([^;]+;/g,'$&\n directLight.color*=terrainHorizonShadow;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',`float terrainHorizonShadow=distantTerrainShadow(vViewPosition.z,${worldVarying});\n`+lights);
}
