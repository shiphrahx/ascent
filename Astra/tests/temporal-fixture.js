import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {TemporalResolvePass,markTemporalReactive} from '../src/temporal.js';

const width=320,height=240;
const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(width,height);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(1,1,1);scene.add(new THREE.AmbientLight('white',Math.PI));
const camera=new THREE.PerspectiveCamera(45,width/height,.1,1000);camera.position.z=4;
const branches=new THREE.Group();scene.add(branches);
const dark=new THREE.MeshStandardMaterial({color:'#151515',roughness:1});
for(let i=0;i<27;i++){
 const line=new THREE.Mesh(new THREE.BoxGeometry(.0035+(i%3)*.002,1.7,.004),dark);
 line.position.set((i-13)*.09,Math.sin(i*2.7)*.12,0);line.rotation.z=(i%7-3)*.043;branches.add(line);
}
const actor=new THREE.Mesh(new THREE.BoxGeometry(.42,.7,.04),new THREE.MeshStandardMaterial({color:'#ef3418',roughness:1}));actor.position.z=.2;actor.visible=false;scene.add(actor);markTemporalReactive([actor]);
const input=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,samples:4,depthTexture:new THREE.DepthTexture(width,height,THREE.UnsignedIntType)});
const output=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,depthBuffer:false});
const reference=new THREE.WebGLRenderTarget(width*4,height*4,{type:THREE.HalfFloatType,samples:4});
const display=new THREE.WebGLRenderTarget(width,height,{depthBuffer:false});
const truth=new THREE.WebGLRenderTarget(width,height,{depthBuffer:false});
const copy=new FullScreenQuad(new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{map:{value:null},downsample:{value:false}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`varying vec2 vUv;uniform sampler2D map;uniform bool downsample;void main(){vec3 c=vec3(0.);if(downsample){ivec2 p=ivec2(gl_FragCoord.xy)*4;for(int y=0;y<4;y++)for(int x=0;x<4;x++)c+=texelFetch(map,p+ivec2(x,y),0).rgb;c/=16.;}else c=textureLod(map,vUv,0.).rgb;gl_FragColor=vec4(c,1.);}`}));
const temporal=new TemporalResolvePass(camera,input.depthTexture);temporal.setSize(width,height);temporal.updateState(8,0,0);
const actual=new Uint8Array(width*height*4),expected=new Uint8Array(width*height*4);
function present(texture,target,downsample=false){copy.material.uniforms.map.value=texture;copy.material.uniforms.downsample.value=downsample;renderer.setRenderTarget(target);copy.render(renderer);}
function frame(enabled,index,moving=false,speed=.0014,rotation=0,wind=0,actorSpeed=.045){
 temporal.enabled=enabled;camera.position.x=moving?0:-.035+index*speed;camera.rotation.y=index*rotation;camera.updateMatrixWorld();
 branches.position.x=Math.sin(index*.12)*wind;
 actor.visible=moving;branches.visible=!moving;if(moving)actor.position.x=-1.25+index*actorSpeed;
 temporal.beginFrame();renderer.setRenderTarget(input);renderer.render(scene,camera);renderer.setRenderTarget(null);
 if(enabled)temporal.render(renderer,output,input);
 present(enabled?output.texture:input.texture,display);renderer.readRenderTargetPixels(display,0,0,width,height,actual);
 renderer.setRenderTarget(reference);renderer.render(scene,camera);renderer.setRenderTarget(null);
 present(reference.texture,truth,true);renderer.readRenderTargetPixels(truth,0,0,width,height,expected);
 return {actual:actual.slice(),expected:expected.slice()};
}
window.runTemporalProbe=()=>{
 const results={cases:{}};
 for(const [name,speed,rotation,wind]of[['slow',.0014,0,0],['medium',.0056,0,0],['fast',.0224,0,0],['rotation',0,.0008,0],['stationary',0,0,0],['wind',0,0,.01]]){
 const pair={};
 for(const enabled of[false,true]){
  temporal.invalidate('test sequence');let squareError=0,flickerError=0,energy=0,referenceEnergy=0,count=0,lastError=null;
  for(let f=0;f<64;f++){
   const {actual,expected}=frame(enabled,f,false,speed,rotation,wind);if(f<12)continue;
   const errors=new Float32Array(width*height);
   for(let p=0;p<width*height;p++){
    const x=p%width,y=Math.floor(p/width);if(x<50||x>270||y<40||y>200)continue;
    const error=(actual[p*4]-expected[p*4])/255;errors[p]=error;squareError+=error*error;energy+=1-actual[p*4]/255;referenceEnergy+=1-expected[p*4]/255;
    if(lastError)flickerError+=(error-lastError[p])**2;count++;
   }lastError=errors;
  }
  pair[enabled?'temporal':'msaa']={rmse:Math.sqrt(squareError/count),flicker:Math.sqrt(flickerError/count),contrastRetention:energy/referenceEnergy};
 }
 results.cases[name]=pair;
 }
 Object.assign(results,results.cases.slow);
 results.actors=[];
 for(const speed of[.0014,.0056,.045]){
 temporal.invalidate('moving actor');let trail=0,trailCount=0,maxTrailError=0;const recent=[];
 for(let f=0;f<58;f++){
  const {actual,expected}=frame(true,f,true,0,0,0,speed);
  if(recent.length)for(let p=0;p<width*height;p++){
   const i=p*4;if(expected[i+1]>250&&recent.some(previous=>previous[i+1]<180)){
    const error=Math.abs(actual[i+1]-expected[i+1])/255;trail+=error;maxTrailError=Math.max(maxTrailError,error);trailCount++;
   }
  }recent.push(expected);if(recent.length>16)recent.shift();
 }
 results.actors.push({speed,trailError:trail/Math.max(1,trailCount),maxTrailError,pixels:trailCount});
 }
 temporal.enabled=true;camera.position.x=40;camera.updateMatrixWorld();temporal.beginFrame();renderer.setRenderTarget(input);renderer.render(scene,camera);renderer.setRenderTarget(null);temporal.render(renderer,output,input);
 results.cameraCut={usedHistory:temporal.stats.usedHistory,reason:temporal.stats.lastReset};
 temporal.updateState(12,0,0);results.lightingReset=!temporal.valid;
 frame(true,0);temporal.updateState(12,1,0);results.weatherReset=!temporal.valid;
 frame(false,0);frame(true,0);results.toggleReset=!temporal.stats.usedHistory;
 camera.fov=62;camera.updateProjectionMatrix();frame(true,0);results.projectionReset=!temporal.stats.usedHistory;
 temporal.setSize(300,220);results.resizeReset=!temporal.valid;
 return results;
};
window.__ready=true;
