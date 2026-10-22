import {THREE} from './core.js';
import {QUALITY_TIERS} from './quality.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';

// Only scene geometry needs multisampling. Keep the HDR post-processing buffers
// single-sampled, and resolve color and depth before volumetric fog reads them.
export class SceneRenderPass extends RenderPass {
 constructor(scene,camera,renderer){
  super(scene,camera);
  this.target=new THREE.WebGLRenderTarget(1,1,{
   type:THREE.HalfFloatType,
   samples:Math.min((renderer.ascentQuality??QUALITY_TIERS.medium).samples,renderer.capabilities.maxSamples),
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

// Preserve native CSS resolution within the tier's budget. Oversized windows
// use a fixed pixel cap, rather than exceeding it or oscillating below native.
// Ordinary 1440 x 900 views keep the floor that stabilizes thin branches.
export function renderPixelRatio(width,height,dpr,quality=1,tier=QUALITY_TIERS.medium){
 const cap=Math.sqrt(tier.pixelBudget/(width*height)),floor=Math.min(1,cap);
 const native=Math.max(floor,Math.min(dpr,tier.maxDpr,cap));
 return Math.max(floor,native*Math.sqrt(.7+.3*quality));
}
