// Frame pipeline: sky LUT -> terrain shadow heights -> cascades -> jittered HDR scene -> volumetrics
// -> transparents -> temporal upsample to display resolution -> post.
import * as THREE from 'three';
import { U, G } from './shared.js';
import { makeRT } from './fsq.js';
import { Post } from '../post/post.js';
import { TAA } from '../post/taa.js';

export class Pipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.post = new Post(renderer);
    this.taa = new TAA(renderer);
    this.scale = 1;
    this.main = null;
    this.hooks = { volumetrics: null, transparent: null };
  }
  setSize(w, h, pr) {
    this.pr = pr;
    const W = Math.max(2, Math.floor(w * pr * this.scale)), H = Math.max(2, Math.floor(h * pr * this.scale));
    // the temporal pass rebuilds the image at the canvas's own resolution
    const out = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (out.x !== this.OW || out.y !== this.OH) {
      this.OW = out.x; this.OH = out.y;
      this.taa.setSize(out.x, out.y);
      this.post.setSize(out.x, out.y);
    }
    if (this.main && this.main.width === W && this.main.height === H) return;
    if (this.main) this.main.dispose();
    this.main = makeRT(W, H, { depth: true, depthTexture: true });
    this.W = W; this.H = H;
    this.onResize && this.onResize(W, H);
  }
  render(scene, camera, look, time) {
    const r = this.renderer;
    this.taa.jitter(camera, this.W, this.H);
    U.uTAAFrame.value = this.taa.frame % 64;
    camera.layers.set(0);
    r.setRenderTarget(this.main);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    if (this.hooks.volumetrics) this.hooks.volumetrics(this.main);
    if (this.hooks.transparent) {
      r.setRenderTarget(this.main);
      camera.layers.set(4);
      r.render(scene, camera);
      camera.layers.set(0);
    }
    this.taa.unjitter(camera);
    const res = this.taa.resolve(this.main, camera, look.exposure);
    this.post.render(res.texture, look, time);
  }
}
