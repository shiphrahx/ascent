import {THREE} from './core.js';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {histogramExposure,adaptExposure} from './exposure-histogram.js';

export function createAutoExposure(renderer,sceneTarget){
 const width=renderer.ascentQuality.name==='lite'?16:32,height=width*9/16;
 const target=new THREE.WebGLRenderTarget(width,height,{type:THREE.UnsignedByteType,depthBuffer:false});
 const quad=new FullScreenQuad(new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{source:{value:sceneTarget.texture},depth:{value:sceneTarget.depthTexture},spacing:{value:new THREE.Vector2(1/width,1/height)}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:`varying vec2 vUv;uniform sampler2D source,depth;uniform vec2 spacing;
  void main(){vec3 radiance=vec3(0.);float weight=0.;
   for(int i=0;i<4;i++){
    vec2 offset=vec2(float(i%2)-.5,float(i/2)-.5)*spacing*.65;
    vec2 uv=clamp(vUv+offset,vec2(0.),vec2(1.));
    float w=texture2D(depth,uv).r<.99999?1.:.12;
    radiance+=texture2D(source,uv).rgb*w;weight+=w;
   }
   float luminance=dot(radiance/max(weight,.001),vec3(.2126,.7152,.0722));
   float encoded=clamp((log2(max(luminance,.000244140625))+12.)/24.,0.,1.);
   float centre=1.-dot(vUv-.5,vUv-.5);
   gl_FragColor=vec4(encoded,weight*.25*centre,0.,1.);
  }` }));
 const pixels=new Uint8Array(width*height*4);
 let value=.88,desired=.88,previous=performance.now(),lastSample=-Infinity,pending=false,fixed=null,generation=0,disposed=false;
 const stats={samples:0,pending:false,target:desired,value,meanEV:null,error:null,width,height};
 return {stats,
  update(){const now=performance.now();if(fixed===null)value=adaptExposure(value,desired,(now-previous)/1000);else value=fixed;previous=now;renderer.toneMappingExposure=value;stats.value=value;},
  sample(){
   const now=performance.now();if(disposed||fixed!==null||pending||stats.error||now-lastSample<150)return;
   lastSample=now;const saved=renderer.getRenderTarget(),version=generation;
   renderer.setRenderTarget(target);quad.render(renderer);renderer.setRenderTarget(saved);
   pending=stats.pending=true;
   const read=renderer.readRenderTargetPixelsAsync(target,0,0,width,height,pixels);
   // Three leaves the PBO bound while waiting on its fence. Ordinary captures
   // and validation readbacks must remain legal during this asynchronous wait.
   const gl=renderer.getContext();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
   read.then(()=>{
    if(disposed||version!==generation)return;
    const result=histogramExposure(pixels);desired=result.target;stats.target=desired;stats.meanEV=result.meanEV;stats.samples++;
   }).catch(error=>{stats.error=String(error);}).finally(()=>{pending=stats.pending=false;});
  },
  setFixed(exposure=null){if(exposure!==null&&(!Number.isFinite(exposure)||exposure<=0))throw Error('Exposure must be positive');fixed=exposure;generation++;lastSample=-Infinity;if(fixed!==null)value=fixed;},
  dispose(){disposed=true;target.dispose();quad.dispose();}
 };
}
