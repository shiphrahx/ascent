import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

// Blend small lighting fields once on the GPU. Surface shaders still fetch one
// texture. Snapshot the displayed field before a refresh, including mid-fades.
export function createTextureTransition(renderer,width,height,{mapping=THREE.UVMapping}={}){
 const settings={type:THREE.HalfFloatType,depthBuffer:false};
 const previous=new THREE.WebGLRenderTarget(width,height,settings),output=new THREE.WebGLRenderTarget(width,height,settings);
 output.texture.mapping=mapping;
 const uniforms={old:{value:null},fresh:{value:null},amount:{value:1}};
 const quad=new FullScreenQuad(new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms,
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:'varying vec2 vUv;uniform sampler2D old,fresh;uniform float amount;void main(){gl_FragColor=mix(texture2D(old,vUv),texture2D(fresh,vUv),amount);}'}));
 let started=0,duration=1,source=null,ready=false,complete=false;
 const stats={frames:0,transitions:0,amount:1};
 function draw(target,a,b,f){const saved=renderer.getRenderTarget();uniforms.old.value=a;uniforms.fresh.value=b;uniforms.amount.value=f;try{renderer.setRenderTarget(target);quad.render(renderer);}finally{renderer.setRenderTarget(saved);}}
 return {output,previous,stats,
  snapshot(){if(ready)draw(previous,output.texture,output.texture,1);},
  start(texture,time,seconds=1,immediate=false){
   source=texture;started=time;duration=seconds;complete=false;stats.transitions++;
   if(!ready||immediate){draw(output,source,source,1);draw(previous,source,source,1);ready=true;complete=true;stats.amount=1;}
  },
  update(time){if(!ready||complete)return;const x=THREE.MathUtils.clamp((time-started)/duration,0,1),f=x*x*(3-2*x);draw(output,previous.texture,source,f);stats.frames++;stats.amount=f;complete=x===1;},
  dispose(){previous.dispose();output.dispose();quad.dispose();}
 };
}
