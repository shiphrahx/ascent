import {THREE} from './core.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';

// Only scene geometry needs multisampling. Keep the HDR post-processing buffers
// single-sampled, and resolve color and depth before volumetric fog reads them.
export class SceneRenderPass extends RenderPass {
 constructor(scene,camera,renderer){
  super(scene,camera);
  this.target=new THREE.WebGLRenderTarget(1,1,{
   type:THREE.HalfFloatType,
   samples:Math.min(4,renderer.capabilities.maxSamples),
   depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType),
   resolveDepthBuffer:true
  });
  this.target.texture.name='Multisampled scene';
 }
 render(renderer){
  super.render(renderer,null,this.target);
  renderer.setRenderTarget(null);
 }
 setSize(width,height){this.target.setSize(Math.max(1,Math.floor(width)),Math.max(1,Math.floor(height)));}
 dispose(){this.target.dispose();}
}

// Preserve at least one rendered pixel per CSS pixel. The old 0.7 floor caused
// thin branches to disappear as automatic quality changes reduced resolution.
export function renderPixelRatio(width,height,dpr,quality=1){
 const native=Math.max(1,Math.min(dpr,2,Math.sqrt(2800000/(width*height))));
 return Math.max(1,native*Math.sqrt(.7+.3*quality));
}
