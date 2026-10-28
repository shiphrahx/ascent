import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

// Depth reprojection and neighbourhood clipping follow the principles in
// Playdead's GDC 2016 presentation: https://www.gdcvault.com/play/1022970/
// Opaque moving actors mark scene alpha as reactive. They keep current-frame
// detail; static terrain and wind-blown branches can accumulate subpixel coverage.
// MSAA supplies coverage without projection jitter. Static surfaces retain
// reprojected history at every ordinary camera speed; depth and variance clipping
// reject disocclusion, while reactive alpha excludes moving actors.
export function markTemporalReactive(roots){
 const visited=new Set();
 for(const root of roots)root.traverse(object=>{
  for(const material of [].concat(object.material??[])){
   if(!material.isMeshStandardMaterial||material.transparent||visited.has(material))continue;
   visited.add(material);
   const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
   material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.a=0.0;');
   };
   material.customProgramCacheKey=()=>key+'-temporal-reactive';
  }
 });
}

export class TemporalResolvePass extends Pass{
 constructor(camera,depth){
  super();this.camera=camera;this.valid=false;this.prepared=false;this.wasEnabled=true;
  this.size=new THREE.Vector2(1,1);this.baseProjection=new THREE.Matrix4();
  this.previousViewProjection=new THREE.Matrix4();this.previousEye=new THREE.Vector3();this.previousRotation=new THREE.Quaternion();
  this.projectionKey='';this.previousHour=null;this.previousStorm=0;this.fade=0;
  this.stats={frames:0,resets:0,lastReset:'initial',usedHistory:false};
  this.history=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  this.history.texture.name='Temporal color and linear depth';
  this.uniforms={tCurrent:{value:null},tHistory:{value:this.history.texture},tDepth:{value:depth},
   uSize:{value:this.size},uInvProjection:{value:new THREE.Matrix4()},uCameraWorld:{value:new THREE.Matrix4()},
   uPreviousViewProjection:{value:this.previousViewProjection},uHistoryValid:{value:0},uFar:{value:camera.far}};
  this.material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:this.uniforms,
   vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
   fragmentShader:`
varying vec2 vUv;
uniform sampler2D tCurrent,tHistory,tDepth;
uniform vec2 uSize;
uniform mat4 uInvProjection,uCameraWorld,uPreviousViewProjection;
uniform float uHistoryValid,uFar;
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 compressColor(vec3 c){return c/(1.+luma(c));}
vec3 expandColor(vec3 c){return c/max(1.-luma(c),.001);}
vec3 toYCoCg(vec3 c){return vec3(c.r*.25+c.g*.5+c.b*.25,c.r*.5-c.b*.5,-c.r*.25+c.g*.5-c.b*.25);}
vec3 fromYCoCg(vec3 c){return vec3(c.x+c.y-c.z,c.x+c.z,c.x-c.y-c.z);}
vec3 sampleHistory(vec2 uv){
 vec2 p=uv*uSize,center=floor(p-.5)+.5,f=p-center;
 vec2 w0=f*(-.5+f*(1.-.5*f));
 vec2 w1=1.+f*f*(-2.5+1.5*f);
 vec2 w2=f*(.5+f*(2.-1.5*f));
 vec2 w3=f*f*(-.5+.5*f),w12=w1+w2;
 vec2 p0=(center-1.)/uSize,p12=(center+w2/w12)/uSize,p3=(center+2.)/uSize;
 vec3 c=vec3(0.);
 c+=textureLod(tHistory,vec2(p0.x,p0.y),0.).rgb*w0.x*w0.y;
 c+=textureLod(tHistory,vec2(p12.x,p0.y),0.).rgb*w12.x*w0.y;
 c+=textureLod(tHistory,vec2(p3.x,p0.y),0.).rgb*w3.x*w0.y;
 c+=textureLod(tHistory,vec2(p0.x,p12.y),0.).rgb*w0.x*w12.y;
 c+=textureLod(tHistory,p12,0.).rgb*w12.x*w12.y;
 c+=textureLod(tHistory,vec2(p3.x,p12.y),0.).rgb*w3.x*w12.y;
 c+=textureLod(tHistory,vec2(p0.x,p3.y),0.).rgb*w0.x*w3.y;
 c+=textureLod(tHistory,vec2(p12.x,p3.y),0.).rgb*w12.x*w3.y;
 c+=textureLod(tHistory,vec2(p3.x,p3.y),0.).rgb*w3.x*w3.y;
 return max(c,vec3(0.));
}
void main(){
 vec2 texel=1./uSize,uv=vUv;
 vec4 source=textureLod(tCurrent,uv,0.);
 float depth=textureLod(tDepth,uv,0.).r;
 // Use the closest surface at silhouettes so background samples adjacent to
 // thin branches follow the branch motion instead of retaining stale coverage.
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)depth=min(depth,textureLod(tDepth,uv+vec2(float(x),float(y))*texel,0.).r);
 vec4 view=uInvProjection*vec4(uv*2.-1.,depth*2.-1.,1.);view/=max(view.w,.0000001);
 float linearDepth=clamp(-view.z,0.,60000.);
 vec4 world=uCameraWorld*view;
 bool sky=depth>=.9999999;
 vec4 previous=uPreviousViewProjection*world;
 vec2 previousUV=previous.xy/max(previous.w,.00001)*.5+.5;
 bool inside=previous.w>0.&&all(greaterThanEqual(previousUV,vec2(0.)))&&all(lessThanEqual(previousUV,vec2(1.)));
 float stable=step(.999,source.a)*(1.-step(1.001,source.a));
 float depthTolerance=max(.06,previous.w*.002)+min(fwidth(previous.w)*1.25,previous.w*.02);
 vec3 resolved=source.rgb;
 // Do not reproject a missing MSAA depth sample as sky. Thin branches may
 // contribute color while the particular resolved depth sample misses them.
 if(uHistoryValid>.5&&inside&&!sky&&stable>.5){
 vec3 history=sampleHistory(clamp(previousUV,texel*.5,1.-texel*.5));
 ivec2 oldPixel=ivec2(clamp(previousUV*uSize,vec2(0.),uSize-1.));
 float historyDepth=texelFetch(tHistory,oldPixel,0).a;
 bool sameSurface=abs(historyDepth-previous.w)<depthTolerance;
 vec3 current=toYCoCg(compressColor(max(source.rgb,vec3(0.))));
 vec3 minimum=current,maximum=current,mean=vec3(0.),moment=vec3(0.);
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec3 tap=toYCoCg(compressColor(max(textureLod(tCurrent,uv+vec2(float(x),float(y))*texel,0.).rgb,vec3(0.))));
  minimum=min(minimum,tap);maximum=max(maximum,tap);mean+=tap;moment+=tap*tap;
 }
 mean/=9.;vec3 sigma=sqrt(max(moment/9.-mean*mean,vec3(0.)));
 minimum=max(minimum,mean-sigma*2.5);maximum=min(maximum,mean+sigma*2.5);
 vec3 old=toYCoCg(compressColor(history));
 vec3 center=(minimum+maximum)*.5,extent=max((maximum-minimum)*.5,vec3(.0001));
 vec3 delta=old-center;vec3 ratio=abs(delta/extent);
 old=center+delta/max(1.,max(ratio.x,max(ratio.y,ratio.z)));
 // High-contrast silhouettes need more current coverage; broad surfaces can
 // accumulate strongly. Confidence depends on local contrast, not camera speed.
 float edge=maximum.x-minimum.x;
 float feedback=mix(.9,.25,smoothstep(.03,.16,edge));
 // Alpha below one marks moving opaque actors. Bright additive flames also
 // reject history. Depth and clipping reject newly exposed background pixels.
 feedback*=step(0.,historyDepth)*(sameSurface?1.:0.);
 resolved=mix(source.rgb,expandColor(max(fromYCoCg(old),vec3(0.))),feedback);
 }
 gl_FragColor=vec4(resolved,(sky?uFar:linearDepth)*(stable>.5?1.:-1.));
}`});
  this.quad=new FullScreenQuad(this.material);
  this.copyQuad=new FullScreenQuad(new THREE.ShaderMaterial({depthTest:false,depthWrite:false,
   uniforms:{source:{value:null}},vertexShader:this.material.vertexShader,
   fragmentShader:'varying vec2 vUv;uniform sampler2D source;void main(){gl_FragColor=textureLod(source,vUv,0.);}'}));
 }
 invalidate(reason){this.valid=false;this.stats.resets++;this.stats.lastReset=reason;}
 updateState(hour,storm,fade){
  if(this.previousHour!==null){const h=Math.abs(hour-this.previousHour),jump=Math.min(h,24-h);if(jump>.08||Math.abs(storm-this.previousStorm)>.08)this.invalidate('lighting change');}
  this.previousHour=hour;this.previousStorm=storm;this.fade=fade;
 }
 beginFrame(){
  if(this.prepared)this.endFrame();
  if(this.enabled!==this.wasEnabled){this.invalidate('toggle');this.wasEnabled=this.enabled;}
  if(!this.enabled)return;
  const c=this.camera,key=[c.fov,c.aspect,c.near,c.far].join(',');
  if(key!==this.projectionKey){this.invalidate('projection');this.projectionKey=key;}
  if(this.valid&&(c.position.distanceToSquared(this.previousEye)>100||c.quaternion.angleTo(this.previousRotation)>.2))this.invalidate('camera cut');
  this.baseProjection.copy(c.projectionMatrix);
  this.prepared=true;
 }
 endFrame(){
  this.prepared=false;
 }
 render(renderer,writeBuffer,readBuffer){
  const c=this.camera,u=this.uniforms;
  if(!this.prepared)this.beginFrame();
  u.tCurrent.value=readBuffer.texture;u.uInvProjection.value.copy(c.projectionMatrixInverse);u.uCameraWorld.value.copy(c.matrixWorld);
  u.uHistoryValid.value=this.valid&&this.fade<.001?1:0;u.uFar.value=Math.min(c.far,60000);
  this.stats.usedHistory=u.uHistoryValid.value===1;
  renderer.initRenderTarget(this.history);renderer.setRenderTarget(writeBuffer);this.quad.render(renderer);
  // Keep the copy entirely on the GPU. copyTextureToTexture queries unpack
  // state and synchronizes CPU/GPU work on ANGLE, stalling a busy live scene.
  // One history target is sufficient: resolve to the composer, then copy back.
  this.copyQuad.material.uniforms.source.value=writeBuffer.texture;
  renderer.setRenderTarget(this.history);this.copyQuad.render(renderer);
  this.previousViewProjection.multiplyMatrices(this.baseProjection,c.matrixWorldInverse);
  this.previousEye.copy(c.position);this.previousRotation.copy(c.quaternion);
  this.valid=true;this.stats.frames++;this.endFrame();
 }
 setSize(width,height){
  width=Math.max(1,Math.floor(width));height=Math.max(1,Math.floor(height));
  if(width===this.size.x&&height===this.size.y)return;
  this.size.set(width,height);this.history.setSize(width,height);this.invalidate('resize');
 }
 dispose(){this.history.dispose();this.material.dispose();this.quad.dispose();this.copyQuad.material.dispose();this.copyQuad.dispose();}
}
