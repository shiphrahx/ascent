// Depth-only render-target copies need no pixel-unpack state. Three's general
// texture copy reads five GL parameters even for this GPU-to-GPU blit; those
// synchronous queries can drain the command queue on ANGLE.
export function copyShadowDepth(renderer,source,target){
 const gl=renderer.getContext(),state=renderer.state,previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),level=renderer.getActiveMipmapLevel();
 const from=renderer.properties.get(source).__webglFramebuffer,to=renderer.properties.get(target).__webglFramebuffer;
 if(!from||!to||source.samples||target.samples)throw Error('Shadow copy requires initialized single-sample render targets');
 try{
  state.bindFramebuffer(gl.READ_FRAMEBUFFER,from);state.bindFramebuffer(gl.DRAW_FRAMEBUFFER,to);
  gl.blitFramebuffer(0,0,source.width,source.height,0,0,target.width,target.height,gl.DEPTH_BUFFER_BIT,gl.NEAREST);
 }finally{
  state.bindFramebuffer(gl.READ_FRAMEBUFFER,null);state.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);renderer.setRenderTarget(previous,face,level);
 }
}
